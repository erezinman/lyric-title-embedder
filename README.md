# Karaoke Subtitle Studio (v2)

Turn word-timed lyrics (Suno `aligned_lyrics.json`) into **styled, animated per-word
subtitles** as `.ass` (libass) or `.srt`, with a **live preview** over your video.

The **primary editor is the React/Vite web app** (served by the engine daemon): a real
libass-in-wasm live preview, a 4-column cue dock (layout · fade-in · fade-out · animation),
a draggable/scrubbable waveform, and an Inspector for the style waterfall + the general
**animation system** (fades, sweeps, pops, wipes, slides — fade is just a special case).

A **legacy CustomTkinter desktop app** still ships (frozen — no animation UI): a merged
single-window editor with a 3-lane cue dock (layout, fade-in, fade-out) and a
**Style | Inspector** left rail for global, per-group, and per-cue style overrides. The
sections below document the Tk app; see **docs/FEATURES.md** for the web editor + animations,
and **docs/GLOSSARY.md** for vocabulary.

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
controller.py                # Session: project + undo/redo + on_change; no tkinter
core.py                      # shared UI-free helpers: parsing, constants (used by engine + view)
app_base.py                  # CTk view engine: App(ctk.CTk) — preview, burn, dock, drag
karaoke_subtitle_gui.py      # THE app — AppV2 binding + CueDock  ← run this
old/karaoke_subtitle_gui.py  # archived v1 (tree-based editor), kept runnable
ass_from_api.py / build_from_api.py / build_srts.py   # headless batch generators
tests/test_v2_ui.py          # 26-check UI regression suite
tests/test_engine.py         # headless engine/controller unit tests
```

`engine/` + `controller.py` are the UI-free portable core (`design-system/HANDOFF_v3.md`);
a future Tauri/React v3 is a **view-only rewrite** of `app_base.py` +
`karaoke_subtitle_gui.py` that reuses the engine unchanged. `old/` imports only `core.py`
and runs in isolation.

---

## Requirements

| Need | Why | Notes |
|------|-----|-------|
| Python 3.10+ with **tkinter** | the GUI | `sudo apt install python3-tk` if missing |
| **customtkinter** (managed dep) | modern themed UI chrome | installed into the poetry venv |
| **ffmpeg + libass** | exact libass preview & burning into video | `sudo apt install ffmpeg`; the build must report `--enable-libass` |
| **ffprobe** | burn progress (input duration) | ships with ffmpeg |
| **fontconfig** (`fc-list`, `fc-match`) | font picker + per-font sizing | standard on Linux |
| **Pillow** (managed dep) | makes the preview font size match libass exactly | optional; without it a 0.82 fallback scale is used |

Everything except Pillow is a system tool. Pillow is installed into the poetry venv.

## Setup & run

```bash
cd karaoke-subtitle-studio
poetry install            # creates the venv, installs deps

# WEB APP (daemon :8770 + web editor :5173) — the primary editor
./run.sh                  # Ctrl-C stops both; ./kill.sh also stops them
# then open http://localhost:5173 — project library → open or create a project

