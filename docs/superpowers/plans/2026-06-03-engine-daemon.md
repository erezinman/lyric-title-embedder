# Unified Engine Daemon (Spec A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single Python daemon that hosts the existing MCP server (`/mcp` SSE), a web API (`/api`), and a WebSocket (`/ws` state push) over ONE shared engine `Session`, so an AI and the future web UI edit the same live project and all clients see changes — running alongside the untouched CTk app.

**Architecture:** A Starlette/uvicorn app. A `DaemonContext` (subclass of `HeadlessContext` — synchronous, dict globals, no Tk) whose `Session.on_change` schedules an async broadcast of full state to all `/ws` clients via a `Hub`. `/api/call` dispatches to `mcp_server/tools.py`; the existing `FastMCP` SSE app is mounted at `/mcp` over the SAME context. A project `library/` of self-contained folders (`lyrics.json` + `project.json`).

**Tech Stack:** Python 3.10, `starlette` 1.2 + `uvicorn` 0.48 (via `mcp`), `mcp` 1.27 (FastMCP), `httpx` (tests), `starlette.testclient.TestClient` (in-process HTTP+WS tests — no `websockets` lib needed), `websockets` (only to *serve* a browser; optional dep). Reuses `engine/`, `controller.py`, `mcp_server/`. Spec: `docs/superpowers/specs/2026-06-03-engine-daemon-design.md`.

**Conventions:**
- Repo root `/home/erez/karaoke-subtitle-studio`, branch `feat/design-system` (checked out). Run from root.
- Python = **`.venv/bin/python`** (has `mcp`, `starlette`, `uvicorn`, `httpx`). DISPLAY=:1 set (not needed — daemon is headless).
- Tests are stdlib scripts run as `.venv/bin/python tests/<name>.py` (exit 0 = pass), matching `tests/test_mcp.py`.
- The daemon imports `mcp`/`starlette`/`uvicorn` only in `daemon/app.py`/`__main__.py`/`api.py`; `daemon/context.py`+`hub.py`+`library.py` stay import-light (no `mcp` SDK).
- Commit after each task with the shown message.

---

## File Structure

| File | Responsibility |
|---|---|
| `daemon/__init__.py` | Package marker. |
| `daemon/hub.py` | `Hub`: WS client registry + `bind_loop` + sync `schedule(msg)` (thread-safe) + async `broadcast(msg)`. No `mcp`/starlette import. |
| `daemon/context.py` | `DaemonContext(HeadlessContext)`: wires `Session.on_change` → `hub.schedule(state)`. |
| `daemon/library.py` | Project library over a `projects/` dir of self-contained folders. |
| `daemon/api.py` | Starlette route handlers: `/api/call`, `/api/state|render|ass`, `/api/frame`, `/api/burn*`, `/api/projects*`, the `/ws` endpoint. |
| `daemon/app.py` | `build_app(ctx, hub, token, projects_dir)` → Starlette: mount `/mcp`, add `/api` routes + `/ws`, lifespan binds the loop to the hub, CORS for the Vite dev origin. |
| `daemon/__main__.py` | `python -m daemon [--port] [--projects-dir] ` → DaemonContext + Hub + uvicorn. |
| `tests/test_daemon.py` | TestClient-based HTTP+WS tests. |
| `pyproject.toml` (modify) | add `websockets`/`httpx` to the optional `mcp` group. |

---

## Task 1: `Hub` + `DaemonContext`

**Files:** Create `daemon/__init__.py`, `daemon/hub.py`, `daemon/context.py`; create `tests/test_daemon.py`.

- [ ] **Step 1: Write the failing test** — create `tests/test_daemon.py`:

