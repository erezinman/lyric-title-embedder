#!/usr/bin/env bash
# run.sh — start the daemon (:8770) + web dev server (:5173). Ctrl-C stops both.
set -u
cd "$(dirname "$0")"

./kill.sh >/dev/null   # idempotent: clear anything already on the ports

.venv/bin/python -m daemon --projects-dir projects --port 8770 &
DAEMON_PID=$!

cleanup() {
  kill "$DAEMON_PID" 2>/dev/null
  sleep 1
  kill -9 "$DAEMON_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# wait for the daemon to come up
for _ in $(seq 1 40); do
  curl -sf -o /dev/null http://127.0.0.1:8770/api/env && break
  sleep 0.25
done
echo "daemon ready on :8770 — opening web on http://localhost:5173"

npm --prefix web run dev    # foreground; Ctrl-C lands here, then cleanup()
cleanup
