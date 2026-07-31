#!/bin/sh

# Production watchdog for MyDevil/FreeBSD. It checks the actual listener and
# HTTP health instead of trusting a process name, and the atomic directory lock
# prevents overlapping cron runs from starting duplicate PGlite owners.

set -u

ROOT="/home/zelek/tibiago"
PORT="2436"
LOCK_DIR="$ROOT/.watchdog.lock"
LOCK_PID="$LOCK_DIR/pid"

timestamp() {
  date -u "+%Y-%m-%dT%H:%M:%SZ"
}

server_pids() {
  pgrep -f "node.*server-production[.]js" 2>/dev/null || true
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
  echo "$(timestamp) stopping stale TibiaGo candidates: $pids"
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
nohup node server-production.js >> "$ROOT/logs/server.log" 2>&1 &
pid="$!"
echo "$pid" > "$ROOT/.server-production.pid"
echo "$(timestamp) started TibiaGo PID $pid"

attempt=0
while [ "$attempt" -lt 60 ]; do
  if port_is_listening && health_is_ok; then
    echo "$(timestamp) TibiaGo passed health check"
    exit 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "$(timestamp) ERROR TibiaGo PID $pid exited during startup"
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "$(timestamp) ERROR TibiaGo did not become healthy within 120 seconds"
exit 1
