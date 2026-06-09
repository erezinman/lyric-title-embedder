# Karaoke Subtitle Studio (v2)

Turn word-timed lyrics (Suno `aligned_lyrics.json`) into **styled, animated per-word
subtitles** as `.ass` (libass) or `.srt`, with a **live preview** over your video.

The **editor is the React/Vite web app** (served by the engine daemon): a real
libass-in-wasm live preview, a 4-column cue dock (layout · fade-in · fade-out · animation),
a draggable/scrubbable waveform, and an Inspector for the style waterfall + the general
**animation system** (fades, sweeps, pops, wipes, slides — fade is just a special case). It
runs in the browser or wrapped in the **Electron desktop shell** (`./run-desktop.sh`).

See **docs/FEATURES.md** for the complete web editor + animations reference, and
**docs/GLOSSARY.md** for vocabulary.

### Project layout

```
engine/                      # UI-free engine package (v3-portable)
  model.py                   #   project shape, make_project, STYLE_KEYS/CUE_STYLE_KEYS,
                             #   resolve_style, BUILTIN, PALETTE
  render.py                  #   project_to_render → render-groups (group_style + per-word style)
  ass.py                     #   build_ass (one [V4+ Styles] per distinct box-mode; inline deltas)
  io.py                      #   serialize_project / load_project (portable project file)
  mutations.py               #   pure (project, …) edits incl. set_group_style / set_cue_style
  ffmpeg.py                  #   command builders + headless run(cmd, progress_cb)
controller.py                # Session: project + undo/redo + on_change; UI-free
core.py                      # shared UI-free helpers: parsing, constants (used by engine + daemon)
daemon/                      # Starlette backend: /api (HTTP) + /ws (WebSocket) + /mcp; serves web/dist
mcp_server/                  # MCP tool layer (stdio + HTTP/SSE) over the shared engine Session
web/                         # React/Vite web editor (the UI) — built to web/dist
desktop/                     # Electron desktop shell (wraps the web UI; ./run-desktop.sh)
ass_from_api.py / build_from_api.py / build_srts.py   # headless batch generators
tests/test_engine.py         # headless engine/controller unit tests
```

`engine/` + `controller.py` are the UI-free portable core (`design-system/HANDOFF_v3.md`),
reused unchanged by the daemon and the headless MCP/batch tooling.

---

## Requirements

| Need | Why | Notes |
|------|-----|-------|
| Python 3.10+ | engine + daemon | |
| **ffmpeg + libass** | exact libass preview & burning into video | `sudo apt install ffmpeg`; the build must report `--enable-libass` |
| **ffprobe** | burn progress (input duration) | ships with ffmpeg |
| **fontconfig** (`fc-list`, `fc-match`) | font picker + per-font sizing | standard on Linux |
| **Node.js** | the web editor (Vite) + Electron desktop shell | for `./run.sh` / `./run-desktop.sh` |
| **Pillow** (managed dep) | makes the preview font size match libass exactly | optional; without it a 0.82 fallback scale is used |

ffmpeg/ffprobe and fontconfig are system tools. Pillow is installed into the poetry venv.

## Setup & run

```bash
cd karaoke-subtitle-studio
poetry install            # creates the venv, installs deps

# WEB APP (daemon :8770 + web editor :5173) — the editor
./run.sh                  # Ctrl-C stops both; ./kill.sh also stops them
# then open http://localhost:5173 — project library → open or create a project

# DESKTOP (Electron) SHELL — wraps the web UI in a native window
./run-desktop.sh          # builds web/dist if missing; Electron spawns + supervises the daemon
```

The web app is **server-authoritative**: a single daemon holds the open project; every edit
goes through `/api/call` and broadcasts to all clients (browsers *and* MCP agents) over
`/ws`. Edits **autosave** (debounced) to the project folder — there is no save button.
See **docs/FEATURES.md** for the complete feature/behavior reference.

---

## Persistence