# DESKTOP (Tk) APP
poetry run python karaoke_subtitle_gui.py
poetry run python old/karaoke_subtitle_gui.py      # archived v1 (optional)
```

The web app is **server-authoritative**: a single daemon holds the open project; every edit
goes through `/api/call` and broadcasts to all clients (browsers *and* MCP agents) over
`/ws`. Edits **autosave** (debounced) to the project folder — there is no save button.
See **docs/FEATURES.md** for the complete feature/behavior reference.

(If you don't use poetry, the Tk app also runs under any Python 3.10+ with tkinter; Pillow is optional.)

---

## The main window

A single merged window: **toolbar** at the top; **Style | Inspector left rail** on the left;
**live preview** in the center; **3-lane cue dock** at the bottom (adjustable height, detachable);
action bar + status log at the very bottom.

### Toolbar
- **Undo / Redo** — history via `controller.Session` (deep-copy snapshots).
- **Theme** — Light / Dark / System.

### Input / Output (Style tab)
- **aligned_lyrics.json** — the word-timed source (file picker). Changing it reloads the project.
- **Output .ass** — where Generate writes the subtitle.
- **Input video (optional)** — used as the live preview background and the burn source.
- **Output video** — burn destination.

### Style panel — global defaults
- **Font family** — editable combobox of all system families; **Choose…** opens a searchable
  picker dialog with a live font preview.
- **Font size** — in PlayRes pixels (your canvas resolution).
- **Bold** — toggle.
- **Alignment (anchor)** — numpad positions 1–9. Sets the text anchor.
- **Free placement (\pos)** — when on (default), text is placed by absolute `\pos(x,y)` derived
  from the on-screen box. When off, classic margin placement.
- **Fade-in (ms/word)** — default per-word fade-in duration.
- **Group by** — `section` or `line` when first building the cue project.
- **Skip '---' lines** — drop bare separator lines from the source.
- **Canvas W × H** — reference resolution; match your video (e.g. 1920×1080).
- **Margin L / R / V** — the bounding box edges (also driven by dragging on the preview).
- **Text / Outline / Box-shadow color** — color pickers.
- **Box alpha** — `00`=opaque … `FF`=clear.
- **Border style** — `1` = outline+shadow, `3` = opaque box behind text.
- **Outline width**, **Shadow depth** — in pixels.

### Inspector tab — per-group and per-cue style overrides

The **global < group < cue waterfall** (most specific wins). `None`/absent = inherit; the
inspector shows the inherited value as a grey hint.

- **WORD (cue)** — selected token: per-cue overrides for font, size, bold, primary/outline/box
  colors, box alpha, outline width, shadow depth. Blank = inherit.
- **GROUP** — selected event header: same set **plus** box-mode (`BorderStyle`). Box-mode cannot
  be per-cue (hard constraint — a `Dialogue` references one `[V4+ Styles]` and `BorderStyle` has
  no inline tag).
- **GLOBAL** — read-only reflection of the global defaults (edited in the Style tab).

### Preview / placement pane
- **Time slider** + time label — scrub the song. On release it (optionally) renders the exact frame.
- **Auto (libass)** — when on, releasing the slider/box renders the exact libass frame.
- **Render now** — force an exact libass render at the current time.
- **Canvas** — live subtitle on the video frame (or a solid background). Draggable bounding box
  with 8 handles. The on-canvas text is a **per-cue approximation** (each word's resolved
  font/size/colors); **Render now / Auto** is pixel-exact.

### Cue dock (bottom)
A 3-lane pane — **LAYOUT · FADE-IN · FADE-OUT** — one row per word under collapsible per-event
headers. Synced scrolling. Drag the separator above to adjust the dock height; use **Detach ⧉**
to pop it into its own window (recovers the old two-window workflow).

See [The cue dock](#the-cue-dock) below for full detail.

### Action bar & status
- **Generate .ass** — writes the subtitle file (instant).
- **Generate + Burn video** — burns the subtitle into the input video with ffmpeg, showing a
  progress bar. Runs off the UI thread.
- **Save project / Load project** — persist *everything* (global style + fade defaults + placement
  + theme + the full cue model incl. per-group and per-cue `style`) to a portable JSON. Source
  paths are **not stored**. Loading an older file without `style` fields treats all overrides as
  inherit. Loading against a different lyrics source keeps style/theme and warns that cues were
  skipped.
- **Quit**.
- A status log strip reports actions, warnings, and errors.

---

## The cue dock

> This describes the **Tk app's** 3-lane fade dock, which is frozen on the legacy fade model.
> The **web editor** has a 4th **ANIMATION** column and edits the general animation system
> (fade is just one preset) — see **docs/FEATURES.md** §2a and §5.5.

Three synced panes — **LAYOUT · FADE-IN · FADE-OUT** — one row per word, under collapsible
per-event headers.

### The model (group → line → word, plus fade tags)
- **Words** are immutable canonical atoms with their source timings.
- **Layout** = ordered **events** (one ASS Dialogue each). An event holds **lines** (the `\N`
  breaks) holding **tokens** (rendered words; tokens can merge several source words). Each event
  carries an optional `style` dict (per-group overrides); each token carries an optional `style`
  dict (per-cue overrides, no box-mode).
- **Fade-in tags** and **fade-out tags** are independent sets of words that fade together.
- **Globals** hold the default fade-in ms, fade-out ms, and linger.

**Resolution is reactive — most specific wins:** `word → tag → global → built-in`. Editing a
global instantly re-resolves *every* inherited value shown in the table.

### Visual language
- Each fade group gets a **background color** from a 10-color palette (full-width color bar).
- **Grey italic** = inherited default. **Solid** = overridden. **Strikethrough/dim** = deleted
  (reversible).
- Cells show the **resolved value** (e.g. `@12.53/1000` = trigger 12.53s / 1000ms).

### Selecting
- Click a **fade cell** → selects that word's whole group (members highlighted).
- Click the **same cell again** → drills down to the single word.
- **Ctrl-click** fade cells → build a multi-word selection (then Group).
- Click a **layout header** → selects that event (Inspector shows GROUP tier).
- **Ctrl-click** headers to select several (for merge). Click **▸/▾** to collapse/expand.
- Click a **word in the LAYOUT lane** → selects the word (Inspector shows WORD tier).

### Toolbar ops
- **Group** — fade lane: make the selected words a fade group. Layout lane: merge adjacent events.
- **Ungroup** — fade lane: dissolve the group. Layout lane: split an event into one event per line.
- **Split event** — split the selected word's event so its line starts a new event.
- **Delete/Restore** — soft-delete the selected word(s) (reversible).
- **Break before / Break after** — insert a line break (`\N`) around the selected word.
- **Merge prev •** / **Merge prev ␣** — merge the word into the previous one (no space / space).
- **↶ Undo / ↷ Redo** — full history (via `controller.Session`).
- **Theme** — Light / Dark / System.
- **Preview-couple** — when on, selecting a group/word scrubs the main preview to its time.

### Fade semantics
- **Fade-in group** = words appear together. Trigger defaults to the group's first word's start.
- **Fade-out group** = words fade out together. Trigger defaults to the group's last word's end.
  Faded-out lines keep their `\N` row so remaining lines don't shift.
- **Accumulate** (per event, **Tk legacy only**): `words` = word-by-word reveal; `lines` =
  whole line at its first word; `off` = all visible for the window. The per-event `accumulate`
  field was **removed from the engine model** — in the web/animation path this is now the
  appearance animation's timing **mode** (percue/perline/together/…). The frozen Tk dock keeps
  a `words` display fallback.

### Properties
- **Inspector** (left rail, changes with selection): layout event → GROUP tier;
  word → WORD tier; fade group → trigger/dur (blank = inherited).
- **Global defaults** (Style tab): fade-in ms, fade-out ms, linger — editing any of these
  live-updates every inherited (grey-italic) cell across all lanes and the preview.

### Hover tooltips
Hovering a fade cell shows the resolved value and its source — e.g.
`fade-out group · trigger: default 1.04s (last word end) · dur: default 1000ms (global)`.

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

# Tk UI regression suites (frozen/legacy; headless via xvfb + self-withdraw)
./run-tk-tests.sh
```