```python
# tests/test_daemon.py — unified daemon tests (TestClient; no real sockets / websockets lib).
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
results = []
def check(name, fn):
    try: ok, d = fn(); results.append((ok, name, d))
    except Exception as e:
        import traceback; results.append((False, name, f"EXC {type(e).__name__}: {e}"))

from daemon.hub import Hub
from daemon.context import DaemonContext

class _StubHub(Hub):
    def __init__(self): super().__init__(); self.scheduled = []
    def schedule(self, msg): self.scheduled.append(msg)

def t_context_fires_hub_on_change():
    hub = _StubHub(); ctx = DaemonContext(hub)
    ctx.load_lyrics("aligned_lyrics.json")          # set_project -> on_change -> hub.schedule
    n0 = len(hub.scheduled)
    from mcp_server import tools
    tools.set_group_style(ctx, 0, {"fontsize": 80}) # edit -> on_change -> schedule
    last = hub.scheduled[-1]
    return (n0 >= 1 and len(hub.scheduled) > n0 and last["type"] == "state"
            and last["state"]["n_events"] >= 1), f"scheduled={len(hub.scheduled)}"

def t_context_is_synchronous_headless():
    hub = _StubHub(); ctx = DaemonContext(hub)
    return (ctx.run(lambda: 7) == 7 and "fontsize" in ctx.get_globals()), "sync ok"

for n, f in list(globals().items()):
    if n.startswith("t_"): check(n, f)
npass = sum(1 for ok, *_ in results if ok)
for ok, n, d in results: print(f"[{'PASS' if ok else 'FAIL'}] {n}" + ("" if ok else f"  -> {d}"))
print(f"\n{npass}/{len(results)} passed"); sys.exit(0 if npass == len(results) else 1)
```

- [ ] **Step 2: Run — verify it fails** (`daemon.hub`/`daemon.context` missing).

- [ ] **Step 3: Implement.** Create `daemon/__init__.py`:
```python
# daemon — unified engine daemon: one process serving /mcp + /api + /ws over one Session.
```
Create `daemon/hub.py`:
```python
# daemon/hub.py — WebSocket client registry + thread-safe broadcast scheduling.
import asyncio

class Hub:
    def __init__(self):
        self._clients = set()      # set of starlette WebSocket
        self._loop = None          # bound at app startup (lifespan)

    def bind_loop(self, loop):
        self._loop = loop

    def register(self, ws):
        self._clients.add(ws)

    def unregister(self, ws):
        self._clients.discard(ws)

    def schedule(self, msg):
        """Sync, callable from any thread (on_change fires synchronously inside a
        mutation). Hop to the event loop and fire-and-forget the async broadcast."""
        loop = self._loop
        if loop is None:
            return
        loop.call_soon_threadsafe(lambda: asyncio.ensure_future(self.broadcast(msg)))

    async def broadcast(self, msg):
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)
```
Create `daemon/context.py`:
```python
# daemon/context.py — synchronous EngineContext whose Session change pushes state to /ws.
from mcp_server.context import HeadlessContext

class DaemonContext(HeadlessContext):
    def __init__(self, hub):
        super().__init__()                  # standalone Session + dict globals (no Tk)
        self.hub = hub
        self.session.on_change = self._fire  # wire change -> broadcast

    def _fire(self):
        from mcp_server import tools
        try:
            state = tools.get_state(self)
        except Exception:
            return
        self.hub.schedule({"type": "state", "state": state})
```

- [ ] **Step 4: Run** `.venv/bin/python tests/test_daemon.py` → `2/2 passed`.

- [ ] **Step 5: Commit**
```bash
git add daemon/__init__.py daemon/hub.py daemon/context.py tests/test_daemon.py
git commit -m "feat(daemon): Hub + DaemonContext (Session change -> WS broadcast schedule)"
```

---

## Task 2: Starlette app — `/api/call`, `/api/state`, `/ws`

**Files:** Create `daemon/api.py`, `daemon/app.py`; extend `tests/test_daemon.py`.

- [ ] **Step 1: Write failing tests** — add to `tests/test_daemon.py`:

```python
from starlette.testclient import TestClient
from daemon.app import build_app
from daemon.hub import Hub
from daemon.context import DaemonContext

def _client():
    hub = Hub(); ctx = DaemonContext(hub); ctx.load_lyrics("aligned_lyrics.json")
    app = build_app(ctx, hub, token=None, projects_dir="/tmp/_kss_projects")
    return TestClient(app), ctx

def t_api_call_and_state():
    c, ctx = _client()
    r = c.post("/api/call", json={"tool": "set_group_style", "args": {"gi": 0, "partial": {"fontsize": 96}}})
    assert r.status_code == 200, r.text
    st = c.get("/api/state").json()
    return (st["events"][0]["style_overrides"].get("fontsize") == 96), f"r={r.json()}"

def t_api_call_unknown_tool_400():
    c, _ = _client()
    r = c.post("/api/call", json={"tool": "no_such_tool", "args": {}})
    return (r.status_code >= 400 and "error" in r.json()), f"status={r.status_code}"

def t_ws_pushes_state_on_edit():
    c, ctx = _client()
    with c.websocket_connect("/ws") as ws:
        first = ws.receive_json()                      # initial state on connect
        assert first["type"] == "state"
        c.post("/api/call", json={"tool": "set_group_style", "args": {"gi": 0, "partial": {"fontsize": 70}}})
        msg = ws.receive_json()                         # pushed after the edit
    return (msg["type"] == "state" and msg["state"]["events"][0]["style_overrides"].get("fontsize") == 70), f"msg_type={msg['type']}"
```