**Save project** writes one portable JSON: global style + fade defaults + placement + theme +
the full cue model (`layout` events with per-group `style`, tokens with per-cue `style`, fade tags
with overrides, globals, palette). **Source paths are not stored**, so the file is portable.
Loading it onto the same `aligned_lyrics.json` restores everything exactly; onto a different source
it keeps style/theme and skips cues with a warning. Old preset files (no `style` keys) load with
all overrides defaulting to inherit.

---

## Batch scripts

Headless generators (no GUI). Run from the project root so `aligned_lyrics.json` resolves.

- **`ass_from_api.py`** — `aligned_lyrics.json` → `bleating.ass` with per-word fade-in. Style is a
  config block at the top of the file.
- **`build_from_api.py`** — emits several `.srt` variants from the API timings.
- **`build_srts.py`** — the original hand-mapped SRT variants. Kept for reference.
- **`tools/suno_fetch.py`** — fetch a song's `aligned_lyrics.json` straight from Suno:
  `python tools/suno_fetch.py https://suno.com/song/<id> [-o OUT.json] [-f]`. Prompts (hidden) for
  your Suno session token — copy it from DevTools (Network → any `studio-api` request →
  `Authorization` header); it expires within minutes, so grab it right before fetching. The token
  is never stored.

---

## Testing

```bash
# Headless engine / daemon / tools / animation suites (no display; run any tests/test_*.py)
.venv/bin/python tests/test_engine.py
.venv/bin/python tests/test_anim_compile.py   # animation resolve/compile, etc.

# Web unit+interaction-audit suites (vitest/jsdom — 722 tests / 58 files)
npm --prefix web run test

# End-to-end (real daemon + chromium; seeds a temp project, asserts /api/state + UI)
# 67 specs / 9 files, incl. a 14-spec jassub libass-in-wasm pixel tier
cd web && npx playwright test
```

Current test matrix: **722 vitest** (58 files) · **67 Playwright e2e** (incl. 14 jassub pixel
specs) · **81 pytest + 20 legacy stdlib scripts**.

`tests/test_engine.py` (+ the `test_anim_*` suites) — headless units covering `engine/`,
the animation model/resolve/compile/migration, and `controller.Session`, no display required.
Engine code is TDD-first.

The suites assert **behavior and render-model correctness**; the jassub pixel tier additionally
asserts the real libass render.

---

## MCP server

Karaoke Subtitle Studio exposes an **MCP (Model Context Protocol) server** so AI assistants and
automation tools can read and edit the karaoke project programmatically.

### Install the optional dependency

```bash
poetry install --with mcp   # adds the `mcp` SDK + uvicorn
```

The core app and all existing test suites run without this group.

### Run modes

**Headless / stdio** — the MCP client spawns a subprocess with no GUI:

```bash
.venv/bin/python -m mcp_server --json aligned_lyrics.json
# optional: --project my.kss  --video clip.mp4
```

