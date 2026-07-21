#!/usr/bin/env python3
"""
deploy-tibiago.py

Deploys TibiaGo to MyDevil hosting at tibiago.cyrk.fun.
Uploads files to /home/zelek/tibiago/ (completely separate from cyrkgildia).

Usage:
    python scripts/deploy-tibiago.py              # Full deploy
    python scripts/deploy-tibiago.py --dry-run     # Preview only
    python scripts/deploy-tibiago.py --skip-restart # Upload without restart
    python scripts/deploy-tibiago.py --files server-production.js config.json  # Specific files
"""

import argparse
import json
import os
import posixpath
import sys
import time
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("Missing: paramiko. Install with: python -m pip install paramiko", file=sys.stderr)
    raise SystemExit(1)


ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_ENV_FILE = ROOT / ".env.production"

# Server connection details (same credentials as cyrkgildia)
CYRK_CONFIG = ROOT.parent / "cyrkgildia" / ".deploy-production.local.json"

DEFAULTS = {
    "host": "s87.mydevil.net",
    "user": "zelek",
    "remoteRoot": "/home/zelek/tibiago",
}

# Directories / files that should NOT be uploaded
BLOCKED_PREFIXES = (
    ".git/",
    ".agent/",
    "node_modules/",
    "assets/",
    "scripts/export",
    "data/pgdata/",
    "drizzle/",
    "tests/",
    "tools/",
    "server.log",
    ".env",
    ".env.example",
    ".dockerignore",
    "docker-compose.yml",
    "postgres-compose.yml",
    "Dockerfile",
    "nginx-system.conf",
    "ipcclient.js",
    "test.js",
    "packets.wal",
)

# Directories that MUST be uploaded
ALLOWED_PREFIXES = (
    "src/",
    "client/",
    "data/740/",
)

# Individual files to upload
ALLOWED_FILES = {
    "server-production.js",
    "engine.js",
    "login.js",
    "require.js",
    "config.json",
    "package.json",
    "package-lock.json",
    "client-server.py",
}


def load_config():
    config = dict(DEFAULTS)
    # Try loading password from cyrkgildia's deploy config
    if CYRK_CONFIG.exists():
        with CYRK_CONFIG.open("r", encoding="utf-8") as f:
            cyrk = json.load(f)
            if "password" in cyrk:
                config["password"] = cyrk["password"]
            if "host" in cyrk:
                config["host"] = cyrk["host"]
            if "user" in cyrk:
                config["user"] = cyrk["user"]

    # Environment variable overrides
    for key, env in {"host": "TIBIAGO_SSH_HOST", "user": "TIBIAGO_SSH_USER",
                      "password": "TIBIAGO_SSH_PASSWORD"}.items():
        val = os.environ.get(env)
        if val:
            config[key] = val
    return config


def load_production_env():
    """Return the production environment file uploaded as remote .env."""
    if not PRODUCTION_ENV_FILE.is_file():
        raise RuntimeError(
            f"Missing {PRODUCTION_ENV_FILE.name}. Create it before deploying."
        )

    content = PRODUCTION_ENV_FILE.read_text(encoding="utf-8")
    required = {"USE_EMBEDDED_DB", "EXTERNAL_HOST", "PORT"}
    defined = {
        line.split("=", 1)[0].strip()
        for line in content.splitlines()
        if line.strip() and not line.lstrip().startswith("#") and "=" in line
    }
    missing = required - defined
    if missing:
        raise RuntimeError(
            f"{PRODUCTION_ENV_FILE.name} is missing: {', '.join(sorted(missing))}"
        )
    return content


def collect_files():
    """Collect all files that should be deployed."""
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        # Skip hidden directories and node_modules
        dirnames[:] = [d for d in dirnames if not d.startswith('.') and d != 'node_modules'
                       and d != 'assets' and d != 'tools' and d != 'tests' and d != 'drizzle']

        for filename in filenames:
            full = Path(dirpath) / filename
            rel = full.relative_to(ROOT).as_posix()

            if is_blocked(rel):
                continue
            if is_allowed(rel):
                files.append(rel)

    return sorted(set(files))


def is_blocked(rel):
    for prefix in BLOCKED_PREFIXES:
        if rel.startswith(prefix) or rel == prefix.rstrip('/'):
            return True
    return False


def is_allowed(rel):
    if rel in ALLOWED_FILES:
        return True
    for prefix in ALLOWED_PREFIXES:
        if rel.startswith(prefix):
            return True
    return False


def validate_requested_files(files):
    """Reject missing, blocked, or out-of-scope paths passed through --files."""
    validated = []
    for requested in files:
        rel = requested.replace("\\", "/").lstrip("/")
        local_path = (ROOT / rel).resolve()
        try:
            local_path.relative_to(ROOT)
        except ValueError:
            raise RuntimeError(f"Refusing path outside the project: {requested}")
        if not local_path.is_file():
            raise RuntimeError(f"File does not exist: {requested}")
        if is_blocked(rel) or not is_allowed(rel):
            raise RuntimeError(f"File is not deployable: {requested}")
        validated.append(rel)
    return sorted(set(validated))


