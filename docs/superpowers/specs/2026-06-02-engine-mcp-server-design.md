# Engine MCP server (Spec 1 of 2) — shared-Session, dual transport

**Date:** 2026-06-02
**Status:** Approved for planning
**Branch:** `feat/engine-mcp-server` (from `feat/per-cue-group-style`)
**Sibling:** Spec 2 (later) — manual word-level edits (timing/text/add/remove) + generic validated patch + model hardening (self-contained project file, stable word handling, invariant validator).

## Context

The app's engine is now UI-free (`engine/` package + `controller.Session`, project as a plain dict). We want an **MCP server** so an AI agent can perform the **long tail of manual edits** that the GUI buttons and preset recipes don't cover — precise, ad-hoc adjustments to a karaoke project — **with or without a UI session open**, and so that **when a UI session is open, MCP operations update the live GUI** (dock + preview) in real time.

This spec covers **everything the engine can already express** (composed freely by the AI). New low-level primitives that change word data (timing/text/add/remove) and a generic patch are **out of scope** here (Spec 2), because they require model hardening (positional word ids → stable handling; a self-contained project file; an invariant validator).

## Decisions (locked)

| Topic | Decision |
|---|---|
| Topology | **A — shared `controller.Session`, dual transport.** Headless = stdio (`python -m mcp_server`, no Tk). With UI = GUI hosts an HTTP/SSE endpoint bound to its OWN live session; mutations marshal to the Tk main loop. |
| Capabilities | Inspect (read) · Edit + undo/redo · Global style/placement · Build / export / render-frame / burn. (All over the **current** engine surface.) |
| Mode bridge | An `EngineContext` so tools never branch on mode. |
| Undo in UI mode | **Shared history** — MCP edits and human edits share one timeline; either can undo the other (collaborative). |
| Burn | **Job model** — `burn` returns a `job_id`; `burn_status(job_id)` polls; MCP progress notifications emitted when the client supplies a progress token. |
| `render_frame` | Returns a **PNG** (MCP image content); solid background when no video. |
| MCP SDK | Official Python `mcp` (FastMCP), an **optional** dependency (extras group); core app/engine/tests don't require it; entrypoints import lazily with a helpful error. |
| Security | HTTP endpoint binds `127.0.0.1` only; optional bearer token via env (`KSS_MCP_TOKEN`); default localhost no-auth. |
| Marshaling | All `ctx.run(...)` in UI mode runs on the Tk main loop (reads too) — no Tk races. |

## Architecture

New top-level package **`mcp_server/`** (NOT inside `engine/` — the UI binding touches the app; the headless half stays pure). Engine/app stay the source of truth.

```
mcp_server/
  context.py    EngineContext (abstract) + HeadlessContext + UIContext
  tools.py      all tool/resource IMPLEMENTATIONS as plain functions over an EngineContext
  server.py     build_server(ctx) -> FastMCP (registers tools/resources); serve_stdio(ctx); serve_http(ctx, host, port, token)
  __main__.py   headless entrypoint: `python -m mcp_server [--json PATH] [--project PATH]` -> HeadlessContext, serve_stdio
```

### `EngineContext` (the mode bridge) — `mcp_server/context.py`