**Live / HTTP+SSE** — the engine daemon co-mounts the MCP server at `/mcp` (see
[Engine daemon](#engine-daemon-v3-backend)); an MCP endpoint is served alongside the live web
editing session:

```bash
python -m daemon [--port 8770]
# MCP endpoint: http://127.0.0.1:8770/mcp  (loopback only)
```

In live mode every MCP edit is applied through the daemon's shared `controller.Session` —
**undo/redo is a single timeline shared between the human in the web editor and the AI client**.
Web-UI edits are immediately visible to the MCP client over `/ws`, and vice-versa.

The server binds to loopback only (`127.0.0.1`). Set `KSS_MCP_TOKEN` to require a bearer token.

### MCP client config (stdio mode)

```json
{
  "mcpServers": {
    "karaoke": {
      "command": "python",
      "args": ["-m", "mcp_server", "--json", "aligned_lyrics.json"],
      "cwd": "/path/to/karaoke-subtitle-studio"
    }
  }
}
```

### Tool catalog

| Category | Tools |
|----------|-------|
| **Inspect** | `get_state`, `get_project`, `list_groups`, `get_group`, `list_words`, `get_word`, `get_render`, `get_ass` |
| **Style / edit** | `set_group_style`, `set_cue_style`, `set_layout_props`, `merge_events` / `ungroup_event` / `split_event`, `break_line` / `join_lines`, `merge_words` / `merge_word_span` / `merge_words_run` / `unmerge_words`, `delete_words` / `restore_words` |
| **Animations** | `add_animation` / `remove_animation` / `restore_animation` / `set_animation_props` (scope `global`\|`group`\|`tag`; `cue` aliases `tag`) |
| **Undo / redo** | `undo`, `redo` |
| **Globals** | `get_globals`, `set_globals` |
| **Project / build** | `load_lyrics`, `load_project` / `save_project`, `generate_ass`, `render_frame` (→ PNG), `burn` / `burn_status` |
| **Resources** | `karaoke://project`, `karaoke://ass` |

> The legacy fade tools (`make_fade_tag`, `clear_fade_tag`, `set_fade_tag_props`,
> `set_group_fade`, `set_fade_defaults`) and per-event `accumulate` were **removed** when the
> general animation system landed — a fade is now an `alpha` animation. There is no WS/MCP
> backward-compat shim, but legacy project **files** auto-migrate on open.

---

## Engine daemon (v3 backend)

The `daemon/` package is a **unified backend process** that merges three services over **one shared
engine `Session`**:

| Endpoint | What it does |
|----------|-------------|
| **`/mcp`** | The existing FastMCP SSE server (AI clients) — co-mounted on the same uvicorn process, sharing the daemon's `Session`. |
| **`/api/*`** | A web HTTP API — `POST /api/call {tool, args}` (the full `mcp_server/tools.py` surface), `GET /api/state`, `GET /api/render`, `GET /api/ass`, `GET /api/frame?t=` (PNG), `POST /api/burn` + `GET /api/burn/{job_id}`, `GET /api/env` (same-host flag), and a project library (`GET /api/projects`, `POST /api/projects/create` — multipart create/import from a Suno JSON or SRT upload/server-path with optional video — plus `POST /api/projects/new|open|save`). |
| **`/ws`** | A WebSocket that pushes full state (`{type:"state", state}`) to every connected client on every `Session.on_change` — so AI (MCP) and web-UI edits broadcast to all clients (shared undo/redo timeline). |

### Run

```bash
poetry install --with mcp   # adds mcp SDK + uvicorn + websockets
python -m daemon [--port 8770] [--projects-dir projects] [--json aligned_lyrics.json]
```

The daemon binds to loopback only (`127.0.0.1`). Set `KSS_MCP_TOKEN` to require a bearer token on
`/api` routes.

### Project library

Projects live as self-contained folders under `--projects-dir` (default: `projects/`): each folder
holds `lyrics.json` + `project.json` (globals + full cue model), so opening a project requires no
external lyrics path argument.

### Serving the web UI

When started with `--web-dist` (or with a built `web/dist` auto-detected), the daemon also serves
the built React SPA, so a single process backs both the API and the UI. The **Electron desktop
shell** (`desktop/`, launched via `./run-desktop.sh`) spawns and supervises this daemon and points
a native window at it.

---

## Known limitations / gotchas

- **Web app**: the live preview is a **real libass render** (jassub-in-wasm), not a CSS
  approximation — it matches Exact mode. Animations (incl. fades) are edited there.
- `\pos`-off (margin) mode can't push bottom-anchored text above the vertical center (libass clamp).
- Box-mode (`BorderStyle`) is **group-level only** — `BorderStyle` has no inline override tag in
  ASS, so all cues in one event share box-mode.
- Fade groups can span events; the boundary-word default keeps that sane, but an overridden trigger
  outside an event's window will clamp.
- Burn progress polls ffmpeg on a worker thread; very short clips may jump straight to 100%.

See **CLAUDE.md** for data provenance (the Suno API), the ASS rendering techniques, and
engineering notes.
