# Electron Desktop Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing web UI in an Electron desktop window that spawns + supervises a local daemon (`--file-access native`) and provides OS file dialogs, delivering the "local run" half of the file-access seam.

**Architecture:** The daemon optionally serves the built web SPA at `/`, so the Electron window loads one local origin (`http://127.0.0.1:<port>/`) and the web client's relative `/api`+`/ws` URLs work unchanged. An Electron main process picks a free port, spawns `python -m daemon --file-access native --web-dist web/dist`, healthchecks `/api/env`, then opens the window. A preload `contextBridge` exposes native open/save dialogs; the web UI feature-detects `window.kss` to show Browse… buttons that fill the existing path inputs. Plain-browser deployment is byte-for-byte unchanged.

**Tech Stack:** Electron 42 (Node main + preload), Starlette `StaticFiles`/`FileResponse` (daemon SPA mount), Vite build (`web/dist`), Python daemon (unchanged engine), `node:test` + vitest + the existing custom Python test harness.

**Branch:** `feat/electron-shell` (already created, stacks on `feat/file-access-seam`). Spec: `docs/superpowers/specs/2026-06-08-electron-desktop-shell-design.md`.

**House rules:** Engine code is untouched (no engine tests needed). Daemon changes are test-first in `tests/test_daemon.py` (custom harness: `t_*` functions auto-collected, each returns `(ok, detail)`; run with `.venv/bin/python tests/test_daemon.py`). Web is vitest. Never `git add -A` (work CSVs / lockfiles live in the repo dir).

---

## File Structure

New files:
- `desktop/lib.js` — pure helpers: `freePort()`, `daemonArgs()`, `repoPaths()` (no Electron import → unit-testable).
- `desktop/lib.test.js` — `node:test` unit tests for `lib.js`.
- `desktop/main.js` — Electron main process: spawn/supervise daemon, healthcheck, window, dialog IPC, lifecycle teardown.
- `desktop/preload.js` — `contextBridge` exposing `window.kss`.
- `desktop/package.json` — electron devDep + `start`/`smoke`/`test` scripts.
- `desktop/README.md` — how to run.
- `web/src/model/desktop.ts` — feature-detect `window.kss`; `isDesktop`, `pickOpen`, `pickSave`.
- `web/src/model/desktop.test.ts` — bridge feature-detection tests.
- `run-desktop.sh` — executable launcher (build dist if stale, install desktop deps if absent, launch).

Modified:
- `daemon/app.py` — `web_dist` param + SPA static mount (append-only; default off).
- `daemon/__main__.py` — `--web-dist` flag (auto-detect `web/dist`).
- `tests/test_daemon.py` — SPA-mount tests.
- `web/src/components/library/CreateProjectModal.tsx` (+ `.test.tsx`) — Browse… for lyrics/video.
- `web/src/components/ExportMenu.tsx` (+ `.test.tsx`) — Browse… for output + input video.
- `.gitignore` — `desktop/node_modules`.

---

## Task 1: Daemon serves the SPA

**Files:**
- Modify: `daemon/app.py`
- Modify: `daemon/__main__.py`
- Test: `tests/test_daemon.py`

- [ ] **Step 1: Write the failing tests** — append before the collection loop (`for n, f in list(globals().items()):`) in `tests/test_daemon.py`:

