# CLAUDE.md — project context & engineering notes

Context for future Claude sessions (and humans). The user-facing feature reference is in
**README.md**; this file covers **where the data comes from, how the subtitle pipeline works, the
ASS techniques, the code architecture, and conventions/gotchas**.

## What this project is

A toolkit to turn **word-level-timed lyrics** into **karaoke-style subtitles** with per-word
fade-in/out, precise placement, and grouping — as `.ass` (libass) or `.srt`. Primary deliverable is
the GUI (`karaoke_subtitle_gui.py`); batch scripts exist for headless generation.

## Background & data provenance (important)

- The example song is **"Bleating Obsession"**, generated on **Suno** (`suno.com`).
- Word timings come from Suno's internal **aligned-lyrics API**, the same one the
  **"Suno Lyric Downloader"** Chrome extension (GitHub `zh30/get-suno-lyric`) uses. The extension's
  content script calls, via the service worker:
  ```
  GET https://studio-api.prod.suno.com/api/gen/<songId>/aligned_lyrics/v2/
  Authorization: Bearer <suno session JWT>
  ```
  (plus `/api/clip/<songId>` for duration). It's processed locally; nothing is uploaded.
- We fetched it directly with the user's session token and saved the raw response as
  **`aligned_lyrics.json`**. Shape:
  - `aligned_words`: flat list of `{word, success, start_s, end_s, p_align}` — **sub-word tokens**
    (e.g. `"*Ba"`, `"a..."`); newlines inside `word` mark real line breaks. ~363 tokens here.
  - `aligned_lyrics`: list of `{text, start_s, end_s, section, words:[{text,start_s,end_s}]}` —
    Suno's own line segmentation (often splits mid-word/mid-phrase; not authoritative).
  - `waveform_data`, `duration`, etc.
- **Tokens (whole words)** are reconstructed by merging sub-word tokens on whitespace boundaries.
  Lines are reconstructed by merging Suno lines that are lowercase continuations. This is why the
  editor lets you re-cut line breaks: Suno's segmentation is messy.

Treat any pasted Suno bearer token as a short-lived credential; it expires quickly (the one used
during development is long dead).

## Pipeline / data flow

```
Suno API  ──►  aligned_lyrics.json  ──►  reconstruct_lines + merge_subwords  ──►  canonical words
                                                                                      │
                          ┌───────────────────────────────────────────────────────────┤
                          ▼                                                             ▼
                 build_from_api.py / ass_from_api.py                        editable cue project
                 (headless SRT/ASS variants)                                 layout + fade tags + globals
                                                                             + per-group/cue style
                                                                                      │
                                                                          engine/render.py  (bake fades + style)
                                                                                      │
                                                                          render-groups  ──►  engine/ass.py  ──►  .ass
                                                                                      │
                                                                          tkinter preview / libass render / ffmpeg burn
```

## Code architecture

Flat modules (no package for the view layer; `package-mode = false` in poetry). Run scripts
directly.

### engine/ — UI-free portable core

`engine/` is the **UI-free, v3-portable core** per `design-system/HANDOFF_v3.md`. A future
Tauri/React v3 is a view-only rewrite that reuses the engine unchanged (sidecar or IPC). It has no
tkinter dependency and can be imported in headless environments.

- **`engine/model.py`** — project shape, `make_project`, `STYLE_KEYS` (all style props),
  `CUE_STYLE_KEYS` (same minus `border_style` — constraint C1), `resolve_style`, `BUILTIN`
  defaults, `PALETTE`. `resolve_style(token, group, gctx)` implements the
  `global < group < cue` waterfall per key: `None`/absent = inherit.
- **`engine/render.py`** — `project_to_render` (was `project_to_render_v2`): copies through a
  raw `group_style` dict per render-group and a raw cue `style` dict per word — resolution
  against `cfg` stays lazy in the view.