Tools are written ONCE against this interface:
```python
class EngineContext:
    session: controller.Session          # project + undo/redo
    def get_globals(self) -> dict         # style/placement defaults (the cfg minus pos derivation)
    def set_globals(self, partial: dict)  # update globals (+ trigger UI rebuild in UI mode)
    def cfg(self) -> dict                 # full cfg for build_ass (globals + align int + optional pos + canvas/margins)
    def run(self, fn)                     # execute fn and return its result on the correct thread
    def video_path(self) -> str | None    # optional input video for render/burn (None headless unless set)
    def fonts(self) -> list[str]          # available font families (engine core.list_font_families)
```
- **HeadlessContext:** `session = controller.Session()`; globals = a dict seeded from engine defaults (and a loaded project's style on `load_project`); `run(fn) = fn()`; `cfg()` assembles from the globals dict; `video_path` from a setter.
- **UIContext(app):** `session = app._session`; `get_globals`/`set_globals` read/write the app's tk-vars (size_var, font_var, _color, …) and `set_globals` triggers `_rebuild_render`; `cfg() = app.cfg()`; `run(fn)` **marshals to the Tk main loop** via `app.after(0, …)` + a `threading.Event` (returns the result or re-raises) — same thread-safety contract as the existing burn worker; `video_path = app.vid_var.get()`.

Tools always call `ctx.run(lambda: ctx.session.do("set_group_style", gi, partial))`, so UI-mode edits execute on the main thread → `on_change` → live dock/preview refresh.

### Transports — `mcp_server/server.py`
- `build_server(ctx)` registers all tools + the two read resources on a `FastMCP` instance.
- `serve_stdio(ctx)` — stdio transport (headless; the MCP client spawns it).
- `serve_http(ctx, host="127.0.0.1", port, token=None)` — SSE/streamable-http; used by the GUI. Rejects non-loopback hosts; checks bearer token if set.

### UI integration — `app_base`/`AppV2`
- A `--mcp [--mcp-port N]` CLI flag (and/or a toolbar toggle) builds a `UIContext(self)` and starts `serve_http` in a **daemon thread**; the port is logged to the status pane. Clean shutdown when the app closes (stop the server thread).
- Lazy import of `mcp_server` so the GUI runs without the optional SDK installed.

## Tool / resource catalog (current surface)

All tools return concise JSON (the affected entity's new state) so the AI sees effects. Word/group references use the existing ids/indices.

**Inspect (read):**
- `get_state()` — overview: globals, theme, counts, and per-event `{gi, label, win[start,end], accumulate, style_overrides, n_lines, n_words, deleted?}`.
- `list_groups()` / `get_group(gi)` — event detail incl. style overrides + **resolved** effective style, window/linger/accumulate, lines→tokens→words `{wid, text, start, end, style, fin_tag?, fout_tag?}`.
- `list_words()` / `get_word(wid)` — text, start/end, location `(gi,li,ti)`, fade-tag membership, resolved style.
- `get_render()` — derived render-groups (timeline: per-event start/end; per-word appear/end/fade_in/fade_out).
- `get_ass()` — current generated `.ass` text.
- Resources: `karaoke://project` (serialize_cues + globals + theme) and `karaoke://ass` — always current reads.

**Edit + undo/redo** (wrap `engine.mutations`):
`set_group_style(gi, partial)`, `set_cue_style(word_ids, partial)`, `make_fade_tag(kind, word_ids)` (kind ∈ {in,out} → fin/fout), `clear_fade_tag(kind, word_ids)`, `set_fade_tag_props(kind, word_ids, trigger, dur)`, `set_layout_props(gi, win_start, win_end, linger, accumulate)`, `merge_events(gidxs)`, `ungroup_event(gi)`, `split_event(gi, line_index)`, `break_line(gi, li, ti, after)`, `merge_words(gi, li, ti, sep)`, `delete_words(word_ids)`, `restore_words(word_ids)`, `set_fade_defaults(fade_in_ms, fade_out_ms, linger)`, `undo()`, `redo()`. (`partial` keys map to `STYLE_KEYS`/`CUE_STYLE_KEYS`; `null` clears → inherit. `set_cue_style` drops `border_style` per C1.)

**Global style/placement:**
- `get_globals()` / `set_globals(partial)` — font, fontsize, bold, primary/outline/back colors, back_alpha, outline_w, shadow, border_style, alignment, use_pos, pos, play_w/h, margins.

**Project + build/export/burn:**
- `load_lyrics(json_path, group_by="section", skip_dashes=true)` — fresh project (`set_project`).
- `load_project(path)` / `save_project(path)` — portable project file (style/placement + cues_v2); applies/serializes via `engine.io` + globals + theme.
- `generate_ass(path=None)` — `build_ass(cfg, render)`; write to path or return text.
- `render_frame(time_s)` — exact libass frame via ffmpeg (`engine.ffmpeg.frame_cmd`); returns PNG image content (+ temp path). Uses `video_path()` if set, else a solid canvas.
- `burn(out_path, video_in=None)` → `{job_id}`; `burn_status(job_id)` → `{frac, done, ok, err, out}`. Burn runs in a worker thread (touches no Tk); progress via `engine.ffmpeg.run`. Emits MCP progress notifications when a progress token is supplied.

## Small engine/app additions
- `engine.ffmpeg.frame_cmd(video_or_none, ass_path, time_s, w, h, out_png)` — extracted from `app_base._render_exact` so UI and MCP render frames through one builder. Pure; engine-tested.
- `AppV2`: `--mcp`/`--mcp-port` handling + daemon-thread lifecycle.

## Error handling
- Tools validate indices/ids and return MCP errors with clear messages (e.g., "no event at gi=7 (have 8)"); they never crash the server or (in UI mode) the GUI.
- UI marshal: `ctx.run` re-raises tool exceptions to the MCP caller with a timeout guard (default 15s) so a wedged main loop can't hang the server indefinitely.
- Missing `mcp` SDK or ffmpeg → actionable error, not a stack trace.

## Out of scope (Spec 2)
Word timing/text edits, add/remove words, the generic validated `apply_patch`, stable word ids, self-contained project word data, the invariant validator.

## Testing (TDD)
- `tests/test_mcp.py` (headless, no transport, no Tk): build a `HeadlessContext`; call tool functions directly — assert reads (`get_state`/`get_group`/`get_render`/`get_ass`), each edit's effect + undo/redo, globals get/set, `load_lyrics`/`load_project`/`save_project` roundtrip, `generate_ass` output, `render_frame` produces a PNG, and `burn`+`burn_status` reaches `done/ok` on a tiny synthesized input. Pure and fast.
- **UI-marshal test** (`tests/test_mcp_ui.py`, Tk): with a live `AppV2`, build a `UIContext`, call a tool from a **non-main thread**, assert (a) the project changed and (b) the dock/preview rebuilt (e.g. `ed.rows`/canvas reflect it) — proves marshaling + live update + shared undo.
- Transport smoke: start `python -m mcp_server` (stdio) and complete an `initialize` + `tools/list` handshake (skipped if the SDK isn't installed).
- `engine.ffmpeg.frame_cmd` engine test.

## Verification
1. **Headless:** `python -m mcp_server --json aligned_lyrics.json` starts; an MCP client lists tools, reads `get_state`, sets a group style, generates `.ass`, undoes — all without a GUI.
2. **With UI:** `python karaoke_subtitle_gui.py --mcp` opens the GUI and logs the endpoint URL; pointing a client at it and calling `set_cue_style`/`set_globals` visibly updates the dock + preview live; `undo` from the GUI reverts an MCP edit and vice-versa.
3. **Render/burn:** `render_frame(13.0)` returns a PNG; `burn(out.mp4)` progresses to `done/ok`.
4. **Isolation:** the GUI still runs with the `mcp` SDK absent (flag off); `tests/test_engine*.py` + `tests/test_v2_ui.py` stay green.