- [ ] **Step 2: Run — verify fail** (`daemon.app` missing).

- [ ] **Step 3: Implement.** Create `daemon/api.py`:
```python
# daemon/api.py — Starlette handlers over a DaemonContext + Hub. Imports starlette only.
from starlette.responses import JSONResponse, Response
from mcp_server import tools

def _err(msg, code=400):
    return JSONResponse({"error": msg}, status_code=code)

def make_routes(ctx, hub):
    async def call(request):
        body = await request.json()
        name = body.get("tool"); args = body.get("args") or {}
        fn = getattr(tools, name, None)
        if name is None or fn is None or name.startswith("_"):
            return _err(f"unknown tool {name!r}")
        try:
            return JSONResponse({"result": fn(ctx, **args)})
        except TypeError as e:
            return _err(f"bad args for {name}: {e}")
        except Exception as e:
            return _err(f"{type(e).__name__}: {e}", 422)

    async def state(request):  return JSONResponse(tools.get_state(ctx))
    async def render(request): return JSONResponse(tools.get_render(ctx))
    async def ass(request):    return Response(tools.get_ass(ctx), media_type="text/plain")

    async def ws_endpoint(websocket):
        await websocket.accept()
        hub.register(websocket)
        try:
            await websocket.send_json({"type": "state", "state": tools.get_state(ctx)})
            while True:
                await websocket.receive_text()   # ignore inbound; keep the socket open
        except Exception:
            pass
        finally:
            hub.unregister(websocket)

    return call, state, render, ass, ws_endpoint
```
Create `daemon/app.py`:
```python
# daemon/app.py — build the unified Starlette app (/mcp + /api + /ws). Imports the SDK here.
import asyncio
from starlette.applications import Starlette
from starlette.routing import Route, WebSocketRoute, Mount
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from daemon.api import make_routes

def build_app(ctx, hub, token=None, projects_dir="projects"):
    call, state, render, ass, ws_endpoint = make_routes(ctx, hub)

    async def _startup():
        hub.bind_loop(asyncio.get_running_loop())

    routes = [
        Route("/api/call", call, methods=["POST"]),
        Route("/api/state", state, methods=["GET"]),
        Route("/api/render", render, methods=["GET"]),
        Route("/api/ass", ass, methods=["GET"]),
        WebSocketRoute("/ws", ws_endpoint),
    ]
    # /mcp co-mount (shared ctx) — added in Task 3.
    middleware = [Middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173",
                  "http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])]
    app = Starlette(routes=routes, middleware=middleware, on_startup=[_startup])
    app.state.ctx = ctx; app.state.hub = hub
    app.state.token = token; app.state.projects_dir = projects_dir
    return app
```

