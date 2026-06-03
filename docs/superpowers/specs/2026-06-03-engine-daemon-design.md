# Unified engine daemon (Spec A) — merge HTTP MCP + web UI over one shared Session

**Date:** 2026-06-03
**Status:** Approved for planning
**Branch:** `feat/design-system`
**Siblings:** Spec B (next) — the React/Vite v3 web UI built against this daemon. Spec C (deferred) — Tauri desktop shell (needs Rust + webkit2gtk, not installable here). "Spec 2" (separate) — self-contained word model + manual word-level edits.

## Context

The `engine/` is a UI-free core with a plain-dict project, `controller.Session` (project + undo/redo + `on_change`), and a reusable tool layer (`mcp_server/tools.py`) over an `EngineContext`. We have an MCP server (HTTP/SSE) for AI agents. We now want the **v3 Synthwave UI** (per `design-system/`) as a **web app**, and to **merge the HTTP MCP server and that web UI over one shared engine `Session`** — so an AI (MCP) and a human (web UI) edit the *same* live project and see each other's changes. This new web front-end runs **alongside** the existing CustomTkinter app (both feasible because they share `engine`); the CTk app is **untouched**.

This spec covers **only the daemon** (the backend/merge point). The React UI is Spec B. **Web-first:** the daemon + a browser UI run and are testable in this environment now (Python + uvicorn + Node present; Tauri/Rust/webkit absent → desktop shell deferred).

## Decisions (locked)

| Topic | Decision |
|---|---|
| Topology | **Unified daemon** — one process, one `Session`, hosting `/mcp` (FastMCP SSE) + `/api` (web HTTP) + `/ws` (WebSocket state push) on one uvicorn/Starlette server. |
| Engine reuse | Reuse `EngineContext` + `mcp_server/tools.py` verbatim; new `DaemonContext` (synchronous, dict globals, no Tk). |
| MCP | **Co-mounted** at `/mcp` on the same server (the existing `FastMCP` app), sharing the daemon's `Session`. |
| State sync | **Full-state push** over `/ws` on every `Session.on_change` (diffs are a later optimization). Shared undo/redo timeline across AI + web clients. |
| Coexistence | The **old CTk app is untouched** and runs alongside (separate process, same `engine`). Not replaced. |
| Project library | A `projects/` dir; each project is a **self-contained folder** (`lyrics.json` + `project.json` = globals + cues) so opening needs no external lyrics path. |
| Build/run | Daemon serves `/api`+`/ws`+`/mcp`; in dev the Vite server (Spec B) proxies these. Browser-runnable here. |

## Architecture

New top-level package **`daemon/`** (depends on `engine`, `controller`, `mcp_server`; imports the `mcp` SDK + `starlette`/`uvicorn` only here — `engine`/`controller`/`mcp_server.tools`/`mcp_server.context` stay SDK-free).

```
daemon/
  context.py    DaemonContext(EngineContext) — sync, dict globals, on_change -> WS broadcast
  hub.py        connection registry + async broadcast (state push to all /ws clients)
  api.py        Starlette routes: /api/* (call, state, render, frame, burn, projects)
  library.py    project library over a projects/ folder (self-contained project folders)
  app.py        build_app(ctx, hub) -> Starlette: mount /mcp (FastMCP sse_app), add /api, /ws
  __main__.py   python -m daemon [--port 8770] [--projects-dir ./projects] [--token]
```

```
            ┌──────────────── engine daemon (one uvicorn process) ───────────────┐
  AI ──SSE──▶ /mcp   (mcp_server.server.build_server(ctx).sse_app())  ┐            │
 React UI ─▶ /api   (POST /call -> tools.<name>(ctx,**args); GET …)   ├▶ Daemon   │
   (Spec B) ◀WS─ /ws  (full-state push on on_change)  ◀──broadcast────┘  Context  │
            │                         ▼                                  ▼        │
            │                 mcp_server/tools.py  ───────────────▶  ONE Session  │
            │      Session.on_change ─▶ hub.broadcast(get_state) ─▶ all /ws + (MCP)│
            └─────────────────────────────────────────────────────────────────────┘
   old CTk app: separate process, same engine package, its own session — UNCHANGED
```