Current test matrix: **722 vitest** (58 files) · **67 Playwright e2e** (incl. 14 jassub pixel
specs) · **81 pytest + 20 legacy stdlib scripts** · **118 Tk headless**.

`tests/test_engine.py` (+ the `test_anim_*` suites) — headless units covering `engine/`,
the animation model/resolve/compile/migration, and `controller.Session`, no display required.
Tk suites drive the editor via synthesized events; engine code is TDD-first.

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

**Live / HTTP+SSE** — launch the GUI with `--mcp`; an MCP endpoint is served alongside the live
editing session:

```bash
.venv/bin/python karaoke_subtitle_gui.py --mcp [--mcp-port 8765]
# endpoint: http://127.0.0.1:8765/sse  (loopback only)
```

In live mode every MCP edit is applied through the shared `controller.Session` — **undo/redo is a
single timeline shared between the human at the GUI and the AI client**. GUI changes (dock edits,
inspector changes, toolbar undo) are immediately visible to the MCP client, and vice-versa.

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

### Relationship to the CTk app

The daemon runs **alongside** the CustomTkinter app — both share the `engine/` package but run in
**separate processes with their own `Session`**. The CTk app is untouched.

### What's next

- **Spec B — React/Vite v3 UI**: a browser web app that talks to this daemon over `/api` + `/ws`.
- **Spec C — Tauri desktop shell** (deferred): wraps the browser UI in a native window; requires
  Rust + webkit2gtk, not yet installable in this environment.

---

## Known limitations / gotchas

- **Web app**: the live preview is now a **real libass render** (jassub-in-wasm), not a CSS
  approximation — it matches Exact mode. Animations (incl. fades) are edited there, not in Tk.
- **Tk app only**: the on-canvas preview text is a **per-cue approximation** (word-by-word
  fonts/colors); trust **Render now / Auto** for the exact look. The Tk app is frozen/legacy
  and has **no animation UI**.
- `\pos`-off (margin) mode can't push bottom-anchored text above the vertical center (libass clamp).
- Box-mode (`BorderStyle`) is **group-level only** — `BorderStyle` has no inline override tag in
  ASS, so all cues in one event share box-mode.
- Fade groups can span events; the boundary-word default keeps that sane, but an overridden trigger
  outside an event's window will clamp.
- Burn progress polls ffmpeg on a worker thread; very short clips may jump straight to 100%.

See **CLAUDE.md** for data provenance (the Suno API), the ASS rendering techniques, and
engineering notes.