- [ ] **Step 4: Run** `.venv/bin/python tests/test_daemon.py` → all pass (5/5). The `t_ws_pushes_state_on_edit` proves on_change→broadcast under TestClient (the `_startup` binds the portal loop; the POST's `on_change` schedules the broadcast which the WS receives).

- [ ] **Step 5: Commit**
```bash
git add daemon/api.py daemon/app.py tests/test_daemon.py
git commit -m "feat(daemon): Starlette app with /api/call,/api/state,/ws state push"
```

---

## Task 3: Co-mount `/mcp` + shared-session proof

**Files:** Modify `daemon/app.py`; extend `tests/test_daemon.py`.

- [ ] **Step 1: Write failing tests** — add to `tests/test_daemon.py`:

```python
def t_mcp_mounted():
    c, _ = _client()
    # the SSE endpoint exists under /mcp (GET without proper accept still routes, not 404)
    r = c.get("/mcp/sse", headers={"accept": "text/event-stream"}, timeout=0.3) if False else None
    # Routing check without holding the stream open: assert the mount is registered.
    from daemon.app import build_app
    from daemon.hub import Hub; from daemon.context import DaemonContext
    hub = Hub(); ctx = DaemonContext(hub); ctx.load_lyrics("aligned_lyrics.json")
    app = build_app(ctx, hub)
    paths = []
    for route in app.routes:
        paths.append(getattr(route, "path", getattr(route, "path_format", "")))
    return (any(p == "/mcp" for p in paths)), f"paths={paths}"

def t_shared_session_mcp_edit_pushes_ws():
    # An edit made the way an MCP tool would (same ctx the /mcp app holds) pushes to /ws.
    c, ctx = _client()
    with c.websocket_connect("/ws") as ws:
        ws.receive_json()                                   # initial
        from mcp_server import tools
        tools.set_cue_style(ctx, [ctx.session.project["layout"][0]["lines"][0]["toks"][0]["ids"][0]],
                            {"primary": "#FF0000"})         # MCP-side edit on the shared ctx
        msg = ws.receive_json()
    return (msg["type"] == "state"), "shared-session push ok"
```
(Note: `t_shared_session_mcp_edit_pushes_ws` mutates via `ctx`+`tools` — exactly what the `/mcp` FastMCP tools do, since `build_server(ctx)` closes over the SAME `ctx`. This proves any-origin edits broadcast. A full SSE round-trip needs real sockets + the `websockets` lib, out of scope for the in-process suite.)

- [ ] **Step 2: Run — verify the mount test fails** (`/mcp` not mounted yet).

- [ ] **Step 3: Implement** — in `daemon/app.py`, mount the existing FastMCP SSE app over the SAME `ctx`. Add near the top: `from mcp_server.server import build_server`. In `build_app`, before constructing `routes`, build and mount it:
```python
    mcp_app = build_server(ctx).sse_app(mount_path="/mcp")
    routes = [
        Mount("/mcp", app=mcp_app),
        Route("/api/call", call, methods=["POST"]),
        Route("/api/state", state, methods=["GET"]),
        Route("/api/render", render, methods=["GET"]),
        Route("/api/ass", ass, methods=["GET"]),
        WebSocketRoute("/ws", ws_endpoint),
    ]
```
(`build_server(ctx)` is the existing function from Task-8 of the MCP plan; it closes over the SAME `ctx`, so MCP tool calls mutate the daemon's shared `Session` → `on_change` → `/ws` broadcast.)

- [ ] **Step 4: Run** `.venv/bin/python tests/test_daemon.py` → all pass (7/7). Also confirm the existing MCP suites still pass: `.venv/bin/python tests/test_mcp_server.py` (2/2), `.venv/bin/python tests/test_mcp.py` (16/16).

- [ ] **Step 5: Commit**
```bash
git add daemon/app.py tests/test_daemon.py
git commit -m "feat(daemon): co-mount /mcp over the shared session; prove cross-origin /ws push"
```

---

## Task 4: `/api/frame` + `/api/burn` + burn progress on `/ws`

**Files:** Modify `daemon/api.py`, `daemon/app.py`; extend `tests/test_daemon.py`.

- [ ] **Step 1: Write failing tests** — add to `tests/test_daemon.py`:

```python
def t_api_frame_png():
    c, ctx = _client(); ctx.set_globals({"play_w": 320, "play_h": 180})
    r = c.get("/api/frame?t=13")
    return (r.status_code == 200 and r.headers["content-type"].startswith("image/png")
            and r.content[:4] == b"\x89PNG"), f"status={r.status_code} ct={r.headers.get('content-type')}"

def t_api_burn_job():
    import subprocess, core, time
    subprocess.run([core.FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                    "-i", "color=c=navy:s=320x180:d=1", "/tmp/_kss_din.mp4"], check=True)
    c, ctx = _client(); ctx.set_globals({"play_w": 320, "play_h": 180})
    r = c.post("/api/burn", json={"out": "/tmp/_kss_dout.mp4", "video_in": "/tmp/_kss_din.mp4"})
    jid = r.json()["job_id"]; st = None
    for _ in range(200):
        st = c.get(f"/api/burn/{jid}").json()
        if st["done"]: break
        time.sleep(0.1)
    import os
    return (st and st["done"] and st["ok"] and os.path.isfile("/tmp/_kss_dout.mp4")), f"st={st}"
```

- [ ] **Step 2: Run — verify fail** (routes missing).

- [ ] **Step 3: Implement.** In `daemon/api.py` `make_routes`, add handlers (and return them):
```python
    async def frame(request):
        t = float(request.query_params.get("t", "0"))
        png = tools.render_frame(ctx, t)
        return Response(png, media_type="image/png")

    async def burn(request):
        body = await request.json()
        job = tools.burn(ctx, body["out"], body.get("video_in"))
        return JSONResponse(job)

    async def burn_status(request):
        try:
            return JSONResponse(tools.burn_status(ctx, request.path_params["job_id"]))
        except Exception as e:
            return _err(str(e), 404)
```
Update the `make_routes` return to include these: `return call, state, render, ass, ws_endpoint, frame, burn, burn_status`. In `daemon/app.py`, unpack the extra handlers and add routes:
```python
    call, state, render, ass, ws_endpoint, frame, burn, burn_status = make_routes(ctx, hub)
    ...
        Route("/api/frame", frame, methods=["GET"]),
        Route("/api/burn", burn, methods=["POST"]),
        Route("/api/burn/{job_id}", burn_status, methods=["GET"]),
```
(`render_frame`/`burn`/`burn_status` are the existing `tools.py` functions; `render_frame` shells out off the event loop — acceptable for a local single-user daemon. Burn progress is already in the job registry; `/ws` burn pushes are a Spec-B nicety and not required here.)

- [ ] **Step 4: Run** `.venv/bin/python tests/test_daemon.py` → all pass (9/9).

- [ ] **Step 5: Commit**
```bash
git add daemon/api.py daemon/app.py tests/test_daemon.py
git commit -m "feat(daemon): /api/frame (PNG) + /api/burn + burn status"
```

---

## Task 5: Project library

**Files:** Create `daemon/library.py`; modify `daemon/api.py`, `daemon/app.py`; extend `tests/test_daemon.py`.

- [ ] **Step 1: Write failing tests** — add to `tests/test_daemon.py`:

```python
def t_library_roundtrip():
    import shutil, os, json
    pdir = "/tmp/_kss_projects"; shutil.rmtree(pdir, ignore_errors=True); os.makedirs(pdir)
    c, ctx = _client()                      # _client uses projects_dir=/tmp/_kss_projects
    # new project from the repo's default lyrics
    c.post("/api/projects/new", json={"name": "demo", "lyrics_path": "aligned_lyrics.json"})
    c.post("/api/call", json={"tool": "set_group_style", "args": {"gi": 0, "partial": {"font": "Arial"}}})
    c.post("/api/projects/save", json={"name": "demo"})
    lst = c.get("/api/projects").json()
    assert "demo" in lst, lst
    # reset + open
    c2, ctx2 = _client()
    c2.post("/api/projects/open", json={"name": "demo"})
    st = c2.get("/api/state").json()
    return (st["events"][0]["style_overrides"].get("font") == "Arial"), f"lst={lst}"
```

- [ ] **Step 2: Run — verify fail** (library routes missing).

- [ ] **Step 3: Implement.** Create `daemon/library.py`:
```python
# daemon/library.py — self-contained project folders: <dir>/<name>/lyrics.json + project.json
import json, os, shutil
import engine
from mcp_server import tools

def list_projects(projects_dir):
    if not os.path.isdir(projects_dir):
        return []
    return sorted(n for n in os.listdir(projects_dir)
                  if os.path.isfile(os.path.join(projects_dir, n, "project.json")))

def new_project(projects_dir, name, lyrics_path):
    dst = os.path.join(projects_dir, name); os.makedirs(dst, exist_ok=True)
    shutil.copyfile(lyrics_path, os.path.join(dst, "lyrics.json"))

def open_project(ctx, projects_dir, name):
    folder = os.path.join(projects_dir, name)
    ctx.load_lyrics(os.path.join(folder, "lyrics.json"))
    pj = os.path.join(folder, "project.json")
    if os.path.isfile(pj):
        d = json.load(open(pj, encoding="utf-8"))
        if d.get("globals_style"):
            ctx.set_globals(d["globals_style"])
        engine.apply_cues(ctx.session.project, d.get("cues_v2") or {})
        ctx.session.set_project(ctx.session.project)   # fire on_change / reset undo

def save_project(ctx, projects_dir, name):
    folder = os.path.join(projects_dir, name); os.makedirs(folder, exist_ok=True)
    doc = {"globals_style": ctx.get_globals(), "cues_v2": engine.serialize_cues(ctx.session.project)}
    with open(os.path.join(folder, "project.json"), "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2)
```
In `daemon/api.py` `make_routes`, add (and include in the return tuple):
```python
    from daemon import library
    async def projects_list(request):
        return JSONResponse(library.list_projects(request.app.state.projects_dir))
    async def projects_new(request):
        b = await request.json()
        library.new_project(request.app.state.projects_dir, b["name"], b["lyrics_path"])
        library.open_project(ctx, request.app.state.projects_dir, b["name"])
        return JSONResponse({"opened": b["name"]})
    async def projects_open(request):
        b = await request.json()
        library.open_project(ctx, request.app.state.projects_dir, b["name"])
        return JSONResponse({"opened": b["name"]})
    async def projects_save(request):
        b = await request.json()
        library.save_project(ctx, request.app.state.projects_dir, b["name"])
        return JSONResponse({"saved": b["name"]})
```
Extend the `make_routes` return tuple with these four, unpack them in `app.py`, and add routes:
```python
        Route("/api/projects", projects_list, methods=["GET"]),
        Route("/api/projects/new", projects_new, methods=["POST"]),
        Route("/api/projects/open", projects_open, methods=["POST"]),
        Route("/api/projects/save", projects_save, methods=["POST"]),
```
(The `make_routes` return is getting long; group the handlers into a dict instead if cleaner — return a single `dict` of name→handler and have `app.py` build routes from it. Choose whichever keeps both files readable; keep the route paths/methods above exact.)

- [ ] **Step 4: Run** `.venv/bin/python tests/test_daemon.py` → all pass (10/10).

- [ ] **Step 5: Commit**
```bash
git add daemon/library.py daemon/api.py daemon/app.py tests/test_daemon.py
git commit -m "feat(daemon): self-contained project library (list/new/open/save)"
```

---

## Task 6: Entrypoint + loopback/token + deps

**Files:** Create `daemon/__main__.py`; modify `daemon/app.py` (token guard), `pyproject.toml`; extend `tests/test_daemon.py`.

- [ ] **Step 1: Write a failing token test** — add to `tests/test_daemon.py`:

```python
def t_token_guard():
    hub = Hub(); ctx = DaemonContext(hub); ctx.load_lyrics("aligned_lyrics.json")
    app = build_app(ctx, hub, token="secret", projects_dir="/tmp/_kss_projects")
    c = TestClient(app)
    r1 = c.get("/api/state")                                   # no token -> 401
    r2 = c.get("/api/state", headers={"authorization": "Bearer secret"})  # ok
    return (r1.status_code == 401 and r2.status_code == 200), f"{r1.status_code},{r2.status_code}"
```

- [ ] **Step 2: Run — verify fail** (no token guard yet → both 200).

- [ ] **Step 3: Implement the token guard** in `daemon/app.py` as a tiny middleware applied when `token` is set (exempt `/mcp` which carries its own auth, OR include it — keep it simple: guard only `/api` and `/ws` paths). Add:
```python
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import PlainTextResponse

class _Auth(BaseHTTPMiddleware):
    def __init__(self, app, token): super().__init__(app); self.token = token
    async def dispatch(self, request, call_next):
        if request.url.path.startswith("/api") and request.headers.get("authorization") != f"Bearer {self.token}":
            return PlainTextResponse("unauthorized", status_code=401)
        return await call_next(request)
```
and in `build_app`, when `token`: append `Middleware(_Auth, token=token)` to `middleware`. (WS auth: Starlette `BaseHTTPMiddleware` doesn't cover WS; for a local tool, guarding `/api` is sufficient — note this.)

Create `daemon/__main__.py`:
```python
# python -m daemon [--port 8770] [--projects-dir projects] [--json aligned_lyrics.json]
import argparse, os
import uvicorn
from daemon.hub import Hub
from daemon.context import DaemonContext
from daemon.app import build_app

def main(argv=None):
    ap = argparse.ArgumentParser(prog="daemon")
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--projects-dir", default="projects")
    ap.add_argument("--json", default="aligned_lyrics.json")
    a = ap.parse_args(argv)
    hub = Hub(); ctx = DaemonContext(hub)
    if os.path.isfile(a.json):
        ctx.load_lyrics(a.json)
    app = build_app(ctx, hub, token=os.environ.get("KSS_MCP_TOKEN"), projects_dir=a.projects_dir)
    uvicorn.run(app, host="127.0.0.1", port=a.port, log_level="warning")  # loopback-only

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Declare deps + run.** In `pyproject.toml` `[tool.poetry.group.mcp.dependencies]`, add `httpx = ">=0.27"` and `websockets = ">=12"` (uvicorn needs `websockets` to serve `/ws` over real sockets to a browser; tests use TestClient and don't need it). Install the runtime WS dep into the venv: `.venv/bin/pip install websockets`. Then:
  - `.venv/bin/python tests/test_daemon.py` → all pass (11/11).
  - Manual run smoke: `.venv/bin/python -m daemon --port 8771 &` then `sleep 2; curl -s 127.0.0.1:8771/api/state | head -c 80; kill %1` — shows JSON. (Or use a background-run tool; ensure the port is free.)

- [ ] **Step 5: Commit**
```bash
git add daemon/__main__.py daemon/app.py pyproject.toml tests/test_daemon.py
git commit -m "feat(daemon): entrypoint + loopback/token guard; declare ws/httpx deps"
```

---

## Task 7: Docs + final verification

**Files:** Modify `README.md`, `CLAUDE.md`.

- [ ] **Step 1:** README/CLAUDE — add an "Engine daemon" section: what it is (one process merging `/mcp` + `/api` + `/ws` over a shared `Session`), how to run (`python -m daemon --port 8770`, `poetry install --with mcp` for `websockets`), the `/api` surface summary + `/ws` state-push, that it runs ALONGSIDE the untouched CTk app on the shared engine, loopback-only + `KSS_MCP_TOKEN`, and that the React UI (Spec B) + Tauri shell (Spec C) come next. In CLAUDE.md note `daemon/` reuses `EngineContext` + `mcp_server/tools.py`; `DaemonContext` is synchronous (no Tk) and its `Session.on_change` broadcasts via the `Hub`.

- [ ] **Step 2: Final verification.**
  - `.venv/bin/python tests/test_daemon.py` (11/11).
  - Regression: `.venv/bin/python tests/test_mcp.py` (16/16), `tests/test_mcp_server.py` (2/2), `tests/test_engine.py` + `test_engine_*.py`, `tests/test_v2_ui.py` (27/27) — all green.
  - Headless import: `env -u DISPLAY .venv/bin/python -c "import daemon.app, daemon.context, daemon.hub, daemon.library; print('daemon import ok')"`.
  - The old CTk app still launches: `.venv/bin/python -c "import karaoke_subtitle_gui; print('ctk app import ok')"`.
  - Manual: `python -m daemon`, open two `/ws` clients (or curl `/api/state`), make an `/api/call` edit, confirm both clients receive the push; confirm `/mcp` reachable.

- [ ] **Step 3: Commit (if any tweaks)**
```bash
git add -A && git commit -m "docs+test: engine daemon docs + final verification (Spec A)"
```

---

## Self-review notes (coverage map)
- Spec §Architecture (DaemonContext, Hub, on_change→WS) → Tasks 1,2. §`/mcp` co-mount + shared session → Task 3. §Web API (call/state/render/ass/frame/burn) → Tasks 2,4. §Project library (self-contained folders) → Task 5. §Entrypoint/loopback/token + deps → Task 6. §Testing (TestClient HTTP+WS, shared-session push, frame PNG, library roundtrip, token) → Tasks 1–6. §Docs + coexistence-with-CTk verify → Task 7.
- Reuse: `mcp_server/tools.py` (all tools), `mcp_server.context.HeadlessContext` (DaemonContext base), `mcp_server.server.build_server` (the `/mcp` app) — no engine changes.
- Decisions enforced: unified daemon (Tasks 2–3), full-state WS push (Task 2 `_fire`→`get_state`), co-mounted `/mcp` sharing the session (Task 3), self-contained library (Task 5), loopback+token (Task 6), CTk untouched (Task 7 verify; no edits to `app_base.py`/`karaoke_subtitle_gui.py` in any task).
- Out of scope (no task here): the React UI (Spec B), Tauri shell (Spec C), word-model hardening (Spec 2). The `daemon/api.py` return-tuple grows across tasks — Task 5 notes switching to a name→handler dict if it hurts readability.