- **`engine/ass.py`** — `build_ass`: emits one `[V4+ Styles]` per **distinct group
  `border_style`** value (e.g. `Default` for outline, `Box` for opaque) because `BorderStyle`
  has no inline override tag; each `Dialogue` references the matching Style name. Per-word style
  is applied as **running-delta inline tags** — the builder tracks a `cur` resolved-style state
  (init = global/Style baseline) and emits a tag only when a word's resolved value differs from
  the previous word's. Inline tags: `\fn \fs \b \1c \3c \4c \4a \bord \shad`, emitted alongside
  the unchanged fade tags (`\alpha`, `\t(...)`). **Inline color format is 6-digit BGR + trailing
  `&`** (e.g. `\1c&H0000FF&`) — distinct from the 8-digit form used in `[V4+ Styles]` lines and
  from `core.rgb_to_ass` which produces the 8-digit form.
- **`engine/io.py`** — `serialize_project` / `load_project`: portable project file (global style +
  fade defaults + placement + theme + full cue model incl. per-group and per-cue `style`). Source
  paths are **not stored**. Backward-compatible: older files without `style` load as all-inherit.
  Actions renamed **Save project / Load project** in the UI.
- **`engine/mutations.py`** — every cue/style edit as a pure `(project, …) -> project` function
  (mutates in place; the controller deep-copies first). Includes the full v2 mutation set
  (`make_tag`, `clear_tag`, `set_tag_props`, `set_global`, `set_layout_props`, `toggle_word_del`,
  `add_break`, `merge_prev_word`, `layout_merge`, `layout_ungroup`, `layout_split_event`) plus
  new **`set_group_style(project, gi, partial)`** and **`set_cue_style(project, ids, partial)`**.
- **`engine/ffmpeg.py`** — `burn_cmd`, `frame_cmd`, `probe_duration`, and a headless
  `run(cmd, progress_cb)` that parses `-progress` and calls `progress_cb(frac)` — no tkinter.
- **`engine/srt.py`** — SRT import: `parse_srt`, `srt_to_lyrics` (one word-atom per SRT word,
  all sharing the cue's `[start,end]`; each word gets a leading space so `merge_subwords` keeps
  atoms distinct through the real loader), `build_srt_layout` (line-break strategies
  `none`/`every_n`/`punctuation`/`per_cue`, default `none`; single "Subtitles" seed group).

### controller.py — UI-free undo/redo

`controller.Session` holds `project` + undo/redo stacks (deep-copy snapshots). Every mutation
goes through `do(name, *args)`: snapshot → call `engine.mutations.<name>` → fire `on_change()`.
No-op / rejected edits don't add a snapshot. `undo()` / `redo()` restore the deep copy and fire
`on_change()`. No tkinter.

### mcp_server/ — optional MCP interface

See `docs/superpowers/specs/2026-06-02-engine-mcp-server-design.md` for the full design.

`mcp_server/` layers on top of `engine/` + `controller.py` through an **`EngineContext`** bridge
(`mcp_server/context.py`):

- **`HeadlessContext`** — owns its own `controller.Session` and a plain `dict` for globals.
  All operations run synchronously in the caller's thread. Used by the stdio transport (headless;
  no Tk dependency at all).
- **`UIContext`** — wraps a live `AppV2` instance, shares `app._session`, reads/writes tk-vars,
  and marshals every operation onto the Tk main loop via a queue + main-loop poll. Used by the
  `--mcp` GUI mode. Undo/redo is a **shared single timeline** between the GUI user and the AI.

`mcp_server/tools.py` — all tool implementations (both contexts share the same tool layer).
`mcp_server/server.py` — registers tools on a `FastMCP` server; serves stdio or loopback HTTP/SSE.
`mcp_server/__main__.py` — CLI entry point (`python -m mcp_server`).

**Only `server.py` and `__main__.py` import the `mcp` SDK.** `engine/`, `controller.py`,
`tools.py`, and `context.py` are SDK-free, so the headless test suite (`tests/test_mcp.py`,
16 tests) calls tool functions directly without any MCP transport or SDK installed.

### daemon/ — unified engine daemon (v3 backend)

See `docs/superpowers/specs/2026-06-03-engine-daemon-design.md` for the full design.

`daemon/` is a new top-level package that merges `/mcp` (FastMCP SSE) + `/api` (HTTP) + `/ws`
(WebSocket) over **one shared `Session`** on a single uvicorn/Starlette process.

