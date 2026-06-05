#!/usr/bin/env bash
# kill.sh — stop the daemon (:8770) and the Vite dev server (:5173).
set -u

killed=0
for port in 8770 5173; do
  pid=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1)
  if [ -n "${pid:-}" ]; then
    kill "$pid" 2>/dev/null && echo "stopped :$port (pid $pid)"
    killed=1
  fi
done

# uvicorn can linger on open websockets — force-kill anything still holding a port
sleep 1
for port in 8770 5173; do
  pid=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1)
  if [ -n "${pid:-}" ]; then
    kill -9 "$pid" 2>/dev/null && echo "force-killed :$port (pid $pid)"
  fi
done

[ "$killed" = 0 ] && echo "nothing was running"
exit 0
