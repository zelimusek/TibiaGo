# TibiaGo production recovery

The production helper uses the same SSH configuration as
`scripts/deploy-tibiago.py`.

## Create a consistent snapshot

Stop the game process before copying PGlite:

```powershell
python scripts/tibiago-ops.py maintenance-on
python scripts/tibiago-ops.py snapshot
```

`maintenance-on` saves the current crontab, disables only the TibiaGo
watchdog and gracefully stops every TibiaGo process, including a process which
loaded the map but failed before binding port 2436.

The snapshot is stored in both locations:

- Remote: `/home/zelek/tibiago-backups/`
- Local: `.production-backups/`

The helper verifies the remote tar archive, downloads it and compares its
local SHA-256 with the remote SHA-256.

## Start and verify

```powershell
python scripts/tibiago-ops.py start
python scripts/tibiago-ops.py maintenance-off
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

## Memory guard and reversible world optimization

Production uses two environment controls:

- `MEMORY_ALERT_RSS_MIB=1900` exposes the threshold in `/health`, stores its
  state in `memory.jsonl`, and writes one log message when the threshold is
  crossed or recovered.
- `TIBIAGO_LAZY_TILE_NEIGHBOURS=true` calculates walkable SQM neighbours only
  when pathfinding needs them instead of retaining an array on every tile.

Emergency rollback does not require a code rollback: change
`TIBIAGO_LAZY_TILE_NEIGHBOURS=false`, upload `.env`, and restart the server.

The production crontab must contain exactly one call to
`scripts/tibiago-watchdog.sh`. The watchdog uses an atomic lock, validates the
real listener on port 2436 and `/health`, waits for cold startup, and refuses to
start a duplicate PGlite owner.

Known-bad snapshots must be moved under
`/home/zelek/tibiago-backups/quarantine/` and never passed to
`restore-pgdata`.
