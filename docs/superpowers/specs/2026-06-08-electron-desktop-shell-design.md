# Electron Desktop Shell — Design

**Date:** 2026-06-08
**Branch:** `feat/electron-shell` (stacks on `feat/file-access-seam`)
**Status:** approved design → implementation plan next

## Goal

Wrap the existing web UI in a native desktop window that owns its own local daemon
(launched with `--file-access native`) and provides OS file dialogs. This is the **local-run**
half of the file-access seam — direct filesystem access — as distinct from the hosted/`transfer`
browser deployment. Tauri was the original choice but cannot build/run in the dev environment
(no Rust toolchain, no webkit2gtk); **Electron** is used instead — it installs as a prebuilt Node
binary, all Chromium runtime libs are present, and it runs here under `DISPLAY=:1`/`xvfb` so the
shell is end-to-end smoke-testable. The seam is shell-agnostic, so this is purely additive — no
architecture change.

## Scope

In:
- Daemon serves the built web SPA (so the Electron window loads one local origin).
- An Electron app under `desktop/` that spawns + supervises the daemon and shows the window.
- Native file dialogs (Browse…) bridged into the existing path inputs, feature-detected.
- A dev launcher: `npm run electron` + an executable `run-desktop.sh`.

Out (deferred — bundling is explicitly not a concern now):
- electron-builder / packaging artifacts (AppImage/deb/dmg/exe).
- PyInstaller / bundled Python (the launcher assumes the repo `.venv`).
- Auto-update, custom app menu, custom icon.

## Architecture

### 1. Daemon serves the SPA (backend)

`build_app(ctx, hub, token=None, projects_dir="projects", file_access="native", web_dist=None)`:
when `web_dist` is a directory, mount it at `/` with an SPA fallback (any non-API path that isn't a
real file → `index.html`). Mount order: `/mcp`, `/api/*`, `/ws`, **then** the static/SPA catch-all,
so API routes always win. When `web_dist` is `None` (dev/tests), nothing is mounted — current
behavior is unchanged.

`daemon/__main__.py`: add `--web-dist` (default: auto-detect `web/dist` relative to repo root if it
exists, else `None`). Pass through to `build_app`.

Benefit: Electron loads `http://127.0.0.1:<port>/` and the web client's relative `/api`+`/ws` URLs
work with zero changes and no CORS. The hosted deployment can serve the SPA the same way.

Implementation note: use Starlette `StaticFiles`. SPA fallback is a small custom route/handler
(catch-all GET) that returns `index.html` for non-file paths, since `StaticFiles(html=True)` 404s
unknown deep routes. Guard: never let the fallback shadow `/api`, `/ws`, `/mcp`.

### 2. Electron app (`desktop/`)

- `desktop/package.json`: `electron` devDependency, `"main": "main.js"`, scripts `start` (`electron .`)
  and `smoke` (`electron . --smoke`).
- `desktop/lib.js` — **pure, unit-testable helpers** (no Electron import):
  - `freePort()` → resolves an ephemeral free TCP port (Node `net` server on port 0).
  - `daemonArgs({port, projectsDir, webDist})` → the argv array for `python -m daemon …`
    (always includes `--file-access native`). Returned as data so it can be asserted in a test.
  - `repoPaths()` → resolves `pythonPath` (`<repo>/.venv/bin/python`), `webDist` (`<repo>/web/dist`),
    `projectsDir` default.
- `desktop/main.js` — main process:
  1. `app.whenReady()` → `port = await freePort()`; spawn the daemon child with `daemonArgs(...)`,
     `cwd = repoRoot`, stdio piped (daemon stderr logged).
  2. Poll `GET http://127.0.0.1:<port>/api/env` until 200 (timeout ~10 s, ~250 ms interval).
  3. On healthy → create `BrowserWindow` (`contextIsolation:true`, `nodeIntegration:false`,
     `preload: preload.js`) and load `http://127.0.0.1:<port>/`.
  4. On timeout/spawn-fail → show an error (dialog or error page), log daemon stderr, quit cleanly.
  5. `--smoke`: after step 2 succeeds, log a marker line (`KSS_SMOKE_OK`) and `app.quit()` without
     opening a visible window (or open + immediately close). Exit code 0.
  - **Lifecycle:** keep a handle to the daemon child; kill it on `before-quit`, `window-all-closed`,
    `SIGINT`/`SIGTERM`, and if the renderer window closes. If the daemon child exits unexpectedly
    while running → log + quit the app (no auto-restart in v1). No orphaned daemon on any path.
- `desktop/preload.js`: `contextBridge.exposeInMainWorld("kss", { isDesktop:true,
  pickOpen(opts), pickSave(opts) })`, each delegating to `ipcRenderer.invoke`.

### 3. Native dialog bridge

- Main-process IPC handlers:
  - `kss:pickOpen` `({filters})` → `dialog.showOpenDialog({properties:["openFile"], filters})` →
    returns the absolute path string, or `null` if canceled.
  - `kss:pickSave` `({defaultPath, filters})` → `dialog.showSaveDialog({defaultPath, filters})` →
    path or `null`.