### DaemonContext (`daemon/context.py`)
Like `HeadlessContext` (synchronous `run(fn)=fn()`, dict globals, `cfg()`), but its `Session` is created with `on_change=self._fire`, where `_fire` asks the **hub** to broadcast the latest state to all WS clients. No Tk marshaling (the daemon is not a Tk app). The same `tools.py` functions operate on it unchanged.

### on_change → WS push (the concurrency crux)
`Session.on_change` is a **synchronous** callback fired inside a tool mutation, but WS sends are **async**. Mechanism: the daemon captures the running asyncio loop at startup; `DaemonContext._fire` calls `loop.call_soon_threadsafe(hub.schedule_broadcast)`, which `create_task`s an async `hub.broadcast(state)` that `await`s a send to each connected client (dropping dead ones). This works whether the mutation originates from an `/api` handler, a `/mcp` tool call, or a background burn thread. Full state is computed via `tools.get_state` (+ render summary) — cheap at this data size.

### Web API (`daemon/api.py`) — what Spec B calls
- `POST /api/call` `{ "tool": str, "args": {...} }` → `{ "result": <tool return> }` (the whole `tools.py` surface). Errors → `{ "error": msg }` with 4xx.
- `GET /api/state` → `tools.get_state`; `GET /api/render`, `GET /api/ass`.
- `GET /api/frame?t=<sec>` → `image/png` (`tools.render_frame`).
- `POST /api/burn` `{out, video_in?}` → `{job_id}`; `GET /api/burn/{job_id}` → status; progress also pushed on `/ws`.
- Project library: `GET /api/projects` (list), `POST /api/projects/open` `{name}`, `POST /api/projects/save` `{name}`, `POST /api/projects/new` `{name, lyrics_upload|builtin}`.
- `WS /ws` → on connect: send `{type:"state", state}`; thereafter broadcast `{type:"state", state}` on every change and `{type:"burn", job}` on burn progress.
- Loopback-only bind (`127.0.0.1`), optional `KSS_MCP_TOKEN` bearer (shared with `/mcp`). CORS allowed for the Vite dev origin (`127.0.0.1:5173`) in dev.

### Project library (`daemon/library.py`)
A `projects/` directory; each project is a **folder** containing `lyrics.json` (the Suno aligned-lyrics) + `project.json` (`{globals_style, cues_v2}`). **Self-contained** — open = `ctx.load_lyrics(<folder>/lyrics.json)` then `tools.load_project`-equivalent applying `project.json` (nwords matches because the lyrics are bundled). `new` = create a folder, copy in a lyrics.json (uploaded or the repo default). `save` = write `project.json`. This sidesteps the nwords/path fragility without the full Spec-2 model change.

## Concurrency / consistency
Single-process async server. Tool mutations run synchronously in the handling task (fast); `render_frame`/`burn` shell out (burn in a worker thread, as today). One `Session` ⇒ AI (`/mcp`) and human (`/ws` clients) share one project + one undo/redo timeline; every edit broadcasts to all UI clients. The old CTk app is a *separate* process and does **not** share this live session (it has its own) — "alongside," not "joined."

## Testing
- `tests/test_daemon.py` (Python, `httpx` + `websockets`/`httpx-ws`, start the daemon in a thread on an ephemeral port):
  - `POST /api/call set_group_style` → 200 + `GET /api/state` reflects it.
  - A connected `/ws` client receives a `{type:"state"}` push after that edit (proves on_change→broadcast).
  - `/mcp` is reachable on the same server (initialize + tools/list over SSE) and an MCP `set_cue_style` ALSO triggers a `/ws` push (proves the shared session).
  - `GET /api/frame?t=13` → PNG magic bytes.
  - Library: `new` → `save` → `open` roundtrip preserves group/cue style.
  - Loopback guard + token (401 without token when set).
- `httpx`/`websockets` added to the optional `mcp`/daemon dependency group.

## Verification
1. `python -m daemon --port 8770` starts; `curl 127.0.0.1:8770/api/state` returns JSON.
2. Open two `/ws` clients; a `POST /api/call` edit pushes new state to both.
3. An MCP client on `/mcp` edits; the `/ws` clients see it (shared session).
4. `GET /api/frame?t=13` saves a PNG; `POST /api/burn` reaches done/ok.
5. The old CTk app still launches and works unchanged.

## Out of scope
The React/Vite UI (Spec B), the Tauri shell (Spec C), and self-contained-word-model / manual word edits (Spec 2).
