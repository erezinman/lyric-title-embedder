# Karaoke Subtitle Studio — Features & Behaviors Reference

> Authoritative inventory of every feature and its exact behavior, as of 2026-06-06
> (branch lineage: `feat/finish-ui` → `feat/group-alignment` → `feat/designer-fidelity`
> → `feat/resizable-panels` → `feat/interaction-audit`). Companion to CLAUDE.md
> (architecture/provenance) and README.md (how-to). Specs live in
> `docs/superpowers/specs/`; designer rulings in `design-system/HANDOFF_*.md`.

---

## 1. Architecture at a glance

```
Suno API ──suno_fetch──► aligned_lyrics.json ─┐
SRT file ──engine/srt──► (same shape)         ├─► engine.make_project ─► project dict
                                              │        ▲ lyrics.json per project folder
controller.Session: undo/redo snapshots of (project, aux-globals) + on_change
mcp_server: EngineContext bridge — HeadlessContext (dict globals) / UIContext (Tk vars)
daemon/: Starlette app = /api (HTTP) + /ws (push) + /mcp (FastMCP SSE) + autosave
web/:   Vite+React, server-authoritative (state := last /ws push; every edit = /api/call)
Tk app: karaoke_subtitle_gui.py — same engine, widget-bound globals
```

- **Server-authoritative web UI**: components never mutate locally; they dispatch a tool
  via `POST /api/call {tool, args}` and re-render from the WS `{type:"state", state}` push.
- **Single daemon, many clients**: browser(s) + MCP agents share one project; every change
  broadcasts to all; the web shows an `AI agent · live` pill while connected and an
  "AI agent updated the project" toast for pushes it didn't cause.

## 2. Data model & core semantics

- **Word atoms** `{text, start, end}` — immutable timing/text units; index = `wid`.
  Built from Suno `aligned_lyrics[].words` (sub-words merged on leading-whitespace
  boundaries) or synthesized from SRT (one atom per word, **all words of a cue share the
  cue's [start,end]**, leading-space trick keeps them distinct through the loader).
- **Tokens (cues)** `{ids:[wid…], sep, del, style}` — one or more adjacent atoms rendered
  as a unit; `sep:" "` joins with a space, `sep:""` glues. Nothing is pre-merged at import.
- **Lines** — `\N` boundaries inside an event; **Groups/events** `{label, accumulate
  (words|lines|off), win_start/end, linger, del, style, fade, lines}` — one ASS Dialogue
  each. Groups are fully dynamic: merge / split / ungroup / re-break at any time.
- **Style waterfall** `global < group < cue`; STYLE_KEYS (11): font, fontsize, bold,
  primary, outline, back, back_alpha, outline_w, shadow, **border_style**, **align**.
  border_style (no inline per-cue tag) and align (`\an` is event-scoped) are **group-only**
  (CUE_STYLE_KEYS = 9). `null`/absent = inherit; explicit value = override.
- **Fade waterfall** `global < group` for durations (`fade_in_ms`, `fade_out_ms`); fade
  **tags** (`fin_tags`/`fout_tags`: `{ids, trigger}`) define which words fade and when
  (trigger `null` = auto). `linger` (global + per-group) extends the event window.
- **Placement (global)**: `align` (ASS numpad 1–9), `play_w/h` (canvas = PlayRes),
  `margin_l/r/v`, `use_pos` + `pos [x,y]` — libass pins text at `pos` **only when both**
  `use_pos` and `pos` are set (`posActive` in the web mirrors this).
- **ASS export is a compilation target**: `project_to_render` bakes appear-times/fades/
  windows; `build_ass` emits one Style per box-mode, one Dialogue per event, per-word
  inline deltas + alpha `\t` fades, `{\anN}` once per event when group-align differs,
  `\pos` when pinned. Regenerated for every export/exact-frame/burn; never parsed back.

## 3. Persistence

- A project = folder `<projects-dir>/<name>/` with `lyrics.json` (source-shaped, enough to
  rebuild atom count/text) + `project.json` `{globals_style, cues_v2, video}`.
  `cues_v2` carries the **full** truth: layout, tokens, fade tags, AND `words` (exact
  timings/text overlay on reopen). `video`: folder-relative basename if copied in,
  absolute path if referenced.
- **Autosave (daemon)**: every change debounce-saves (400ms) the bound project
  (`daemon/autosave.py`); bound on open/new/create; never crashes the daemon; covers
  MCP-agent edits with no browser open. There is deliberately no manual save button.
- **Undo/redo**: `controller.Session` snapshots `(project, aux)` per operation — aux is
  the context's style/placement globals, so **`set_globals` edits (alignment, margins,
  \pos…) are undoable** like everything else. One user gesture = one undo step (atomic
  multi-merge, batched `set_word_times`). Tk path unaffected (aux hooks default off).