- Web side `web/src/model/desktop.ts`:
  ```ts
  type Picker = (opts?: { filters?: { name: string; extensions: string[] }[]; defaultPath?: string }) => Promise<string | null>;
  interface KssBridge { isDesktop: boolean; pickOpen: Picker; pickSave: Picker; }
  const bridge = (globalThis as { kss?: KssBridge }).kss;
  export const isDesktop = !!bridge?.isDesktop;
  export const pickOpen: Picker = (o) => bridge ? bridge.pickOpen(o) : Promise.resolve(null);
  export const pickSave: Picker = (o) => bridge ? bridge.pickSave(o) : Promise.resolve(null);
  ```
- Wiring (feature-detected; plain browser unaffected because `isDesktop` is false):
  - `CreateProjectModal`: when `isDesktop`, render a **Browse…** button beside the lyrics and video
    path inputs; clicking calls `pickOpen` with the right filters and sets the existing
    `lyricsPath`/`videoPath` state. (Also flip those fields' mode to "path" so the value is sent as a
    server path.)
  - `ExportMenu`: when `isDesktop`, a **Browse…** button for the **output** path (`pickSave`,
    default `<project>_subbed.mp4`) setting `out`, and one for **input video** (`pickOpen`) setting
    `videoIn`.
  - Because the Electron daemon runs `native`, `can_use_server_paths`/`can_burn_video` are already
    true, so the path inputs and burn UI render; Browse… just fills them.

### 4. Dev launcher

- `desktop/package.json` `start`/`smoke` scripts (above).
- Root convenience: an executable **`run-desktop.sh`** mirroring `run.sh`:
  1. build the web bundle if `web/dist` is missing/stale (`npm --prefix web run build`),
  2. ensure `desktop/node_modules` (electron) is installed (`npm --prefix desktop install` if absent),
  3. `exec npx --prefix desktop electron desktop/` (or `cd desktop && npm start`).
  Ctrl-C stops the app; the main process kills the daemon child.
- Optional `npm run electron` alias at repo root delegating to `run-desktop.sh`.

## Data flow

1. `run-desktop.sh`/`npm run electron` → Electron main spawns the daemon (native, ephemeral port,
   `web/dist` mounted).
2. Healthcheck passes → window loads `http://127.0.0.1:<port>/` → daemon serves the SPA → web app
   boots and talks to `/api` + `/ws` on the same origin.
3. User clicks Browse… → preload → main → OS dialog → absolute path → web state → existing API call
   (`projects/create {lyrics_path|video_path}`, `video {path}`, `burn {out, video_in}`) → daemon
   (native) reads/writes directly on disk.
4. App quit → main kills the daemon child.

## Error handling

- Daemon spawn failure or healthcheck timeout → error surfaced (dialog/error page) + daemon stderr
  logged + clean app exit (no orphan).
- Daemon crash mid-session → main detects child `exit` → log + quit (no auto-restart in v1).
- Dialog canceled → resolves `null` → web no-ops (state unchanged).
- Port conflict → avoided by ephemeral free-port selection.
- Orphan prevention: daemon child killed on `before-quit`, `window-all-closed`, signals, and renderer
  close.

## Testing

- **Daemon SPA mount (TDD, `tests/test_daemon.py`):** with `web_dist` = temp dir containing
  `index.html` + an asset: `GET /` → index html; `GET /assets/x` → the asset; `GET /api/state` →
  still the JSON state (API precedence); `GET /deep/spa/route` → index.html (SPA fallback);
  `GET /api/unknown` → not the SPA fallback (404/normal API error). With `web_dist=None` → no `/`
  route (current behavior).
- **`desktop/lib.js` (node:test):** `freePort()` returns a usable integer port; `daemonArgs(...)`
  contains `--file-access native`, the port, projects-dir, and web-dist; `repoPaths()` resolves the
  `.venv` python path.
- **Web bridge (vitest):** `desktop.ts` → `isDesktop` false in jsdom (no `window.kss`), pickers
  resolve `null`. With a mocked `window.kss`, `CreateProjectModal`/`ExportMenu` render Browse…
  buttons and clicking calls `pickOpen`/`pickSave` and sets the path state. Without it, no Browse…
  buttons (existing tests unaffected).
- **Electron smoke (this environment, xvfb):** `xvfb-run -a npm --prefix desktop run smoke` (i.e.
  `electron . --smoke`) exits 0 after the daemon spawn + healthcheck + window load, printing
  `KSS_SMOKE_OK`. End-to-end proof of the local-run path. Kills the daemon on exit.
- Existing suites (daemon, web vitest, web e2e) stay green; engine untouched.

## File structure

New:
- `desktop/package.json`, `desktop/main.js`, `desktop/preload.js`, `desktop/lib.js`,
  `desktop/lib.test.js`, `desktop/README.md`
- `web/src/model/desktop.ts`, `web/src/model/desktop.test.ts`
- `run-desktop.sh` (executable)

Modified:
- `daemon/app.py` (`web_dist` param + static/SPA mount), `daemon/__main__.py` (`--web-dist`),
  `tests/test_daemon.py`
- `web/src/components/library/CreateProjectModal.tsx` (+ test), `web/src/components/ExportMenu.tsx`
  (+ test)
- root `package.json` (optional `electron` alias), `.gitignore` (`desktop/node_modules`)

## Non-goals / constraints

- Daemon stays loopback-bound; the shell is same-machine by definition.
- No packaging/bundled Python this pass; the launcher assumes the repo `.venv` and a built
  `web/dist`.
- One web codebase: every desktop-only affordance is feature-detected via `isDesktop`, so the plain
  browser deployment is byte-for-byte unchanged.
