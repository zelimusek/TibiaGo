# TibiaGo production recovery

The production helper uses the same SSH configuration as
`scripts/deploy-tibiago.py`.

## Create a consistent snapshot

Stop the game process before copying PGlite:

```powershell
python scripts/tibiago-ops.py stop
python scripts/tibiago-ops.py snapshot
```

The snapshot is stored in both locations:

- Remote: `/home/zelek/tibiago-backups/`
- Local: `.production-backups/`

The helper verifies the remote tar archive, downloads it and compares its
local SHA-256 with the remote SHA-256.

## Start and verify

```powershell
python scripts/tibiago-ops.py start
python scripts/tibiago-ops.py status
```

After startup, verify:

1. `/health` returns `status: ok` and memory statistics.
2. A character can log in, walk and log out.
3. The current map loads.
4. A configured radio zone starts and stops correctly.

## Manual rollback

Keep the failed release instead of deleting it:

```sh
pkill -f '[n]ode.*server-production\.js' || true
mv /home/zelek/tibiago /home/zelek/tibiago-failed-YYYYMMDD-HHMMSS
tar -xzf /home/zelek/tibiago-backups/SNAPSHOT.tar.gz -C /home/zelek
cd /home/zelek/tibiago
npm ci --omit=dev --no-audit --no-fund
rm -f game.sock
mkdir -p logs
nohup node server-production.js >> logs/server.log 2>&1 &
```

Do not remove the failed release until login and gameplay have been verified.

## Restore only PGlite

Use this only after testing the selected snapshot locally. The command refuses
to run while any TibiaGo process exists and preserves the current database as
`data/pgdata-corrupt-TIMESTAMP`.

```powershell
python scripts/tibiago-ops.py restore-pgdata `
  --archive tibiago-pre-memory-YYYYMMDD-HHMMSS.tar.gz `
  --confirm RESTORE_PGDATA
```

Start the server separately after the restore and verify that an invalid
account login returns HTTP 401 rather than crashing the process.