## 4. Ingestion

### 4.1 Project library & creation (web)
- Library lists folders that contain `project.json`; click opens; two "New project" entry
  points open the create modal.
- **Create modal**: name · source toggle **Suno JSON | SRT** · per-file **Upload ⇄ Server
  path** (path option only when `GET /api/env` reports `same_host`, i.e. loopback client)
  · optional video (upload = copied into the folder; server path = referenced in place) ·
  Advanced is source-dependent: Suno → `group_by (section|line)` + `skip_dashes`; SRT →
  line-break strategy **none (default) | every_n (+N) | punctuation | per_cue**.
  Create disabled until name+lyrics present; busy state disables buttons; errors render
  inline and keep the modal open. Daemon errors: 400 bad input, 409 name exists, 422 engine.
- **SRT import**: split cue text into word-atoms sharing the cue timing; initial layout =
  one "Subtitles" group with lines per the chosen strategy; dash-only cues are NEVER
  skipped (skip_dashes is Suno-only — token ids would desync).
- Legacy `POST /api/projects/new {name, lyrics_path}` is a thin shim over the same
  `library.create_project`.

### 4.2 suno_fetch CLI
`python tools/suno_fetch.py <suno.com/song/<id> | bare-id> [-o OUT.json] [-f]` — hidden
token prompt on TTY / first stdin line when piped; strips a pasted `Bearer `; refuses to
overwrite without `-f` (checked BEFORE prompting — tokens die in minutes); friendly
401/404 messages; validates non-empty `aligned_lyrics`; prints lines/words counts.
Token = your Suno session JWT from DevTools (Network → any `studio-api` request →
Authorization). Never stored.

## 5. Web editor — surface-by-surface behavior

### 5.1 TopBar
Brand → back to library. Play/Pause: rAF ticker advances the clock (visual playback —
words light up, playheads glide, caption follows; **no audio** — media stays server-side);
auto-stops at song end; pressing Play in Exact mode switches to Live first (Exact would
ffmpeg-render per tick). Seek ±2s clamps to [0, dur]. Undo/Redo = server history.
Export toggles the export popover.