```python
def _client_webdist():
    import tempfile, os
    d = tempfile.mkdtemp(prefix="kss_webdist_")
    with open(os.path.join(d, "index.html"), "w") as fh: fh.write("<!doctype html><title>KSS</title>")
    os.makedirs(os.path.join(d, "assets"), exist_ok=True)
    with open(os.path.join(d, "assets", "app.js"), "w") as fh: fh.write("console.log('kss')")
    hub = Hub(); ctx = DaemonContext(hub); ctx.load_lyrics("aligned_lyrics.json")
    app = build_app(ctx, hub, token=None, projects_dir="/tmp/_kss_projects", web_dist=d)
    return TestClient(app), d

def t_spa_index_served_at_root():
    c, _ = _client_webdist()
    r = c.get("/")
    return (r.status_code == 200 and "<title>KSS</title>" in r.text), f"status={r.status_code}"

def t_spa_asset_served():
    c, _ = _client_webdist()
    r = c.get("/assets/app.js")
    return (r.status_code == 200 and "kss" in r.text), f"status={r.status_code}"

def t_spa_deep_route_falls_back_to_index():
    c, _ = _client_webdist()
    r = c.get("/some/editor/route")
    return (r.status_code == 200 and "<title>KSS</title>" in r.text), f"status={r.status_code}"

def t_spa_does_not_shadow_api():
    c, _ = _client_webdist()
    r = c.get("/api/state")
    body = r.json()
    return (r.status_code == 200 and "layout" in body), f"status={r.status_code}"

def t_spa_unknown_api_not_index():
    c, _ = _client_webdist()
    r = c.get("/api/no_such_route")
    return (r.status_code == 404 and "<title>" not in r.text), f"status={r.status_code} body={r.text[:40]!r}"

def t_no_spa_without_web_dist():
    c, _ = _client()   # default: web_dist=None
    r = c.get("/")
    return (r.status_code == 404), f"status={r.status_code}"
```

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/python tests/test_daemon.py`
Expected: the six new tests FAIL — `t_spa_*` raise `TypeError: build_app() got an unexpected keyword argument 'web_dist'`; `t_no_spa_without_web_dist` may pass already (no `/` route today) — that's fine.

- [ ] **Step 3: Add the `web_dist` param + SPA mount** in `daemon/app.py`. Change the signature:

```python
def build_app(ctx, hub, token=None, projects_dir="projects", file_access="native", web_dist=None):
```

Add these imports near the top of `daemon/app.py` (with the other starlette imports):

```python
import os
from starlette.responses import FileResponse, PlainTextResponse
from starlette.routing import Route
```

After the `routes = [ ... ]` list is fully built (immediately before the `middleware = [...]` line), append the SPA routes when `web_dist` is set:

```python
    if web_dist and os.path.isdir(web_dist):
        base = os.path.abspath(web_dist)
        index = os.path.join(base, "index.html")

        async def _spa(request):
            rel = request.path_params.get("path", "")
            # Never let the SPA fallback shadow the API / websocket / mcp surface.
            if rel == "ws" or rel == "api" or rel == "mcp" \
               or rel.startswith("api/") or rel.startswith("mcp/"):
                return PlainTextResponse("not found", status_code=404)
            candidate = os.path.abspath(os.path.join(base, rel))
            if (candidate == base or candidate.startswith(base + os.sep)) and os.path.isfile(candidate):
                return FileResponse(candidate)
            return FileResponse(index)   # SPA deep-link fallback

        async def _spa_root(request):
            return FileResponse(index)

        routes.append(Route("/", _spa_root, methods=["GET"]))
        routes.append(Route("/{path:path}", _spa, methods=["GET"]))
```

These are appended LAST, so the explicit `/api/...`, `/ws`, `/mcp` routes registered earlier always match first. Also set `app.state.web_dist = web_dist` next to the other `app.state.*` assignments:

```python
    app.state.web_dist = web_dist
```

- [ ] **Step 4: Run to verify they pass**

Run: `.venv/bin/python tests/test_daemon.py`
Expected: all tests PASS (count rises by 6).

- [ ] **Step 5: Add the `--web-dist` CLI flag** in `daemon/__main__.py`. After the `--file-access` argument add:

```python
    # Serve the built web SPA from the daemon so a single local origin hosts UI + API
    # (used by the Electron shell; also lets a hosted deploy self-serve the SPA).
    # Auto-detects web/dist relative to CWD; pass --web-dist "" to disable.
    ap.add_argument("--web-dist", default=None)
```

And after `a = ap.parse_args(argv)`, resolve the auto-detect, then thread it into `build_app`:

```python
    web_dist = a.web_dist
    if web_dist is None:
        cand = os.path.join(os.getcwd(), "web", "dist")
        web_dist = cand if os.path.isdir(cand) else None
    elif web_dist == "":
        web_dist = None
    app = build_app(ctx, hub, token=os.environ.get("KSS_MCP_TOKEN"),
                    projects_dir=a.projects_dir, file_access=a.file_access, web_dist=web_dist)
