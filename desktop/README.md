# Karaoke Subtitle Studio — Desktop (Electron)

Native desktop shell. Spawns a local daemon (`--file-access native`) that also serves
the built web UI, then opens a window on `http://127.0.0.1:<port>/`.

## Run (dev)

From the repo root:

```bash
./run-desktop.sh
```

This builds `web/dist` if missing, installs `desktop/node_modules` if absent, then launches Electron.
Requires the repo `.venv` (the daemon runs from it). Ctrl-C quits; the daemon child is killed automatically.

## Smoke test (headless / CI)

```bash
xvfb-run -a npm --prefix desktop run smoke
```

Spawns the daemon, healthchecks `/api/env`, prints `KSS_SMOKE_OK`, and exits 0.

## What ships with the renderer

`preload.js` exposes `window.kss = { isDesktop, pickOpen, pickSave }`. The web UI feature-detects this
to show native Browse… buttons; in a plain browser the bridge is absent and the UI is unchanged.

## Not yet

No packaging / bundled Python (assumes the repo `.venv` + a built `web/dist`). See the design spec
(`docs/superpowers/specs/2026-06-08-electron-desktop-shell-design.md`).
