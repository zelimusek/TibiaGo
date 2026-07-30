#!/usr/bin/env python3
"""Safe production operations for the TibiaGo MyDevil deployment."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import pathlib
import posixpath
import sys
import time

import paramiko


ROOT = pathlib.Path(__file__).resolve().parents[1]
LOCAL_BACKUP_DIR = ROOT / ".production-backups"
REMOTE_BACKUP_DIR = "/home/zelek/tibiago-backups"


def load_deploy_module():
    path = ROOT / "scripts" / "deploy-tibiago.py"
    spec = importlib.util.spec_from_file_location("deploy_tibiago", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def connect(deploy):
    config = deploy.load_config()
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    known_hosts = pathlib.Path.home() / ".ssh" / "known_hosts"
    if known_hosts.exists():
        client.load_host_keys(str(known_hosts))
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(
        config["host"],
        username=config["user"],
        password=config.get("password"),
        timeout=30,
    )
    return client, config


def run_remote(client, command: str, *, check: bool = True, timeout: int = 900) -> str:
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace").strip()
    error = stderr.read().decode("utf-8", "replace").strip()
    code = stdout.channel.recv_exit_status()
    if error:
        print(error, file=sys.stderr)
    if check and code != 0:
        raise RuntimeError(f"Remote command failed with exit code {code}: {command}")
    return output


def get_listening_pid(client) -> int | None:
    output = run_remote(
        client,
        "sockstat -4 -l 2>/dev/null | grep ':2436' || true",
    )
    for line in output.splitlines():
        fields = line.split()
        if len(fields) >= 3 and fields[2].isdigit():
            return int(fields[2])
    return None


def process_status(client) -> str:
    pid = get_listening_pid(client)
    if pid is None:
        return ""
    return run_remote(
        client,
        f"ps -ww -p {pid} -o pid,ppid,rss,etime,args 2>/dev/null || "
        f"echo '{pid} listening on port 2436'",
    )


def stop_server(client) -> None:
    pid = get_listening_pid(client)
    if pid is None:
        print("TIBIAGO_ALREADY_STOPPED")
        return

    # SIGTERM invokes GameServer.scheduleShutdown(), allowing character and
    # PGlite writes to finish before the process exits.
    run_remote(client, f"kill -TERM {pid}")
    for _ in range(15):
        time.sleep(1)
        if get_listening_pid(client) is None:
            print("TIBIAGO_STOPPED")
            return

    status = process_status(client)
    if status:
        raise RuntimeError(f"TibiaGo is still running after SIGTERM:\n{status}")
    print("TIBIAGO_STOPPED")


def start_server(client, remote_root: str) -> None:
    if process_status(client):
        print("TIBIAGO_ALREADY_RUNNING")
        return

    # This socket is owned by the game process and is safe to clear while the
    # process is confirmed as stopped. A stale socket otherwise causes a noisy
    # EADDRINUSE warning during startup.
    run_remote(
        client,
        f"cd {remote_root} && rm -f game.sock && mkdir -p logs && "
        "(nohup node server-production.js >> logs/server.log 2>&1 & "
        "echo $! > .server-production.pid)",
    )

    for _ in range(15):
        time.sleep(2)
        health = run_remote(
            client,
            "curl -fsS --max-time 10 http://127.0.0.1:2436/health",
            check=False,
        )
        if health:
            print(health)
            print("TIBIAGO_STARTED")
            return
    raise RuntimeError("TibiaGo did not pass its health check after startup.")


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def snapshot(client, config, remote_root: str) -> None:
    status = process_status(client)
    if status:
        raise RuntimeError(
            "Refusing to snapshot while TibiaGo is running. Stop it first.\n"
            f"{status}"
        )

    timestamp = time.strftime("%Y%m%d-%H%M%S")
    filename = f"tibiago-pre-memory-{timestamp}.tar.gz"
    remote_archive = posixpath.join(REMOTE_BACKUP_DIR, filename)

    print(f"Creating {remote_archive}...")
    run_remote(
        client,
        f"mkdir -p {REMOTE_BACKUP_DIR} && "
        f"tar -czf {remote_archive} "
        "--exclude='tibiago/node_modules' "
        "--exclude='tibiago/logs' "
        "--exclude='tibiago/game.sock' "
        "--exclude='tibiago/.server-production.pid' "
        "-C /home/zelek tibiago",
    )

    # Listing the complete archive catches truncation/corruption before the
    # maintenance window is closed.
    run_remote(client, f"tar -tzf {remote_archive} >/dev/null")
    remote_hash = run_remote(client, f"sha256 -q {remote_archive}").splitlines()[-1].strip()
    run_remote(
        client,
        f"printf '%s  %s\\n' '{remote_hash}' '{filename}' > "
        f"{remote_archive}.sha256",
    )

    LOCAL_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    local_archive = LOCAL_BACKUP_DIR / filename
    print(f"Downloading to {local_archive}...")
    with client.open_sftp() as sftp:
        sftp.get(remote_archive, str(local_archive))

    local_hash = sha256_file(local_archive)
    if local_hash != remote_hash:
        raise RuntimeError(
            "Downloaded snapshot checksum mismatch: "
            f"remote={remote_hash}, local={local_hash}"
        )

    checksum_file = local_archive.with_suffix(local_archive.suffix + ".sha256")
    checksum_file.write_text(f"{local_hash}  {filename}\n", encoding="ascii")
    size_mib = local_archive.stat().st_size / (1024 * 1024)
    print(f"SNAPSHOT_OK {filename} {size_mib:.1f} MiB SHA256={local_hash}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=("status", "processes", "storage", "stop", "snapshot", "start"),
    )
    args = parser.parse_args()

    deploy = load_deploy_module()
    client, config = connect(deploy)
    remote_root = config["remoteRoot"]
    try:
        if args.command == "status":
            status = process_status(client)
            print(status if status else "TIBIAGO_STOPPED")
        elif args.command == "processes":
            status = process_status(client)
            sockets = run_remote(
                client,
                "sockstat -4 -l 2>&1 | grep ':2436' || true",
            )
            print(status if status else "NO_PROCESS_ON_PORT_2436")
            print(sockets if sockets else "NO_SOCKET_ON_PORT_2436")
        elif args.command == "storage":
            print(
                run_remote(
                    client,
                    "id; "
                    "ls -ld /home/zelek /home/zelek/backups 2>&1 || true; "
                    "df -h /home/zelek 2>&1 || true; "
                    "quota -h 2>&1 || quota -v 2>&1 || true",
                )
            )
        elif args.command == "stop":
            stop_server(client)
        elif args.command == "snapshot":
            snapshot(client, config, remote_root)
        elif args.command == "start":
            start_server(client, remote_root)
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
