#!/usr/bin/env bash
# run-desktop.sh — launch the Electron desktop shell (dev). Mirrors run.sh.
# Builds web/dist if missing, installs desktop deps if absent, then launches Electron.
# The Electron main process spawns + supervises the daemon; Ctrl-C quits and kills it.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ ! -f web/dist/index.html ]; then
  echo "Building web bundle (web/dist)…"
  npm --prefix web run build
fi

if [ ! -d desktop/node_modules ]; then
  echo "Installing desktop (electron) deps…"
  npm --prefix desktop install
fi

echo "Launching Karaoke Subtitle Studio (desktop)…"
exec npm --prefix desktop start
