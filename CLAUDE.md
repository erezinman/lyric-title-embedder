# CLAUDE.md — project context & engineering notes

Context for future Claude sessions (and humans). The user-facing feature reference is in
**README.md**; this file covers **where the data comes from, how the subtitle pipeline works, the
ASS techniques, the code architecture, and conventions/gotchas**.

## What this project is

A toolkit to turn **word-level-timed lyrics** into **karaoke-style subtitles** with per-word
**animations** (fades are one special case — also sweeps/pops/wipes/slides), precise placement,
and grouping — as `.ass` (libass) or `.srt`. The deliverable is the **React/Vite web app**
served by the engine **daemon** (real libass-in-wasm live preview), runnable in the browser or
wrapped in the **Electron desktop shell** (`desktop/`); batch scripts exist for headless
generation.

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
                 (headless SRT/ASS variants)                                 layout + animations + globals
                                                                             + per-group/cue style
                                                                                      │
                                                                          engine/render.py + engine/anim.py
                                                                          (bake windows + resolve/emit anims + style)
                                                                                      │
                                                                          render-groups  ──►  engine/ass.py  ──►  .ass
                                                                                      │
                                                                          libass-in-wasm preview / libass render / ffmpeg burn
```

## Code architecture

Flat Python modules (`package-mode = false` in poetry). Run scripts directly.

### engine/ — UI-free portable core

`engine/` is the **UI-free, v3-portable core** per `design-system/HANDOFF_v3.md`. The daemon and
the headless MCP/batch tooling reuse the engine unchanged. It has no UI-toolkit dependency and can
be imported in headless environments.

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
  (mutates in place; the controller deep-copies first). Cue/layout set: `set_layout_props`
  (note: **no `accumulate` arg anymore**), `toggle_word_del`, `add_break`, `remove_break`,
  `merge_prev_word`, `merge_token_span`, **`unmerge_token`** + **`merge_word_run`** (cross-line
  contiguous merge, drops inner `\N`), `layout_merge`, `layout_ungroup`, `layout_split_event`,
  `set_group_style`, `set_cue_style`. Animation set: **`anim_add` / `anim_remove` /
  `anim_restore` / `anim_set_props`** over the three scopes. (Legacy `make_tag`/`clear_tag`/
  `set_group_fade` linger in the file as dead code but are not wired into the daemon/MCP tool
  surface.)
- **`engine/ffmpeg.py`** — `burn_cmd`, `frame_cmd`, `probe_duration`, and a headless
  `run(cmd, progress_cb)` that parses `-progress` and calls `progress_cb(frac)` — UI-free.
- **`engine/anim.py`** — the **animation system** (fades are now a special case). `validate`/
  `resolve_animations` (the scope waterfall global → group → tag, narrowest-wins on overlapping
  channel), `anchor_seconds` (8 anchors `{cue,line,span,event}×{start,end}`, ms/frac offsets),
  and `emit_anim_tags` (compiles to libass: `\t` chains emitted **narrowest-scope LAST** for
  last-listed-wins, `\kf` karaoke Sweep with `\k` gap padding, `\clip` wipes, `\move` for
  group/global-only move, inout S-curve auto-expand). Timing modes percue/perline/together/
  cascade/typewriter/reverse/centerout/jitter (`custom` = raw anchors). Appearance rule: a cue
  with **no** alpha animation covering it is visible the whole event.
- **`engine/anim_migrate.py`** — `migrate_project` / `is_migrated`: converts legacy
  fade-shaped projects (`fin_tags`/`fout_tags`, `group.fade`, `globals.fade_in_ms/out_ms`,
  per-event `accumulate`) to the animation model — invoked from `daemon/library.open_project`.
  Byte-identical `.ass` is gold-tested. Files migrate; the WS/MCP API has **no** compat shim.
- **`engine/srt.py`** — SRT import: `parse_srt`, `srt_to_lyrics` (one word-atom per SRT word,
  all sharing the cue's `[start,end]`; each word gets a leading space so `merge_subwords` keeps
  atoms distinct through the real loader), `build_srt_layout` (line-break strategies
  `none`/`every_n`/`punctuation`/`per_cue`, default `none`; single "Subtitles" seed group).

### controller.py — UI-free undo/redo

`controller.Session` holds `project` + undo/redo stacks (deep-copy snapshots). Every mutation
goes through `do(name, *args)`: snapshot → call `engine.mutations.<name>` → fire `on_change()`.
No-op / rejected edits don't add a snapshot. `undo()` / `redo()` restore the deep copy and fire
`on_change()`. UI-free.

### mcp_server/ — optional MCP interface

See `docs/superpowers/specs/2026-06-02-engine-mcp-server-design.md` for the full design.

`mcp_server/` layers on top of `engine/` + `controller.py` through an **`EngineContext`** bridge
(`mcp_server/context.py`):

- **`HeadlessContext`** — owns its own `controller.Session` and a plain `dict` for globals.
  All operations run synchronously in the caller's thread. Used by the stdio transport (headless;
  no UI dependency at all). The daemon's `DaemonContext` subclasses it (see below) so live web +
  MCP edits share one `Session` and a single undo/redo timeline.

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
  subclass (UI-free). Owns its own `Session` + dict globals. Wires `Session.on_change` to call
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
  change (web and MCP clients never call save explicitly); bound on open/create. The save is
  **atomic** (`mkstemp` + `os.replace` in `daemon/library.py`).
- **`daemon/library.open_project`** also **migrates legacy fade-shaped project files** to the
  animation model on open (`engine/anim_migrate.migrate_project`).
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

Needs `poetry install --with mcp` (adds `mcp` SDK + `uvicorn` + `websockets`). When given
`--web-dist` (or an auto-detected `web/dist`), the daemon also serves the built React SPA, so one
process backs both the API and the UI; the Electron desktop shell (`desktop/`) spawns and
supervises it.

### Shared UI-free helpers

- **`core.py`** — UI-free shared helpers (used by the engine and daemon): `ass_time`, `esc`,
  `rgb_to_ass` (8-digit BGR for Style lines), `reconstruct_lines`, `merge_subwords`,
  `token_text/token_span`, `is_dashes`, `full_text_at`, `total_duration`,
  `list_font_families`, constants (`HERE`, `FFMPEG/FFPROBE/HAS_FFMPEG`, `FC_LIST/FC_MATCH`,
  `LIBASS_INK_AT_100`, `ALIGN_LABELS`, `ANCHOR`, `PREVIEW_W`, `HANDLE`).

### project dict (the source of truth) — animation model
```python
project = {
  "words":  [{text, start, end}],                       # immutable canonical atoms
  "layout": [{label, win_start, win_end, linger, del,
              "animations": [Anim, …],                   # per-event animations
              "suppress":   [anim_id, …],                # tombstones for inherited anims
              "style": {},                                # per-group style overrides (all STYLE_KEYS)
              "lines": [{"toks": [{ids, sep, del,
                                   "style": {}}]}]}],   # per-cue overrides (CUE_STYLE_KEYS, no border_style)
  "anim_tags": [{ids: list, anims: [Anim, …], suppress: [anim_id, …]}],  # selection scope; per-cue = tag of one
  "globals": {animations: [Anim, …], linger},
  "palette": [10 colors],
}
# Anim = {id, name, group_id?, channel, mode?, step?, step_unit?,
#         segments: [{t0, t1, from, to, accel}], stagger?, enabled}
```
**The legacy fade model is gone**: no `fin_tags`/`fout_tags`, no `group.fade`, no
`globals.fade_in_ms/fade_out_ms`, no per-event `accumulate` (its modes ≡ the appearance
animation's timing mode). A fade is just an `alpha` animation.

Style resolution (reactive, most-specific wins): **cue → group → global → built-in**;
`None`/absent = inherit. `border_style` is group-level only (constraint C1 — no inline ASS tag).
Animation resolution: **scope** waterfall global → group → tag, narrowest scope wins on an
overlapping channel; same-scope overlap = both + a warning; `suppress[]` tombstones mute an
inherited animation at a narrower scope (`engine/anim.resolve_animations`).

### Render-group contract
`project_to_render` bakes appear-times/windows; `engine/anim.py` resolves and emits the
animation tag chains. The view resolves `group_style` + per-word `style` against `cfg` when
drawing or calling `build_ass`. `get_project` additionally carries the three animation carriers
(`globals.animations`, `layout[].animations`+`suppress`, `anim_tags`) plus a per-token
`anims_resolved` field. v1 render-groups lacking style keys → treated as `{}`.

## ASS / libass techniques (the rendering core)

- **Absolute placement:** `{\pos(x,y)}` per event, from the box anchor — avoids the libass quirk
  where bottom-anchored `MarginV` can't go past the vertical center. Safe because every line break
  is explicit (`\N`), so we never rely on margin wrapping.
- **`WrapStyle: 2`** — no automatic wrapping; break only on `\N`. So resizing the box never re-wraps.
- **Animations → tag chains** (`engine/anim.emit_anim_tags`): a fade-in is an `alpha` animation
  (`\alpha&HFF&` start, `\t(in, in+dur, \alpha&H00&)`); fade-out appends `\t(out, out+dur,
  \alpha&HFF&)`. All words present from event start (alpha-hidden) so the layout is fixed —
  words appear *in their final place*. Other channels: karaoke Sweep uses `\kf` with `\k` gap
  padding, wipes use `\clip`, group/global move uses `\move`. `\t` chains are emitted
  **narrowest-scope LAST** (libass last-listed-wins resolves scope conflicts). Inout presets
  auto-expand to an S-curve via the segment `accel` exponent.
- **Appearance rule:** if no `alpha` animation covers a cue it is **visible for the whole
  event** (no implicit fade — fades are opt-in). Timing **modes** (percue/perline/together/
  cascade/typewriter/reverse/centerout/jitter) sequence multi-member animations — this is what
  the old `accumulate` words/lines/off collapsed to.
- **Per-group / per-cue style:** one `[V4+ Styles]` per distinct group `border_style` value; all
  other properties inline as running-delta tags per word. Inline color is 6-digit BGR + trailing
  `&` (e.g. `\1c&H0000FF&`), unlike the 8-digit `&H00RRGGBB` form in Style lines.
- **Font ink sizing:** libass renders ~`0.78 × Fontsize` of ink height regardless of font;
  FreeType's ink/pixel ratio varies per font. The per-font factor is measured via Pillow +
  `fc-match` (`LIBASS_INK_AT_100 = 78`, fallback factor 0.82) for any preview that needs to match
  libass pixel-for-pixel.
- **Burn:** `ffmpeg -i video -vf "ass='file.ass'" -c:a copy out.mp4`; preview frames use
  `-ss t -copyts` so libass renders the event active at the true timestamp.

## System dependencies (not pip)
`ffmpeg`+libass (`--enable-libass`), `ffprobe`, fontconfig (`fc-list`/`fc-match`); Node.js for the
web editor + Electron shell. Pillow is the only managed pip dep (optional; graceful fallback).

## Testing
- **Python suites** (`tests/test_*.py`, pytest-style `test_*` + legacy stdlib `t_*` harness,
  `.venv/bin/python tests/<f>.py`): engine (model/mutations/build-io/srt/merge-span/unmerge/
  remove-break/group-align/globals-undo), **anim** (model/anchors/resolve/timing/compile/
  migration/tools/undo/daemon), daemon (api/projects/autosave), connect, tools, library,
  suno_fetch — **81 pytest + 20 legacy scripts**. Engine code is TDD-first.
- **Web** (`npm --prefix web run test`): **722 vitest/jsdom tests / 58 files** incl. the
  interaction-audit suites (`web/src/**/*.audit.test.tsx`, incl. the `*.anim.audit.*` battery)
  — every control's action/revert/double/gating + an exhaustive WS-push→UI external-sync
  battery. Shared harness: `web/src/test-util/` (fakews/dispatch/fixtures incl.
  `withAnimations`/`withResolved`).
- **E2E** (`cd web && npx playwright test`): **67 specs / 9 files** against a REAL daemon (temp
  seeded project) + vite + chromium; asserts the daemon's `/api/state` AND rendered UI/geometry
  with revert symmetry; per-test reset restores a pristine snapshot (autosave-aware). Includes
  a **14-spec jassub pixel tier** (`e2e/jassub.spec.ts`) asserting the real libass-in-wasm render.
- Audit decision log: `docs/superpowers/testing/2026-06-05-adjudication-log.md`.
- **docs/FEATURES.md** is the authoritative feature/behavior inventory — keep it current.

## Conventions & gotchas
- **Structural edits invalidate selection indices** — selection state keyed on word/group indices
  must be revalidated after a reload, since structural edits can shift them.
- **Canonical word indices are stable** (words are immutable); tags/tokens reference them, which is
  what makes project files reload-safe. Keyed by `nwords`.
- **Inline color vs Style-line color:** `core.rgb_to_ass` produces the 8-digit `&H00RRGGBB` form
  used in `[V4+ Styles]` lines. `engine/ass.py` inline tags use the 6-digit BGR + `&` form
  (`\1c&HBBGGRR&`). Do not mix them.
- Default file paths resolve relative to the script dir (`HERE`); run batch scripts from the repo
  root so `aligned_lyrics.json` is found.
- `engine/` mutations mutate the passed project dict in place; **`controller.Session.do()`
  deep-copies first** — never call mutation functions directly without going through the
  controller, or undo/redo will be corrupted.

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
- **SHIPPED in the web app** (formerly deferred to v3): the general **animation system** with
  presets (8: Fade in/out, Sweep, Pop, Color flash, Wipe in, Blur in, Slide), a scrubbable
  **waveform/word-block timeline**, the **Project Library**, a real **font picker**, and a
  **real libass-in-wasm live preview** (jassub). Still deferred: per-cue `\pos` placement, the
  Tauri desktop shell, synthwave skin.