```

(`import os` is already present in `daemon/__main__.py`.)

- [ ] **Step 6: Re-run daemon + adjacent suites**

Run: `.venv/bin/python tests/test_daemon.py && .venv/bin/python tests/test_daemon_projects.py && .venv/bin/python tests/test_connect.py`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add daemon/app.py daemon/__main__.py tests/test_daemon.py
git commit -m "feat(daemon): optional --web-dist to serve the built SPA (single local origin)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Electron pure helpers (`desktop/lib.js`)

**Files:**
- Create: `desktop/lib.js`
- Create: `desktop/lib.test.js`
- Create: `desktop/package.json`

- [ ] **Step 1: Create `desktop/package.json`**

```json
{
  "name": "kss-desktop",
  "version": "0.1.0",
  "private": true,
  "description": "Electron desktop shell for Karaoke Subtitle Studio",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "smoke": "electron . --smoke --no-sandbox",
    "test": "node --test"
  },
  "devDependencies": {
    "electron": "^42.3.3"
  }
}
```

- [ ] **Step 2: Write the failing tests** — `desktop/lib.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const { freePort, daemonArgs, repoPaths } = require("./lib");

test("freePort returns a usable TCP port", async () => {
  const p = await freePort();
  assert.ok(Number.isInteger(p) && p > 0 && p < 65536, `got ${p}`);
});

test("daemonArgs always launches the daemon in native mode", () => {
  const a = daemonArgs({ port: 8771, projectsDir: "/p", webDist: "/w" });
  assert.deepStrictEqual(a, [
    "-m", "daemon", "--file-access", "native",
    "--projects-dir", "/p", "--port", "8771", "--web-dist", "/w",
  ]);
});