- **`DaemonContext(HeadlessContext)`** (`daemon/context.py`) — synchronous `HeadlessContext`
  subclass (no Tk). Owns its own `Session` + dict globals. Wires `Session.on_change` to call
  `Hub.schedule(get_state())` so every mutation broadcasts the full state to all `/ws` clients.
- **`Hub`** (`daemon/hub.py`) — thread-safe WebSocket client registry. `schedule(msg)` is
  callable from the synchronous `on_change` path; it hops to the asyncio event loop via
  `loop.call_soon_threadsafe` and fires the async broadcast.
- **`daemon/api.py`** — Starlette route factories: `POST /api/call` (dispatches to
  `mcp_server/tools.py` by name), `GET /api/state|render|ass`, `GET /api/frame?t=` (PNG),
  `POST /api/burn` + `GET /api/burn/{job_id}`, `GET /api/env` (same-host loopback flag that
  gates the web UI's server-path inputs), and project library routes incl.
  `POST /api/projects/create` (multipart create/import; legacy `/new` is a thin shim over it).
- **`daemon/app.py`** — `build_app(ctx, hub)` assembles the Starlette app: co-mounts
  `build_server(ctx).sse_app(mount_path="/mcp")`, adds the `/api` routes and `/ws` WebSocket
  endpoint, optional bearer-token middleware on `/api`, CORS.
- **`daemon/autosave.py`** — debounced (400ms) autosave of the open project after every
  change (web and MCP clients never call save explicitly); bound on open/create.
- **`daemon/library.py`** — project library: self-contained folders under a projects dir
  (`<name>/lyrics.json` + `<name>/project.json`, which also persists a `video` reference —
  folder-relative when uploaded, absolute when a server path). `create_project` is the single
  create path: Suno JSON written verbatim or SRT converted via `engine/srt.py`; bytes or
  server-side path; atomic (no folder left on failure).
- **`daemon/__main__.py`** — CLI entry: `python -m daemon [--port 8770] [--projects-dir projects]
  [--json aligned_lyrics.json]`; loopback-only; `KSS_MCP_TOKEN` guards `/api`.

**Import isolation:** only `daemon/app.py`, `daemon/api.py`, and `daemon/__main__.py` import
starlette / uvicorn / the `mcp` SDK. `engine/`, `controller.py`, `mcp_server/tools.py`, and
`mcp_server/context.py` remain SDK-free. `DaemonContext` reuses `EngineContext` +
`mcp_server/tools.py` verbatim — no tool logic is duplicated.

The daemon runs **alongside** the old CTk app (separate process, separate `Session`) — the CTk
app is untouched. Needs `poetry install --with mcp` (adds `mcp` SDK + `uvicorn` + `websockets`).

### View layer (CTk + tk)

- **`core.py`** — UI-free shared helpers (used by engine and view): `ass_time`, `esc`,
  `rgb_to_ass` (8-digit BGR for Style lines), `reconstruct_lines`, `merge_subwords`,
  `token_text/token_span`, `is_dashes`, `full_text_at`, `total_duration`,
  `list_font_families`, constants (`HERE`, `FFMPEG/FFPROBE/HAS_FFMPEG`, `FC_LIST/FC_MATCH`,
  `LIBASS_INK_AT_100`, `ALIGN_LABELS`, `ANCHOR`, `PREVIEW_W`, `HANDLE`).
- **`app_base.py`** — `class App(ctk.CTk)`: merged single-window layout (toolbar + Style/Inspector
  left rail + center preview + bottom cue dock), draggable placement box, per-cue tkinter preview
  (word-by-word font/size/color), libass exact-render, ffmpeg burn via worker-thread + main-thread
  `after()`-poll driven through `engine.ffmpeg.run`, project save/load, per-font sizing
  `_font_px_factor`. Model-agnostic via hooks (`_make_project`, `_project_to_render`,
  `_build_ass`, `_load_cues`, etc.).
- **`karaoke_subtitle_gui.py`** (THE app) — `class AppV2(base.App)` wires a `controller.Session`
  and provides the model hooks; `CueDock` implements the 3-lane bottom dock (LAYOUT · FADE-IN ·
  FADE-OUT) with adjustable height and a Detach toggle.
- **`old/karaoke_subtitle_gui.py`** — archived v1: `class App(app_base.App)` with v1 model hooks +
  `CueEditor` (Treeview). Imports only `core.py` and its own UI — not `engine/` — so it stays
  runnable and isolated. `nothing imports old/`.

### v2 project dict (the source of truth)
```python
project = {
  "words":  [{text, start, end}],                       # immutable canonical atoms
  "layout": [{label, win_start, win_end, linger, accumulate, del,
              "style": {},                                # per-group style overrides (all STYLE_KEYS)
              "lines": [{"toks": [{ids, sep, del,
                                   "style": {}}]}]}],   # per-cue overrides (CUE_STYLE_KEYS, no border_style)
  "fin_tags":  [{ids: set, color: int, trigger, dur}],   # appear-together
  "fout_tags": [{ids: set, color: int, trigger, dur}],   # fade-together
  "globals": {fade_in_ms, fade_out_ms, linger},
  "palette": [10 colors],
}
```
Resolution (reactive, most-specific wins): **cue → group → global → built-in**. `None`/absent =
inherit. Fade-in trigger default = first member word start; fade-out trigger default = last member
word end. `border_style` is group-level only (constraint C1 — no inline ASS tag exists for it).

### Render-group contract
`project_to_render` emits:
`{start, end, accumulate, group_style: {}, lines: [{words: [{text, start_s, end_s, style: {},
[fin_ms, fout_at, fout_ms]}]}]}`

The view resolves `group_style` + per-word `style` against `cfg` when drawing or calling
`build_ass`. v1 render-groups lack these keys → treated as `{}`.

## ASS / libass techniques (the rendering core)

- **Absolute placement:** `{\pos(x,y)}` per event, from the box anchor — avoids the libass quirk
  where bottom-anchored `MarginV` can't go past the vertical center. Safe because every line break
  is explicit (`\N`), so we never rely on margin wrapping.
- **`WrapStyle: 2`** — no automatic wrapping; break only on `\N`. So resizing the box never re-wraps.
- **Per-word fade-in:** each word starts `\alpha&HFF&` (transparent) then `\t(in, in+dur,\alpha&H00&)`.
  All words present from event start (alpha-hidden), so the layout is fixed — words fade in *in
  their final place* (no re-centering).
- **Fade-out:** append `\t(out, out+dur, \alpha&HFF&)`. Per-word/line/group via the tags; faded
  lines keep their `\N` row so others don't move.
- **Accumulate modes** collapse to per-word `start_s`: `words` = own time, `lines` = line's first
  word, `off` = window start. Fade-in groups override to a shared trigger.
- **Per-group / per-cue style:** one `[V4+ Styles]` per distinct group `border_style` value; all
  other properties inline as running-delta tags per word. Inline color is 6-digit BGR + trailing
  `&` (e.g. `\1c&H0000FF&`), unlike the 8-digit `&H00RRGGBB` form in Style lines.
- **Preview font sizing:** libass renders ~`0.78 × Fontsize` of ink height regardless of font;
  FreeType's ink/pixel ratio varies per font. So the tkinter preview uses pixel size
  `0.78 × Fontsize / FreeType_ink_ratio`, measured per font via Pillow + `fc-match`
  (`LIBASS_INK_AT_100 = 78`, fallback factor 0.82). Tk font sizes are **negative** = pixels.
  The per-cue preview resolves each word's effective font/size independently.
- **Burn:** `ffmpeg -i video -vf "ass='file.ass'" -c:a copy out.mp4`; preview frames use
  `-ss t -copyts` so libass renders the event active at the true timestamp.

## System dependencies (not pip)
`ffmpeg`+libass (`--enable-libass`), `ffprobe`, fontconfig (`fc-list`/`fc-match`), tkinter
(`python3-tk`). Pillow is the only managed pip dep (optional; graceful fallback).

## Testing
- `tests/test_v2_ui.py` — 26 headless UI checks driving the editor via synthesized `<Button-1>`
  events at real coordinates. Asserts state/render correctness (not pixels). Run:
  `poetry run python tests/test_v2_ui.py` (needs a display or `xvfb-run`). Re-run after any
  editor change; it has already caught real bugs.
- `tests/test_engine.py` — headless engine/controller units (no display needed). Run:
  `.venv/bin/python tests/test_engine.py`.

## Conventions & gotchas
- **Tk threading:** never touch widgets / call `after()` from a worker thread. The burn uses a
  shared state dict + a main-thread `_poll_burn`. Keep this pattern.
- **`tk.Text` colors per *row*, not per cell** — that's why the editor uses three side-by-side Text
  panes (one per lane), and pads fade cells to full width so group colors render as solid bars.
- **Structural edits invalidate selection indices** — `CueDock._validate_selection()` clears
  stale `sel_word`/`sel_group` on reload; call paths must go through `reload()`.
- **Canonical word indices are stable** (words are immutable); tags/tokens reference them, which is
  what makes project files reload-safe. Keyed by `nwords`.
- **Inline color vs Style-line color:** `core.rgb_to_ass` produces the 8-digit `&H00RRGGBB` form
  used in `[V4+ Styles]` lines. `engine/ass.py` inline tags use the 6-digit BGR + `&` form
  (`\1c&HBBGGRR&`). Do not mix them.
- Default file paths resolve relative to the script dir (`HERE`); run batch scripts from the repo
  root so `aligned_lyrics.json` is found.
- `engine/` mutations mutate the passed project dict in place; **`controller.Session.do()`
  deep-copies first** — never call mutation functions directly from the view without going through
  the controller, or undo/redo will be corrupted.

## UI toolkit (customtkinter)
- The **main window chrome is customtkinter** (`App(ctk.CTk)`): `CTkScrollableFrame` (left rail),
  `CTkButton`/`CTkEntry`/`CTkOptionMenu`/`CTkComboBox`/`CTkCheckBox`/`CTkSlider`/`CTkProgressBar`/
  `CTkTextbox`, `CTkTabview` (Style | Inspector tabs). API differences are wrapped in
  `ctk_labelframe()` and `ctk_spin()` helpers. `tk.Canvas` (preview), `tk.Text` (dock lanes),
  `tk.Listbox` (font picker) stay — no ctk equivalent.
- **Theme** (`Light/Dark/System`) drives both `ctk.set_appearance_mode(...)` and the dock's
  `tk.Text` pane colors; chosen in the toolbar, saved in the project file.
- ctk gotchas hit during migration: progress bar uses `.set(0..1)` not `["value"]`; `CTkProgressBar`/
  `CTkSlider` need `.bind("<ButtonRelease-1>")` for release; readonly combobox → `CTkOptionMenu`,
  editable → `CTkComboBox` (both take `command=`, not `<<ComboboxSelected>>`); color swatches are
  `CTkButton(fg_color=...)` updated via `.configure(fg_color=...)`; labels use `text_color`, not
  `foreground`; there is no Spinbox (use `ctk_spin`) or LabelFrame (use `ctk_labelframe`).

## Roadmap / open ideas
- **Style waterfall (global < group < cue): SHIPPED.** Per-group: font, size, bold, colors, box
  alpha, outline width, shadow depth, box-mode. Per-cue: same except box-mode (constraint C1).
  Placement (align/pos/margins/canvas) stays global.
- Layout-lane word **reordering / moving words between events** (drag).
- Per-event `\pos` override (currently `\pos` is global from the placement box).
- **Unify LAYOUT groups with the fade-group model (deferred).** Today the fade-in/out lanes use
  dynamic tags (flat id-sets + color + derived props), while the LAYOUT lane is the original
  event→line→token tree. Future: (a) drag-select words in LAYOUT → Group forms one event; or
  (b) full — make a layout group a flat id-set with props structurally identical to fade tags.
  Grouping words into an event should require a contiguous run. Touches model/mutations/serialize.
- A proper packaged entry point (`ksstudio` console script) if/when it becomes a real package.
- v3 / Tauri: animation presets, waveform/word-block timeline, Project Library, per-cue placement,
  synthwave skin — all deferred to the view-only rewrite (`design-system/HANDOFF_v3.md`).
