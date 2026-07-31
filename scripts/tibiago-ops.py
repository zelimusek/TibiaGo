#!/usr/bin/env python3
"""Safe production operations for the TibiaGo MyDevil deployment."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import pathlib
import posixpath
import re
import sys
import time

import paramiko


ROOT = pathlib.Path(__file__).resolve().parents[1]
LOCAL_BACKUP_DIR = ROOT / ".production-backups"
REMOTE_BACKUP_DIR = "/home/zelek/tibiago-backups"
SNAPSHOT_NAME_PATTERN = re.compile(
    r"^tibiago-pre-memory-\d{8}-\d{6}\.tar\.gz$"
)
TIBIAGO_CRON_LINE = (
    "*/5 * * * * pgrep -f node.*server-production.js > /dev/null || "
    "(cd /home/zelek/tibiago && nohup node server-production.js "
    ">> logs/server.log 2>&1 &)"
)


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


def get_server_candidate_pids(client) -> list[int]:
    output = run_remote(
        client,
        "pgrep -f 'node.*server-production\\.js' || true",
    )
    return [
        int(line.strip())
        for line in output.splitlines()
        if line.strip().isdigit()
    ]


def cleanup_stray_processes(client) -> None:
    listening_pid = get_listening_pid(client)
    if listening_pid is None:
        raise RuntimeError("No healthy TibiaGo process is listening on port 2436.")

    strays = [
        pid
        for pid in get_server_candidate_pids(client)
        if pid != listening_pid
    ]
    if not strays:
        print("NO_STRAY_TIBIAGO_PROCESSES")
        return

    for pid in strays:
        run_remote(client, f"kill -TERM {pid}")

    for _ in range(15):
        time.sleep(1)
        remaining = [
            pid
            for pid in get_server_candidate_pids(client)
            if pid != listening_pid
        ]
        if not remaining:
            if get_listening_pid(client) != listening_pid:
                raise RuntimeError("The healthy TibiaGo listener changed during cleanup.")
            print("REMOVED_STRAY_TIBIAGO_PROCESSES " + " ".join(map(str, strays)))
            return

    raise RuntimeError(
        "Stray TibiaGo processes did not stop after SIGTERM: "
        + " ".join(map(str, remaining))
    )


def stop_all_server_processes(client) -> None:
    pids = get_server_candidate_pids(client)
    if not pids:
        print("TIBIAGO_ALREADY_STOPPED")
        return

    for pid in pids:
        run_remote(client, f"kill -TERM {pid}")

    for _ in range(15):
        time.sleep(1)
        remaining = get_server_candidate_pids(client)
        if not remaining:
            print("TIBIAGO_STOPPED_ALL " + " ".join(map(str, pids)))
            return

    raise RuntimeError(
        "TibiaGo processes did not stop after SIGTERM: "
        + " ".join(map(str, remaining))
    )


def maintenance_on(client) -> None:
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    backup = posixpath.join(
        REMOTE_BACKUP_DIR,
        f"crontab-pre-maintenance-{timestamp}.txt",
    )
    filtered = posixpath.join(
        REMOTE_BACKUP_DIR,
        f"crontab-maintenance-{timestamp}.txt",
    )
    run_remote(
        client,
        f"mkdir -p {REMOTE_BACKUP_DIR}; "
        f"crontab -l > {backup} 2>/dev/null || true; "
        f"grep -v 'server-production\\.js' {backup} > {filtered} || true; "
        f"crontab {filtered}",
    )
    stop_all_server_processes(client)
    print(f"MAINTENANCE_MODE_ON CRONTAB_BACKUP={backup}")


def maintenance_off(client) -> None:
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    merged = posixpath.join(
        REMOTE_BACKUP_DIR,
        f"crontab-restored-{timestamp}.txt",
    )
    run_remote(
        client,
        f"crontab -l > {merged} 2>/dev/null || true; "
        f"grep -q 'server-production\\.js' {merged} || "
        f"printf '%s\\n' '{TIBIAGO_CRON_LINE}' >> {merged}; "
        f"crontab {merged}",
    )
    print("MAINTENANCE_MODE_OFF")


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


def restore_pgdata(
    client,
    remote_root: str,
    archive_name: str | None,
    confirmation: str | None,
) -> None:
    if confirmation != "RESTORE_PGDATA":
        raise RuntimeError("Pass --confirm RESTORE_PGDATA to restore PGlite.")
    if archive_name is None or SNAPSHOT_NAME_PATTERN.fullmatch(archive_name) is None:
        raise RuntimeError("Invalid or missing snapshot archive name.")

    if get_listening_pid(client) is not None or get_server_candidate_pids(client):
        raise RuntimeError("Refusing to restore PGlite while a TibiaGo process exists.")

    timestamp = time.strftime("%Y%m%d-%H%M%S")
    archive = posixpath.join(REMOTE_BACKUP_DIR, archive_name)
    staging = f"/home/zelek/tibiago-pgdata-restore-{timestamp}"
    current = posixpath.join(remote_root, "data", "pgdata")
    preserved = posixpath.join(
        remote_root,
        "data",
        f"pgdata-corrupt-{timestamp}",
    )

    run_remote(
        client,
        "set -e; "
        f"test -f {archive}; "
        f"tar -tzf {archive} >/dev/null; "
        f"mkdir -p {staging}; "
        f"tar -xzf {archive} -C {staging} tibiago/data/pgdata; "
        f"test -d {staging}/tibiago/data/pgdata; "
        f"test -d {current}; "
        f"mv {current} {preserved}; "
        f"mv {staging}/tibiago/data/pgdata {current}; "
        f"echo PRESERVED_CORRUPT_PGDATA={preserved}",
    )
    print(f"PGDATA_RESTORED_FROM {archive_name}")


def verify_pgdata(client, remote_root: str) -> None:
    if get_listening_pid(client) is not None or get_server_candidate_pids(client):
        raise RuntimeError("Refusing an isolated PGlite check while TibiaGo is running.")

    javascript = (
        'const { PGlite } = require("@electric-sql/pglite"); '
        '(async () => { '
        'const db = new PGlite("data/pgdata"); '
        'const result = await db.query('
        '"select count(*)::int as count from accounts"'
        '); '
        'console.log(JSON.stringify(result.rows)); '
        'await db.close(); '
        '})().catch(error => { console.error(error); process.exit(1); });'
    )
    output = run_remote(
        client,
        f"cd {remote_root} && node -e '{javascript}'",
    )
    print(f"PGDATA_OK {output}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=(
            "status",
            "processes",
            "cleanup-strays",
            "hosting",
            "maintenance-on",
            "maintenance-off",
            "telemetry",
            "storage",
            "stop",
            "snapshot",
            "restore-pgdata",
            "verify-pgdata",
            "start",
        ),
    )
    parser.add_argument("--archive", help="Snapshot archive name for a restore")
    parser.add_argument("--confirm", help="Required explicit restore confirmation")
    args = parser.parse_args()

    deploy = load_deploy_module()
    client, config = connect(deploy)
    remote_root = config["remoteRoot"]
    try:
        if args.command == "status":
            status = process_status(client)
            print(status if status else "TIBIAGO_STOPPED")
        elif args.command == "cleanup-strays":
            cleanup_stray_processes(client)
        elif args.command == "hosting":
            print(
                run_remote(
                    client,
                    "echo DEVIL_WWW; devil www list 2>&1 || true; "
                    "echo DEVIL_DAEMON; devil daemon list 2>&1 || true; "
                    "echo CRONTAB; crontab -l 2>&1 || true",
                )
            )
        elif args.command == "maintenance-on":
            maintenance_on(client)
        elif args.command == "maintenance-off":
            maintenance_off(client)
        elif args.command == "processes":
            status = process_status(client)
            sockets = run_remote(
                client,
                "sockstat -4 -l 2>&1 | grep ':2436' || true",
            )
            candidates = run_remote(
                client,
                "pgrep -fl 'node.*server-production\\.js' || true",
            )
            print(status if status else "NO_PROCESS_ON_PORT_2436")
            print(sockets if sockets else "NO_SOCKET_ON_PORT_2436")
            if candidates:
                for line in candidates.splitlines():
                    candidate_pid = line.split(maxsplit=1)[0]
                    if candidate_pid.isdigit():
                        print(
                            run_remote(
                                client,
                                f"ps -ww -p {candidate_pid} "
                                "-o pid,ppid,rss,etime,args 2>/dev/null || true",
                            )
                        )
            else:
                print("NO_SERVER_PRODUCTION_CANDIDATES")
        elif args.command == "telemetry":
            print(
                run_remote(
                    client,
                    f"echo MEMORY_TELEMETRY; "
                    f"tail -n 5 {remote_root}/logs/memory.jsonl 2>&1 || true; "
                    f"echo SERVER_LOG; "
                    f"tail -n 40 {remote_root}/logs/server.log 2>&1 || true",
                )
            )
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
        elif args.command == "restore-pgdata":
            restore_pgdata(
                client,
                remote_root,
                args.archive,
                args.confirm,
            )
        elif args.command == "verify-pgdata":
            verify_pgdata(client, remote_root)
        elif args.command == "start":
            start_server(client, remote_root)
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
