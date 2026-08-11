#!/bin/sh

# Production watchdog for MyDevil/FreeBSD. It checks the actual listener and
# HTTP health instead of trusting a process name, and the atomic directory lock
# prevents overlapping cron runs from starting duplicate PGlite owners.

set -u

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
PORT="$(sed -n 's/^PORT=//p' "$ROOT/.env" | tail -n 1)"
INSTANCE="$(sed -n 's/^INSTANCE_NAME=//p' "$ROOT/.env" | tail -n 1)"
[ -n "$PORT" ] || exit 1
[ -n "$INSTANCE" ] || exit 1
LOCK_DIR="$ROOT/.watchdog.lock"
LOCK_PID="$LOCK_DIR/pid"
DEPLOY_LOCK="$ROOT/.deploying"

timestamp() {
  date -u "+%Y-%m-%dT%H:%M:%SZ"
}

server_pids() {
  pgrep -f "node.*server-production[.]js --instance $INSTANCE" 2>/dev/null || true
}

port_is_listening() {
  sockstat -4 -l 2>/dev/null | grep -q ":$PORT"
}

health_is_ok() {
  curl -fsS --max-time 10 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1
}

release_lock() {
  rm -f "$LOCK_PID"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

deploy_is_active() {
  [ -d "$DEPLOY_LOCK" ] || return 1
  now="$(date +%s)"
  changed="$(stat -f %m "$DEPLOY_LOCK" 2>/dev/null || echo 0)"
  age=$((now - changed))
  if [ "$changed" -gt 0 ] && [ "$age" -lt 900 ]; then
    return 0
  fi
  rm -f "$DEPLOY_LOCK/pid"
  rmdir "$DEPLOY_LOCK" 2>/dev/null || true
  return 1
}

# A deploy owns the restart lifecycle while this fresh marker exists. Check
# both before and after acquiring our own lock to close the race between the
# cron process and a manual CPD.
if deploy_is_active; then
  exit 0
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  owner=""
  if [ -f "$LOCK_PID" ]; then
    owner="$(cat "$LOCK_PID" 2>/dev/null || true)"
  fi
  if [ -n "$owner" ] && kill -0 "$owner" 2>/dev/null; then
    exit 0
  fi
  rm -f "$LOCK_PID"
  rmdir "$LOCK_DIR" 2>/dev/null || exit 0
  mkdir "$LOCK_DIR" 2>/dev/null || exit 0
fi

echo "$$" > "$LOCK_PID"
trap release_lock EXIT HUP INT TERM

if deploy_is_active; then
  exit 0
fi

if port_is_listening && health_is_ok; then
  exit 0
fi

# A normal cold start can take time while the map is being loaded. Give an
# existing candidate two minutes to become healthy before treating it as stale.
attempt=0
while [ "$attempt" -lt 24 ]; do
  if port_is_listening && health_is_ok; then
    echo "$(timestamp) recovered while waiting for startup"
    exit 0
  fi
  if [ -z "$(server_pids)" ]; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 5
done

pids="$(server_pids)"
if [ -n "$pids" ]; then
  echo "$(timestamp) stopping stale $INSTANCE candidates: $pids"
  for pid in $pids; do
    kill -TERM "$pid" 2>/dev/null || true
  done

  attempt=0
  while [ "$attempt" -lt 15 ] && [ -n "$(server_pids)" ]; do
    attempt=$((attempt + 1))
    sleep 1
  done

  remaining="$(server_pids)"
  if [ -n "$remaining" ]; then
    echo "$(timestamp) ERROR stale candidates refused to stop: $remaining"
    exit 1
  fi
fi

cd "$ROOT" || exit 1
rm -f "$ROOT/game.sock"
mkdir -p "$ROOT/logs"
nohup node server-production.js --instance "$INSTANCE" >> "$ROOT/logs/server.log" 2>&1 &
pid="$!"
echo "$pid" > "$ROOT/.server-production.pid"
echo "$(timestamp) started $INSTANCE PID $pid"

attempt=0
while [ "$attempt" -lt 60 ]; do
  if port_is_listening && health_is_ok; then
    echo "$(timestamp) $INSTANCE passed health check"
    exit 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "$(timestamp) ERROR $INSTANCE PID $pid exited during startup"
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "$(timestamp) ERROR $INSTANCE did not become healthy within 120 seconds"
exit 1