### 5.2 Project tab (ControlsRail)
Real `<project>/lyrics.json` + video basename ("—" when none). Canvas display-only
(PlayRes must match the video; editable via Tk/MCP). **Alignment = 3×3 numpad grid
popover** (spatial: top row 7/8/9), disabled while pinned. **Free placement (\pos)
toggle**: ON derives `pos` from the current box anchor (never a silent no-op), OFF clears
both. State-aware note ("Pin coordinate comes from dragging the preview box." ⇄ "Margins
come from dragging the preview box edges."). Animation presets: honest "Coming soon"
(engine lacks per-word entrance animations).

### 5.3 Preview stage
16:9 canvas that absorbs all free pane space (container-query sized from `.stage-col`;
ratio holds under any splitter position). Live mode = CSS approximation: caption renders
**one line per `\N`**, per-word resolved color/em-scale/bold; Exact mode = real libass
frame via ffmpeg (`/api/frame?t=`). **Margin mode**: dashed box + 8 handles + "margins"
tag; body drag moves, handles resize; commits ONE `set_globals` of recomputed margins on
release; the **non-anchored band edge is session-visual only** (the model stores one
vertical margin per alignment row; band height persists visually across echoes).
**Pin mode** (`posActive`): crosshair + dot + `\pos` tag at the anchor, move-only, commits
`pos`. Both modes: cursor-following **readout chip** (`L · R · V` / `pos x, y`) during
drag; Esc cancels (snap back, nothing dispatched); <3px = click, not drag; clamped at
canvas walls (overshoot intentionally lost — Tk parity). The caption tracks the live box
during drags. Geometry oracle: `web/src/model/bbox.ts` (mirrors `app_base.py`; middle-row
band is margin-symmetric by design — libass ignores MarginV for middle alignment).

### 5.4 Inspector
- **StyleWaterfall** — three tiers (CUE/GROUP/GLOBAL), per-key rows showing resolved value
  + inheritance source (`grp`/`glob`); set via steppers (fontsize ±2 min 8, outline_w/
  shadow ±1 min 0, back_alpha ±0x10 hex-clamped), bold toggle (**toggling to the inherited
  value clears the override** instead of writing an explicit one), 7 color swatches per
  color key, border-mode Outline|Box buttons, align via the same 3×3 grid; × clears an
  override. Cue tier has no border_style/align rows. Wire: `set_globals {partial}` /
  `set_group_style {gi, partial}` / `set_cue_style {word_ids, partial}` (multi-select
  applies to all selected words).
- **FadeDefaultsPanel** — always visible; three steppers (fade-in/out ±50ms, linger ±0.1s,
  min 0) → `set_fade_defaults` (single changed key).
- **FadeGroupPanel** — only when the selection is in a fade tag: per-lane trigger ±0.5s /
  auto / Clear (membership), duration display with `(group)`/`(global)` source.
- **TimingPanel** — lock pill (**default locked**; aria-label is the action); Start/End
  numeric fields (0.05 step on ↑/↓, ×5 with Shift, Enter/blur commit, clamped start<end)
  and text field → `set_word_times` / `set_word_text`; merged cues: timing+text disabled.
  **Server echoes never clobber a focused field** (live-sync only while unfocused).
- **EventStrip** (on explicit group selection) — accumulate 3-way, linger ±0.1s, window
  display → `set_layout_props`.

### 5.5 Dock
- Tabs: **Timeline** (honest time ruler + click-seek + per-event lanes of time-positioned
  cue blocks + spanning playhead) and **Cue lanes** (LAYOUT/FADE-IN/FADE-OUT table).
- **Selection model** (shared, bidirectional lanes⇄timeline⇄caption): click = single
  (sets anchor), ctrl/cmd-click = toggle into multi (`.multi` highlight), shift-click =
  time-ordered range; Esc clears (not from inputs); selecting an event header opens
  EventStrip; chevron collapses a group's rows.
- **WordTrack editing** (only when timings unlocked): body drag moves a cue (multi-drag
  preserves inter-cue diffs), edge handles resize (blocks <22px are move-only), one
  batched `set_word_times` per gesture, Esc cancels preserving selection; keyboard ←/→
  nudges ±0.05s (Shift = resize end ±0.25s).
- **OpsToolbar** (gating in parentheses): Group fade-in/out → `make_tag` (selection),
  Clear fade → `clear_tag` (selection inside a tag), **Merge words** → one atomic
  `merge_word_span` (≥2 adjacent same-line words; toast otherwise), **Break line** —
  toggle: mid-line cue → `break_line` after it; last-of-line cue → `join_lines` (the
  inverse), Merge events → `merge_events {gidxs:[gi, gi+1]}` (disabled on the last group),
  Split event `{gi, li}`, Ungroup event, Delete/Restore (soft `del` flag), Undo/Redo.

### 5.6 Export popover
Anchored under Export: **Burn video** = primary CTA (output filename defaults
`<project>_subbed.mp4`; optional input-video server path when same-host; defaults to the
project video) — **one-shot guarded** against double-fire; burn progress streams over WS
into the bottom toast (`rendering — N%` → `done — <out>` / `burn error: …`).
**Download .ass** = secondary row ("Subtitle file only — no render"), real blob download
named `<project>.ass`, keyboard-accessible.

### 5.7 Panes & shell
Draggable splitters: rail⇄stage (240–560px) and dock (140–520px); double-click resets;
arrow keys nudge 16px; sizes persist in localStorage; the stage absorbs freed space at
16:9; caption font scales with the stage (cqw), not the viewport. Failed dispatches
surface a red toast.

### 5.8 External sync (the MCP path)
Every mutating tool's WS push renders the right surface with zero UI interaction, and a
baseline push reverts it (44-test exhaustive jsdom battery + live side-channel e2e).
Unsolicited pushes (outside the 1.5s post-local-call window) raise the "AI agent updated
the project" toast; echoes of your own edits don't.

## 6. Daemon API

| Surface | Detail |
|---|---|
| `POST /api/call {tool, args}` | dispatches any `mcp_server/tools.py` function by name; 400 unknown/bad-args, 422 engine errors |
| `GET /api/state` | the `get_project` payload: words, layout, fin/fout_tags, globals (fade/linger), global_style (11 keys), placement (incl. `use_pos`, `pos`), `video` |
| `WS /ws` | `{type:"state", state}` on every change; `{type:"burn", job}` progress |
| `GET /api/frame?t=` | exact libass PNG · `GET /api/ass` — the .ass text |
| `POST /api/burn {out, video_in?}` + `GET /api/burn/{job}` | async ffmpeg job |
| `GET /api/env` | `{same_host}` — strict loopback check; gates server-path inputs |
| `GET /api/projects` · `POST /api/projects/create|new|open|save` | library (multipart create; `new` = legacy shim; open binds autosave) |
| `/mcp` | FastMCP SSE mount, same ctx — agent edits broadcast like any other |

Loopback-only bind; optional `KSS_MCP_TOKEN` bearer on `/api`+`/mcp`. Notable tools beyond
the obvious: `merge_word_span`, `join_lines`, `set_fade_defaults`, `merge_events`,
`split_event`, `ungroup_event`, `undo`, `redo`, `set_video`, `get_project`.

## 7. Running

`./run.sh` — kills stale ports, starts daemon :8770 + web :5173, Ctrl-C stops both;
`./kill.sh` — stops both (force-kill fallback for uvicorn's lingering websockets).
`vite.config.ts` honors `KSS_DAEMON_URL` (and a stale tsc-emitted `vite.config.js` can
shadow it — the build now emits declarations only; if proxying misbehaves, check for that
file). Tk app: `poetry run python karaoke_subtitle_gui.py`. Linux inotify limits may need
`fs.inotify.max_user_watches=524288` for Vite.

## 8. Testing

- **Python** (stdlib `t_*` scripts, `.venv/bin/python tests/<f>.py`, run per-task —
  engine code is TDD-first): engine model/mutations/build-io, merge-span, remove-break,
  group-align, globals-undo, srt, library-create, autosave, daemon, daemon-projects,
  finish-ui tools, mcp, mcp-server, suno_fetch — ~280 tests.
- **Web jsdom** (`npm --prefix web run test`): 612 tests / 49 files, incl. the
  interaction-audit suites (`*.audit.test.tsx`) covering every control's action/revert/
  double/gating + the external-sync battery. Shared harness in `web/src/test-util/`
  (FakeWS, dispatch capture, composable fixtures, localStorage stub).
- **E2E** (`cd web && npx playwright test`, 45 specs): real daemon on a temp seeded
  project + real vite + chromium; asserts `/api/state` AND rendered UI/CSS/geometry, with
  revert symmetry; per-test reset restores a pristine snapshot (autosave-aware).
- **Tk suites** (batched at session end, `DISPLAY=:1`): 118 tests.
- Audit decision log: `docs/superpowers/testing/2026-06-05-adjudication-log.md`
  (19 adjudicated cases; the campaign found, among others: set_globals bypassing undo,
  echo-clobbered typing, the stage container-query bug, no persistence at all).

## 9. Known gaps & parked items

- **Tk-parity gaps (web)**: attach/change video after creation; re-import/swap lyrics on a
  live project; rich font picker (font family effectively not editable from web); margins
  numeric entry (drag-box covers interactively); canvas W×H editing (deliberate);
  portable preset file save/load.
- **No audio playback** in the web (media is server-side; would need a daemon media
  endpoint + synced `<audio>`).
- **Animation presets** — UI placeholder kept honest; engine support absent.
- **Spec 2 (parked)**: "Connect to Suno" via Playwright persistent profile — fetch
  alignment by song link without manual tokens (design sketched in the create/import spec).
- Designer questions parked in `design-system/HANDOFF_create-project-questions.md` and
  `HANDOFF_finish-ui-questions.md` (answered rounds live alongside as `*-answers.md`).
- Multi-word merge >2 is atomic; **merge of non-adjacent selections** intentionally
  refused (toast). `merge_events` is adjacent-next by contract.
- Wall-clamped box drags are intentionally lossy (overshoot discarded — Tk parity).