def ensure_remote_dir(sftp, remote_dir):
    parts = [p for p in remote_dir.strip("/").split("/") if p]
    current = ""
    for part in parts:
        current = f"{current}/{part}" if current else f"/{part}"
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def run_remote(client, command):
    print(f"  > {command}")
    _, stdout, stderr = client.exec_command(command, timeout=300)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(out.rstrip())
    if err:
        print(err.rstrip(), file=sys.stderr)
    if code != 0:
        raise RuntimeError(f"Remote command failed (exit {code}): {command}")


def main():
    parser = argparse.ArgumentParser(description="Deploy TibiaGo to tibiago.cyrk.fun")
    parser.add_argument("--files", nargs="*", help="Specific files to upload")
    parser.add_argument("--dry-run", action="store_true", help="Preview without uploading")
    parser.add_argument("--skip-install", action="store_true", help="Skip npm install")
    parser.add_argument("--skip-restart", action="store_true", help="Upload without restarting")
    parser.add_argument(
        "--accept-host-key",
        action="store_true",
        help="Accept an unknown SSH host key for this connection",
    )
    args = parser.parse_args()

    config = load_config()
    load_production_env()
    password = config.get("password")
    if not password and not args.dry_run:
        import getpass
        password = getpass.getpass(f"SSH password for {config['user']}@{config['host']}: ")

    # Collect files
    if args.files:
        files = validate_requested_files(args.files)
    else:
        files = collect_files()

    if not files:
        print("No files to deploy!", file=sys.stderr)
        return 1

    remote_root = config["remoteRoot"]
    print(f"Target: {config['user']}@{config['host']}:{remote_root}")
    print(f"Files to upload: {len(files)}")

    if len(files) <= 30:
        for f in files:
            print(f"  + {f}")
    else:
        for f in files[:10]:
            print(f"  + {f}")
        print(f"  ... and {len(files) - 10} more files")

    if args.dry_run:
        print("Dry run only. No files uploaded.")
        return 0

    # ─── Upload ──────────────────────────────────────────────────────────
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    known_hosts = Path.home() / ".ssh" / "known_hosts"
    if known_hosts.exists():
        client.load_host_keys(str(known_hosts))
    client.set_missing_host_key_policy(
        paramiko.AutoAddPolicy() if args.accept_host_key else paramiko.RejectPolicy()
    )
    client.connect(config["host"], username=config["user"], password=password, timeout=30)

    try:
        with client.open_sftp() as sftp:
            # Ensure base directory exists
            ensure_remote_dir(sftp, remote_root)

            uploaded = 0
            for rel in files:
                local_path = str(ROOT / rel)
                remote_path = posixpath.join(remote_root, rel)
                ensure_remote_dir(sftp, posixpath.dirname(remote_path))
                sftp.put(local_path, remote_path)
                uploaded += 1
                if uploaded % 50 == 0:
                    print(f"  uploaded {uploaded}/{len(files)}...")

            print(f"Uploaded {uploaded} files successfully.")

        # ─── Create .env on server ───────────────────────────────────────
        print("Uploading production environment...")
        with client.open_sftp() as sftp:
            remote_env = posixpath.join(remote_root, ".env")
            sftp.put(str(PRODUCTION_ENV_FILE), remote_env)
            sftp.chmod(remote_env, 0o600)

        # ─── npm install ─────────────────────────────────────────────────
        if not args.skip_install:
            print("Running npm ci on server (this may take a while)...")
            run_remote(client, f"cd {remote_root} && npm ci --omit=dev --no-audit --no-fund")

        # ─── Restart process ─────────────────────────────────────────────
        if not args.skip_restart:
            print("Restarting TibiaGo server...")
            # Kill any existing instance
            run_remote_safe(client, "pkill -f '[n]ode.*server-production\\.js' || true")
            # Wait a moment
            time.sleep(2)
            # Start in background
            run_remote(
                client,
                f"cd {remote_root} && mkdir -p logs && "
                "(nohup node server-production.js >> logs/server.log 2>&1 & "
                "echo $! > .server-production.pid)",
            )
            time.sleep(2)
            run_remote(client, f"curl -fsS --max-time 10 http://127.0.0.1:2436/health")
            print("TibiaGo server started and passed its health check!")

    finally:
        client.close()

    print("\n[OK] Deploy finished! Game is available at: https://tibiago.cyrk.fun")
    return 0


def run_remote_safe(client, command):
    """Run remote command, ignoring errors."""
    try:
        run_remote(client, command)
    except RuntimeError:
        pass


if __name__ == "__main__":
    raise SystemExit(main())