test("repoPaths resolves the venv python and web dist under the repo root", () => {
  const r = repoPaths("/repo");
  assert.strictEqual(r.repoRoot, "/repo");
  assert.strictEqual(r.pythonPath, "/repo/.venv/bin/python");
  assert.strictEqual(r.webDist, "/repo/web/dist");
  assert.strictEqual(r.defaultProjectsDir, "/repo/projects");
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd desktop && node --test`
Expected: FAIL — `Cannot find module './lib'`.

- [ ] **Step 4: Implement `desktop/lib.js`**

```js
// desktop/lib.js — pure helpers for the Electron main process (no electron import,
// so they're unit-testable with node:test).
const net = require("net");
const path = require("path");

// Resolve an ephemeral free TCP port on loopback (avoids clashing with a dev daemon).
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// argv for `python -m daemon …`. ALWAYS native (the desktop shell is same-machine).
function daemonArgs({ port, projectsDir, webDist }) {
  return [
    "-m", "daemon", "--file-access", "native",
    "--projects-dir", projectsDir, "--port", String(port), "--web-dist", webDist,
  ];
}

// Resolve repo-relative paths from a given repo root.
function repoPaths(root) {
  return {
    repoRoot: root,
    pythonPath: path.join(root, ".venv", "bin", "python"),
    webDist: path.join(root, "web", "dist"),
    defaultProjectsDir: path.join(root, "projects"),
  };
}

module.exports = { freePort, daemonArgs, repoPaths };
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd desktop && node --test`
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add desktop/package.json desktop/lib.js desktop/lib.test.js
git commit -m "feat(desktop): electron main-process helpers (free-port, daemon args, repo paths)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Electron main + preload

**Files:**
- Create: `desktop/main.js`
- Create: `desktop/preload.js`
- Create: `desktop/README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Implement `desktop/preload.js`**

```js
// desktop/preload.js — exposes a minimal, audited bridge to the renderer (web UI).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kss", {
  isDesktop: true,
  // opts: { filters?: [{name, extensions}], defaultPath? } -> absolute path or null
  pickOpen: (opts) => ipcRenderer.invoke("kss:pickOpen", opts),
  pickSave: (opts) => ipcRenderer.invoke("kss:pickSave", opts),
});
```

- [ ] **Step 2: Implement `desktop/main.js`**

```js
// desktop/main.js — Electron main process. Spawns + supervises a local daemon in
// native mode, healthchecks it, opens the window on the daemon's origin, and bridges
// native file dialogs. Kills the daemon on every exit path (no orphans).
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const { freePort, daemonArgs, repoPaths } = require("./lib");

const SMOKE = process.argv.includes("--smoke");
let daemon = null;

function killDaemon() {
  if (daemon && !daemon.killed) {
    try { daemon.kill("SIGTERM"); } catch { /* already gone */ }
  }
  daemon = null;
}

async function waitHealthy(port, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/env`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  return false;
}

async function start() {
  const { repoRoot, pythonPath, webDist, defaultProjectsDir } =
    repoPaths(path.resolve(__dirname, ".."));
  const port = await freePort();
  const projectsDir = process.env.KSS_PROJECTS_DIR || defaultProjectsDir;

  daemon = spawn(pythonPath, daemonArgs({ port, projectsDir, webDist }),
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
  daemon.stderr.on("data", (d) => process.stderr.write(`[daemon] ${d}`));
  daemon.on("exit", (code) => {
    daemon = null;
    if (!app.isQuitting) { console.error(`daemon exited unexpectedly (code ${code})`); app.quit(); }
  });

  const ok = await waitHealthy(port);
  if (!ok) {
    console.error("daemon healthcheck failed");
    if (!SMOKE) dialog.showErrorBox("Karaoke Subtitle Studio", "The local daemon failed to start.");
    killDaemon();
    app.exit(1);
    return;
  }

  if (SMOKE) { console.log("KSS_SMOKE_OK"); app.isQuitting = true; killDaemon(); app.quit(); return; }

  const win = new BrowserWindow({
    width: 1440, height: 900, title: "Karaoke Subtitle Studio",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

ipcMain.handle("kss:pickOpen", async (_e, opts) => {
  const r = await dialog.showOpenDialog({ properties: ["openFile"], filters: opts && opts.filters });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});

ipcMain.handle("kss:pickSave", async (_e, opts) => {
  const r = await dialog.showSaveDialog({
    defaultPath: opts && opts.defaultPath, filters: opts && opts.filters,
  });
  return r.canceled || !r.filePath ? null : r.filePath;
});

app.on("before-quit", () => { app.isQuitting = true; killDaemon(); });
app.on("window-all-closed", () => { killDaemon(); app.quit(); });
process.on("SIGINT", () => { app.isQuitting = true; killDaemon(); app.exit(0); });
process.on("SIGTERM", () => { app.isQuitting = true; killDaemon(); app.exit(0); });

app.whenReady().then(start).catch((e) => { console.error(e); killDaemon(); app.exit(1); });
```

- [ ] **Step 3: Write `desktop/README.md`**

````markdown
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

No packaging / bundled Python (assumes the repo `.venv` + a built `web/dist`). See the design spec.
````

- [ ] **Step 4: Ignore electron's node_modules** — append to `.gitignore`:

```
desktop/node_modules
```

- [ ] **Step 5: Install electron**

Run: `npm --prefix desktop install`
Expected: electron 42.x downloads; `desktop/node_modules/.bin/electron` exists. (Network required.)

- [ ] **Step 6: Smoke-test end-to-end under xvfb**

Run (from repo root, after `npm --prefix web run build` so `web/dist` exists):
```bash
npm --prefix web run build
xvfb-run -a npm --prefix desktop run smoke
```
Expected: stderr shows `[daemon]` log lines; stdout contains `KSS_SMOKE_OK`; process exits 0; no leftover `python -m daemon` process (`pgrep -af "daemon --file-access native"` returns nothing after exit).

If Electron complains about the sandbox, confirm the `--no-sandbox` switch is present in the `smoke` script (it is). If `web/dist` is absent the daemon still starts but `/` 404s — the smoke only checks `/api/env`, so it still passes; the build step above prevents that gap.

- [ ] **Step 7: Commit**

```bash
git add desktop/main.js desktop/preload.js desktop/README.md .gitignore
git commit -m "feat(desktop): electron main + preload — spawn/supervise daemon, window, dialog bridge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Web desktop bridge (`web/src/model/desktop.ts`)

**Files:**
- Create: `web/src/model/desktop.ts`
- Test: `web/src/model/desktop.test.ts`

- [ ] **Step 1: Write the failing tests** — `web/src/model/desktop.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => { delete (globalThis as { kss?: unknown }).kss; vi.resetModules(); });

describe("desktop bridge", () => {
  it("isDesktop is false and pickers resolve null when no window.kss", async () => {
    const mod = await import("./desktop");
    expect(mod.isDesktop).toBe(false);
    expect(await mod.pickOpen()).toBeNull();
    expect(await mod.pickSave()).toBeNull();
  });

  it("delegates to window.kss when present", async () => {
    const pickOpen = vi.fn(async () => "/abs/in.json");
    const pickSave = vi.fn(async () => "/abs/out.mp4");
    (globalThis as { kss?: unknown }).kss = { isDesktop: true, pickOpen, pickSave };
    vi.resetModules();
    const mod = await import("./desktop");
    expect(mod.isDesktop).toBe(true);
    expect(await mod.pickOpen({ filters: [{ name: "JSON", extensions: ["json"] }] })).toBe("/abs/in.json");
    expect(await mod.pickSave({ defaultPath: "x.mp4" })).toBe("/abs/out.mp4");
    expect(pickOpen).toHaveBeenCalledWith({ filters: [{ name: "JSON", extensions: ["json"] }] });
    expect(pickSave).toHaveBeenCalledWith({ defaultPath: "x.mp4" });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/model/desktop.test.ts` (from `web/`)
Expected: FAIL — cannot resolve `./desktop`.

- [ ] **Step 3: Implement `web/src/model/desktop.ts`**

```ts
// web/src/model/desktop.ts — feature-detect the Electron preload bridge. In a plain
// browser there is no window.kss, so isDesktop is false and the pickers are no-ops.
export interface PickOpts {
  filters?: { name: string; extensions: string[] }[];
  defaultPath?: string;
}
type Picker = (opts?: PickOpts) => Promise<string | null>;
interface KssBridge { isDesktop: boolean; pickOpen: Picker; pickSave: Picker; }

const bridge = (globalThis as unknown as { kss?: KssBridge }).kss;

export const isDesktop: boolean = !!bridge?.isDesktop;
export const pickOpen: Picker = (opts) => (bridge ? bridge.pickOpen(opts) : Promise.resolve(null));
export const pickSave: Picker = (opts) => (bridge ? bridge.pickSave(opts) : Promise.resolve(null));
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/model/desktop.test.ts`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/model/desktop.ts web/src/model/desktop.test.ts
git commit -m "feat(web): desktop bridge — feature-detect Electron window.kss pickers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Browse… in CreateProjectModal

**Files:**
- Modify: `web/src/components/library/CreateProjectModal.tsx`
- Test: `web/src/components/library/CreateProjectModal.test.tsx`

Context: the modal already has `lyricsPath`/`videoPath` state, a `lyricsMode`/`videoMode` ("upload" | "path") switch, and renders typed path inputs in "path" mode. The server-path inputs render when `canServerPaths` is true. In Electron the daemon is native ⇒ `canServerPaths` is true. We add a Browse… button (only when `isDesktop`) that opens a native dialog and writes the path state, switching that field to "path" mode.

- [ ] **Step 1: Write the failing test** — append to `web/src/components/library/CreateProjectModal.test.tsx` (it already imports `client`, `render`, `screen`, `fireEvent`, `waitFor`, and has a `setup(envSameHost)` helper that mocks `getEnv`). Add at the top-level (after the existing imports add the model import):

```tsx
import * as desktop from "../../model/desktop";
```

Then add this test:

```tsx
it("Browse… (desktop) sets the lyrics server path via the native picker", async () => {
  vi.spyOn(desktop, "isDesktop", "get").mockReturnValue(true);
  vi.spyOn(desktop, "pickOpen").mockResolvedValue("/abs/lyrics.json");
  setup(true);                                  // native caps → server-path UI available
  const browse = await screen.findByRole("button", { name: /browse lyrics/i });
  fireEvent.click(browse);
  await waitFor(() =>
    expect((screen.getByLabelText(/lyrics server path/i) as HTMLInputElement).value)
      .toBe("/abs/lyrics.json"));
});
```

Note: `isDesktop` is an exported `const`, so spy on it as a getter via `vi.spyOn(desktop, "isDesktop", "get")`. If that fails because the binding isn't configurable, instead set `(globalThis as any).kss = { isDesktop:true, pickOpen: vi.fn().mockResolvedValue("/abs/lyrics.json"), pickSave: vi.fn() }` BEFORE rendering and `vi.resetModules()`; the component reads `isDesktop` at module load. Prefer the getter-spy; fall back to the global only if needed.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/library/CreateProjectModal.test.tsx`
Expected: FAIL — no "Browse lyrics" button.

- [ ] **Step 3: Implement the Browse… buttons.** In `CreateProjectModal.tsx`:

Add imports at the top:
```tsx
import { isDesktop, pickOpen } from "../../model/desktop";
```

Add two handlers inside the component (near `submit`):
```tsx
  const browseLyrics = async () => {
    const ext = source === "srt" ? ["srt"] : ["json"];
    const p = await pickOpen({ filters: [{ name: "Lyrics", extensions: ext }] });
    if (p) { setLyricsMode("path"); setLyricsPath(p); }
  };
  const browseVideo = async () => {
    const p = await pickOpen({ filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm"] }] });
    if (p) { setVideoMode("path"); setVideoPath(p); }
  };
```

In the Lyrics `<div className="fld">` block, after the `<ModeSwitch .../>` line, add the desktop button:
```tsx
          {isDesktop && (
            <button type="button" className="btn ghost browse-btn" aria-label="Browse lyrics"
                    onClick={() => void browseLyrics()}>Browse…</button>
          )}
```

In the Video `<div className="fld">` block, after its `<ModeSwitch .../>` line:
```tsx
          {isDesktop && (
            <button type="button" className="btn ghost browse-btn" aria-label="Browse video"
                    onClick={() => void browseVideo()}>Browse…</button>
          )}
```

(The typed path inputs already render in "path" mode and are labeled "Lyrics server path" / "Video server path", which the test asserts.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/library/CreateProjectModal.test.tsx`
Expected: PASS (existing modal tests stay green — `isDesktop` is false without the spy, so no Browse buttons render).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/library/CreateProjectModal.tsx web/src/components/library/CreateProjectModal.test.tsx
git commit -m "feat(web): native Browse… for lyrics/video in CreateProjectModal (desktop only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Browse… in ExportMenu

**Files:**
- Modify: `web/src/components/ExportMenu.tsx`
- Test: `web/src/components/ExportMenu.test.tsx`

Context: ExportMenu has `out` (output filename) and `videoIn` state, and renders the burn UI when `canBurn` (native). We add a Browse… (save) for `out` and a Browse… (open) for `videoIn`, both only when `isDesktop`.

- [ ] **Step 1: Write the failing test** — append to `web/src/components/ExportMenu.test.tsx` (it mocks `getEnv` to native in `beforeEach`). Add imports at top:

```tsx
import * as desktop from "../model/desktop";
```

Add the test:

```tsx
it("Browse… (desktop) sets the burn output path via the native save picker", async () => {
  vi.spyOn(desktop, "isDesktop", "get").mockReturnValue(true);
  vi.spyOn(desktop, "pickSave").mockResolvedValue("/abs/out.mp4");
  setup();
  const browse = await screen.findByRole("button", { name: /browse output/i });
  fireEvent.click(browse);
  await waitFor(() =>
    expect((screen.getByLabelText(/output file/i) as HTMLInputElement).value).toBe("/abs/out.mp4"));
});
```

(Same getter-spy caveat as Task 5, Step 1.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/ExportMenu.test.tsx`
Expected: FAIL — no "Browse output" button.

- [ ] **Step 3: Implement.** In `ExportMenu.tsx`:

Add import:
```tsx
import { isDesktop, pickOpen, pickSave } from "../model/desktop";
```

Add handlers near `handleBurn`:
```tsx
  const browseOut = async () => {
    const p = await pickSave({ defaultPath: out, filters: [{ name: "Video", extensions: ["mp4", "mkv", "mov"] }] });
    if (p) setOut(p);
  };
  const browseVideoIn = async () => {
    const p = await pickOpen({ filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm"] }] });
    if (p) setVideoIn(p);
  };
```

In the burn section, immediately after the output `<input ... aria-label="Output file" .../>` add:
```tsx
            {isDesktop && (
              <button type="button" className="btn ghost browse-btn" aria-label="Browse output"
                      onClick={() => void browseOut()}>Browse…</button>
            )}
```

And after the input-video `<input ... aria-label="Input video" .../>` (inside the existing `{canServerPaths && (...)}` block) add:
```tsx
                {isDesktop && (
                  <button type="button" className="btn ghost browse-btn" aria-label="Browse input video"
                          onClick={() => void browseVideoIn()}>Browse…</button>
                )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/ExportMenu.test.tsx`
Expected: PASS (existing ExportMenu suites stay green — `isDesktop` false without the spy).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ExportMenu.tsx web/src/components/ExportMenu.test.tsx
git commit -m "feat(web): native Browse… for burn output + input video in ExportMenu (desktop only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `run-desktop.sh` launcher

**Files:**
- Create: `run-desktop.sh`

- [ ] **Step 1: Write `run-desktop.sh`**

```bash
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
```

(npm runs the `start` script with cwd = `desktop/`, so `electron .` loads `desktop/main.js`.)

- [ ] **Step 2: Make it executable**

Run: `chmod +x run-desktop.sh`

- [ ] **Step 3: Verify it launches (smoke via the script path).** Temporarily confirm the script's build+install guards by running its body up to launch in smoke mode:

Run: `bash -c 'set -e; [ -f web/dist/index.html ] || npm --prefix web run build; [ -d desktop/node_modules ] || npm --prefix desktop install; xvfb-run -a npm --prefix desktop run smoke'`
Expected: prints `KSS_SMOKE_OK`, exits 0.

- [ ] **Step 4: Commit**

```bash
git add run-desktop.sh
git commit -m "feat(desktop): run-desktop.sh launcher (build dist, install electron, launch)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Daemon + adjacent Python suites**

Run: `.venv/bin/python tests/test_daemon.py && .venv/bin/python tests/test_daemon_projects.py && .venv/bin/python tests/test_video.py && .venv/bin/python tests/test_connect.py`
Expected: all PASS.

- [ ] **Step 2: Desktop unit tests**

Run: `npm --prefix desktop test`
Expected: 3 `node:test` tests PASS.

- [ ] **Step 3: Full web vitest + typecheck**

Run: `npx tsc --noEmit && npx vitest run` (from `web/`)
Expected: typecheck clean; all suites PASS (prior count + the new desktop/modal/export tests).

- [ ] **Step 4: Web e2e (native daemon, unchanged path)**

Run: `npx playwright test export.spec.ts smoke.spec.ts` (from `web/`)
Expected: PASS (the seam's e2e is unaffected; the daemon SPA mount is off in the e2e setup unless `--web-dist` is passed).

- [ ] **Step 5: Electron end-to-end smoke under xvfb**

Run: `npm --prefix web run build && xvfb-run -a npm --prefix desktop run smoke && pgrep -af "daemon --file-access native" || echo "no orphan daemon (good)"`
Expected: `KSS_SMOKE_OK` printed, exit 0, no orphaned daemon process.

- [ ] **Step 6: Optional — visible window screenshot.** Launch the real app under xvfb, capture a frame to confirm the UI renders through the daemon-served SPA:

Run:
```bash
( xvfb-run -a --server-args="-screen 0 1440x900x24" npm --prefix desktop start & ) ; sleep 8
import -window root /tmp/kss-desktop.png 2>/dev/null || true
pkill -f "electron" ; pkill -f "daemon --file-access native" || true
```
Expected: a screenshot at `/tmp/kss-desktop.png` showing the editor (best-effort; if `import`/screenshot tooling is unavailable, skip — the smoke test is the authoritative proof).

- [ ] **Step 7: Tk suites (batched, house rule)**

Run: `./run-tk-tests.sh`
Expected: 118/118 (unaffected — separate process, no desktop/seam coupling).

---

## Verification Summary

1. `tests/test_daemon.py` — SPA mount: index at `/`, assets, deep-route fallback, API precedence, unknown-API not-index, no-mount-without-web-dist.
2. `desktop/lib.test.js` — free-port, native daemon args, repo paths.
3. `web` vitest — desktop bridge feature-detection; Browse… wiring in modal + export; all prior suites green.
4. xvfb Electron `--smoke` — daemon spawn + healthcheck + clean exit, no orphan.
5. Existing daemon/web/e2e/Tk suites stay green; engine untouched.

## Self-review notes (author)

- Spec coverage: SPA mount (T1), Electron app + lifecycle + dialogs (T2/T3), web bridge (T4), Browse… wiring (T5/T6), run-executable (T7), smoke + full verification (T8). All spec sections mapped.
- Type/name consistency: `freePort`/`daemonArgs`/`repoPaths` signatures identical across lib.js, its test, and main.js. `window.kss = {isDesktop, pickOpen, pickSave}` identical in preload.js, desktop.ts, and both component tests. `--web-dist` / `web_dist` consistent across app.py, __main__.py, tests.
- Known risk flagged inline: vitest spying on an exported `const` getter (`isDesktop`) — fallback to a pre-render `globalThis.kss` + `resetModules` documented in T5/T6 Step 1.
