# Karaoke Subtitle Studio — Features & Behaviors Reference

> Authoritative inventory of every feature and its exact behavior, as of 2026-06-07
> (branch lineage: `feat/finish-ui` → `feat/group-alignment` → `feat/designer-fidelity`
> → `feat/resizable-panels` → `feat/interaction-audit` → `feat/animations` →
> `feat/editor-iteration`). Companion to CLAUDE.md (architecture/provenance) and
> README.md (how-to). Specs live in `docs/superpowers/specs/`; designer rulings in
> `design-system/HANDOFF_*.md`; vocabulary in `docs/GLOSSARY.md`.

---

## 1. Architecture at a glance

```
Suno API ──suno_fetch──► aligned_lyrics.json ─┐
SRT file ──engine/srt──► (same shape)         ├─► engine.make_project ─► project dict
                                              │        ▲ lyrics.json per project folder
controller.Session: undo/redo snapshots of (project, aux-globals) + on_change
mcp_server: EngineContext bridge — HeadlessContext (dict globals) / DaemonContext (push)
daemon/: Starlette app = /api (HTTP) + /ws (push) + /mcp (FastMCP SSE) + autosave + SPA
web/:   Vite+React, server-authoritative (state := last /ws push; every edit = /api/call)
desktop/: Electron shell — owns a local native-mode daemon + native file dialogs
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
- **Lines** — `\N` boundaries inside an event; **Groups/events** `{label, win_start/end,
  linger, del, style, animations, suppress, lines}` — one ASS Dialogue each. Groups are
  fully dynamic: merge / split / ungroup / re-break at any time. (The old per-event
  `accumulate` field is GONE — its three modes are now expressed as the timing **mode** of
  the appearance animation; see §2a.)
- **Style waterfall** `global < group < cue`; STYLE_KEYS (11): font, fontsize, bold,
  primary, outline, back, back_alpha, outline_w, shadow, **border_style**, **align**.
  border_style (no inline per-cue tag) and align (`\an` is event-scoped) are **group-only**
  (CUE_STYLE_KEYS = 9). `null`/absent = inherit; explicit value = override.
- **Placement (global)**: `align` (ASS numpad 1–9), `play_w/h` (canvas = PlayRes),
  `margin_l/r/v`, `use_pos` + `pos [x,y]` — libass pins text at `pos` **only when both**
  `use_pos` and `pos` are set (`posActive` in the web mirrors this).
- **ASS export is a compilation target**: `project_to_render` bakes appear-times/windows
  and `engine/anim.py` resolves+emits the animation tags; `build_ass` emits one Style per
  box-mode, one Dialogue per event, per-word inline style deltas + the animation `\t`/`\kf`/
  `\clip`/`\move` chains, `{\anN}` once per event when group-align differs, `\pos` when
  pinned. Regenerated for every export/exact-frame/burn; never parsed back.

## 2a. Animations (fades are a special case)

The legacy fade model (`fin_tags`/`fout_tags`, `group.fade`, `globals.fade_in_ms/fade_out_ms`,
per-event `accumulate`, the five `*_fade_*`/`set_fade_defaults` tools) has been **removed and
replaced by a single general animation system**. A fade-in is now just an `alpha` animation;
a karaoke sweep, color flash, pop, wipe, blur and slide are other channels.

- **Animation record** `{id, name, group_id?, channel, mode?, step?, step_unit?,
  segments:[{t0, t1, from, to, accel}], stagger?, enabled}`. `segments` are the keyframes
  (a single segment = a plain transition; multiple = a curve). `accel` is the libass `\t`
  acceleration exponent (inout presets auto-expand to an S-curve).
- **Three scopes (carriers)**, narrowest-to-widest authority:
  - **`globals.animations`** — project-wide.
  - **`layout[gi].animations`** + **`layout[gi].suppress`** — per-event.
  - **`anim_tags`** `[{ids, anims, suppress}]` — **selection scope**; a per-cue animation is
    just a tag whose `ids` is one cue. (Tool boundary accepts `"cue"` as an alias of `"tag"`.)
- **8 anchors** — `{cue, line, span, event} × {start, end}`; offsets in **ms** or **frac**.
  `engine/anim.anchor_seconds` resolves an anchor+offset to an absolute time against the
  relevant span.
- **Timing modes** — `percue`, `perline`, `together`, `cascade`, `typewriter`, `reverse`,
  `centerout`, `jitter` (plus `"custom"` = raw per-member anchors). `step`/`step_unit`
  (ms or %) and `stagger` parameterize the sequenced modes. **The old `accumulate` words/
  lines/off map onto these modes** (e.g. word-by-word reveal ≈ `percue`).
- **Suppression = tombstones**: a wider-scope animation is muted at a narrower scope by
  listing its id in that carrier's `suppress[]`. Restoring removes the tombstone.
- **Conflict rule**: same `channel` overlapping in time **across scopes** → narrowest scope
  wins; **within one scope** → both apply + a validation warning. `move` is **event/global
  only** (no `\move` per cue — rejected at tag scope).
- **Appearance rule**: if **no** alpha animation covers a cue, the cue is **visible for the
  whole event** (no implicit fade). Fades are opt-in now.
- **Compilation** (`engine/anim.emit_anim_tags`): `\t` chains are emitted **narrowest-scope
  LAST** (libass last-listed-wins); karaoke Sweep uses `\kf` with `\k` gap padding; wipes use
  `\clip`; `move` uses `\move`.
- **Migration**: legacy project **files** auto-migrate on open (`engine/anim_migrate.py`,
  invoked from `daemon/library.open_project`) — byte-identical `.ass` is gold-tested. There is
  **no WS/MCP backward-compat shim**: the live API only speaks the animation model.

## 3. Persistence

- A project = folder `<projects-dir>/<name>/` with `lyrics.json` (source-shaped, enough to
  rebuild atom count/text) + `project.json` `{globals_style, cues_v2, video}`.
  `cues_v2` carries the **full** truth: layout (incl. per-event `animations`+`suppress`),
  tokens, `anim_tags`, `globals.animations`, AND `words` (exact timings/text overlay on
  reopen). `video`: folder-relative basename if copied in, absolute path if referenced.
  **Legacy fade-shaped files auto-migrate to the animation model on open** (§2a).
- **Autosave (daemon)**: every change debounce-saves (400ms) the bound project
  (`daemon/autosave.py`); bound on open/new/create; never crashes the daemon; covers
  MCP-agent edits with no browser open. The write is **atomic** (`mkstemp` + `os.replace`)
  so a crash mid-save never corrupts `project.json`. There is deliberately no manual save
  button.
- **Undo/redo**: `controller.Session` snapshots `(project, aux)` per operation — aux is
  the context's style/placement globals, so **`set_globals` edits (alignment, margins,
  \pos…) are undoable** like everything else. One user gesture = one undo step (atomic
  multi-merge, batched `set_word_times`, one animation add/remove/restore/set-props). Tk
  path unaffected (aux hooks default off).

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
ffmpeg-render per tick). Seek ±2s clamps to [0, dur]. **Undo/Redo** = server history, and
the **only** undo/redo controls (dock copies removed); also bound to **Ctrl/⌘+Z** and
**Ctrl+Y / ⌘⇧Z** with a **press-flash** on the button. A **held-modifier pill** shows the
active drag modifier (Shift/Alt). The **AI/MCP connect popover** lives on the TopBar pill
(`GET /api/connect`, a conditional auth row when a token is set, and a copy-to-clipboard
`mcpServers` JSON). Export toggles the export popover.

### 5.2 Project tab (ControlsRail)
Real `<project>/lyrics.json` + video basename ("—" when none). Canvas display-only
(PlayRes must match the video; editable via Tk/MCP). **Font family** = real picker
(`GET /api/fonts` via `fc-list`). **Alignment = 3×3 numpad grid popover** (spatial: top
row 7/8/9), disabled while pinned. **Free placement (\pos) toggle**: ON derives `pos` from
the current box anchor (never a silent no-op), OFF clears both. State-aware note ("Pin
coordinate comes from dragging the preview box." ⇄ "Margins come from dragging the preview
box edges."). Animations are **live**: the rail points at the Inspector's **AnimSection**
(no dead "Coming soon" stub) — the old placeholder is gone.

### 5.3 Preview stage
16:9 canvas that absorbs all free pane space (container-query sized from `.stage-col`;
ratio holds under any splitter position). **Live mode is now a REAL libass render**:
**jassub** (libass-in-wasm, `web/src/preview/jassubClient.ts`) renders the actual `.ass`
on a canvas behind the DOM caption layer — the DOM layer became a transparent hit-test/
selection overlay only. `/api/ass` is fetched on every WS push and handed to jassub via
`setTrack` (~1-2ms); the daemon serves embedded fonts at `/api/font`. Gated behind the
`VITE_JASSUB` flag. The old "live = CSS approximation" story is **dead**. Exact mode is
unchanged = a real server ffmpeg libass frame via `/api/frame?t=`. **Margin mode**: dashed
box + 8 handles + "margins"
tag; body drag moves, handles resize; commits ONE `set_globals` of recomputed margins on
release; the **non-anchored band edge is session-visual only** (the model stores one
vertical margin per alignment row; band height persists visually across echoes).
**Pin mode** (`posActive`): crosshair + dot + `\pos` tag at the anchor, move-only, commits
`pos`. Both modes: cursor-following **readout chip** (`L · R · V` / `pos x, y`) during
drag; Esc cancels (snap back, nothing dispatched); <3px = click, not drag; clamped at
canvas walls (overshoot intentionally lost — Tk parity). The caption tracks the live box
during drags. **Shift = symmetric resize**; while dragging there's a **soft snap to center
plus 5%/10% safe-area guides** (hold **Alt** to bypass the snap). Geometry oracle:
`web/src/model/bbox.ts` (middle-row band is margin-symmetric by design — libass ignores
MarginV for middle alignment).

### 5.4 Inspector
- **StyleWaterfall** — three tiers (CUE/GROUP/GLOBAL), per-key rows showing resolved value
  + inheritance source (`grp`/`glob`); set via steppers (fontsize ±2 min 8, outline_w/
  shadow ±1 min 0, back_alpha ±0x10 hex-clamped), bold toggle (**toggling to the inherited
  value clears the override** instead of writing an explicit one), 7 color swatches per
  color key, border-mode Outline|Box buttons, align via the same 3×3 grid; × clears an
  override. Cue tier has no border_style/align rows. Wire: `set_globals {partial}` /
  `set_group_style {gi, partial}` / `set_cue_style {word_ids, partial}` (multi-select
  applies to all selected words).
- **AnimSection** (replaces the old FadeDefaults/FadeGroup panels) — the animation editor,
  **append-override model**: the three scope tiers (global / group / cue=selection-tag)
  start **empty**; each shows **own** rows, **inherited** rows (collapsed under an
  "Inherited (n)" disclosure) and **tombstone** (suppressed) rows. The cue/tag tier shows a
  **"N cues"** chip for its membership. A **preset picker** adds animations — **8 presets**:
  Fade in, Fade out, Sweep, Pop, Color flash, Wipe in, Blur in, **Slide** (Slide/move is
  group+ only — disabled at cue/tag scope). Wire: `add_animation` / `remove_animation` /
  `restore_animation` / `set_animation_props {scope, ref, anim_id, partial}` (scope
  `global|group|tag`, with `cue` accepted as a `tag` alias).
- **TimingModePicker** — sets an animation's timing mode: 3 inline modes + a **Sequence**
  popover for the rest; a **step sub-row** toggles its unit ms ⇆ %.
- **TimingPanel** — lock pill (**default locked**; aria-label is the action); Start/End
  numeric fields (0.05 step on ↑/↓, ×5 with Shift, Enter/blur commit, clamped start<end)
  and text field → `set_word_times` / `set_word_text`; merged cues: timing+text disabled.
  **Server echoes never clobber a focused field** (live-sync only while unfocused).
- **EventStrip** (on explicit group selection) — linger ±0.1s, window display →
  `set_layout_props` (the 3-way `accumulate` control is GONE — appearance timing now lives
  in the appearance animation's timing mode).

### 5.5 Dock
- Tabs: **Timeline** (the **Waveform is a scrubbable ruler** — drag or click the playhead to
  seek + per-event lanes of time-positioned cue blocks + spanning playhead) and **Cue lanes**
  (now **four** columns: LAYOUT / FADE-IN / FADE-OUT / **ANIMATION**).
- **Selection model** (shared, bidirectional lanes⇄timeline⇄caption): click = single
  (sets anchor), ctrl/cmd-click = toggle into multi (`.multi` highlight), shift-click =
  time-ordered range; Esc clears (not from inputs); selecting an event header opens
  EventStrip; chevron collapses a group's rows. Selection is **preserved through merge/
  unmerge**.
- **WordTrack editing** (only when timings unlocked): body drag moves a cue (multi-drag
  preserves inter-cue diffs), edge handles resize (blocks <22px are move-only), one
  batched `set_word_times` per gesture, Esc cancels preserving selection; keyboard ←/→
  nudges ±0.05s (Shift = resize end ±0.25s). **Merged cues render their per-word
  sub-segments** on the track. **Magnet snapping** (SNAP_PX 9, near-line previews, toggle
  persisted, **Alt inverts**) applies across block drag/resize.
- **WordTrack animation strips** — each cue carries up-to-3 animation strips (fill colored
  by channel type; cap 3 with a **"+N" inline expand**); 26px glyph chips; **2-click
  select→focus**; **drag-retime handles** edit `{t0|t1:{offset ms}}` with a 50ms clamp.
- **OpsToolbar** (gating in parentheses): the **fade buttons are now preset shortcuts**
  (Fade in/out via `add_animation`, not the dead `make_tag`/`clear_tag`); **Merge words** →
  one atomic `merge_word_span`/`merge_words_run` (≥2 adjacent words; cross-line contiguous
  runs allowed, inner `\N` dropped), **Unmerge** → `unmerge_words`; multi-select **Break/
  Join** semantics: a selection spanning >1 line → **Join**, otherwise **Break** after each;
  Merge events → `merge_events {gidxs:[gi, gi+1]}` (disabled on the last group), Split event
  `{gi, li}`, Ungroup event, Delete/Restore (soft `del` flag). **Undo/Redo moved to the
  TopBar only** (the dock copies were removed).

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
baseline push reverts it (exhaustive jsdom battery incl. an `.anim.audit` external-sync
suite + live side-channel e2e). Unsolicited pushes (outside the 1.5s post-local-call window)
raise the "AI agent updated the project" toast; echoes of your own edits don't.

## 6. Daemon API

| Surface | Detail |
|---|---|
| `POST /api/call {tool, args}` | dispatches any `mcp_server/tools.py` function by name; 400 unknown/bad-args, 422 engine errors |
| `GET /api/state` | the `get_project` payload: words, layout (incl. per-event `animations`+`suppress`), `anim_tags`, globals (incl. `animations`, linger), global_style (11 keys), placement (incl. `use_pos`, `pos`), `video`, and per-token `anims_resolved`. **No legacy fade keys** (`fin/fout_tags`, `fade_in_ms/out_ms`, `accumulate`) — migrated away |
| `WS /ws` | `{type:"state", state}` on every change; `{type:"burn", job}` progress |
| `GET /api/frame?t=` | exact server-side libass PNG (Exact mode) · `GET /api/ass` — the .ass text (fetched on every push for the jassub live preview) |
| `GET /api/font` | embedded font bytes for the jassub live renderer · `GET /api/fonts` — installed family names via `fc-list` (real font picker) |
| `GET /api/connect` | the AI/MCP connect payload (endpoint + whether auth is required) behind the TopBar pill |
| `POST /api/burn {out, video_in?}` + `GET /api/burn/{job}` | async ffmpeg job |
| `GET /api/env` | `{same_host}` — strict loopback check; gates server-path inputs |
| `GET /api/projects` · `POST /api/projects/create|new|open|save` | library (multipart create; `new` = legacy shim; **open auto-migrates legacy fade files** + binds autosave) |
| `/mcp` | FastMCP SSE mount, same ctx — agent edits broadcast like any other |

Loopback-only bind; optional `KSS_MCP_TOKEN` bearer on `/api`+`/mcp`. Notable tools beyond
the obvious: the **animation set** `add_animation` / `remove_animation` / `restore_animation`
/ `set_animation_props` (scope `global|group|tag`, `cue` aliases `tag`); `merge_word_span` /
`merge_words_run` / `unmerge_words`; `join_lines`, `merge_events`, `split_event`,
`ungroup_event`, `undo`, `redo`, `set_video`, `get_project`. The five legacy fade tools
(`make_fade_tag`, `clear_fade_tag`, `set_fade_tag_props`, `set_group_fade`,
`set_fade_defaults`) are **gone** — no backward-compat shim.

## 7. Running

`./run.sh` — kills stale ports, starts daemon :8770 + web :5173, Ctrl-C stops both;
`./kill.sh` — stops both (force-kill fallback for uvicorn's lingering websockets).
`vite.config.ts` honors `KSS_DAEMON_URL` (and a stale tsc-emitted `vite.config.js` can
shadow it — the build now emits declarations only; if proxying misbehaves, check for that
file). Desktop (Electron) shell: `./run-desktop.sh`. Linux inotify limits may need
`fs.inotify.max_user_watches=524288` for Vite.

## 8. Testing

- **Python** (engine pytest-style `test_*` functions + legacy stdlib `t_*` scripts,
  `.venv/bin/python tests/<f>.py`, run per-task — engine code is TDD-first): engine model/
  mutations/build-io, anim (model/anchors/resolve/timing/compile/migration/tools/undo/
  daemon), merge-span, unmerge, remove-break, group-align, globals-undo, srt, library-create,
  autosave, daemon, daemon-projects, finish-ui tools, connect, mcp, mcp-server, suno_fetch —
  **81 pytest + 20 legacy scripts**.
- **Web jsdom** (`npm --prefix web run test`): **722 tests / 58 files**, incl. the
  interaction-audit suites (`*.audit.test.tsx`, incl. the `*.anim.audit.*` battery) covering
  every control's action/revert/double/gating + the external-sync battery. Shared harness in
  `web/src/test-util/` (FakeWS, dispatch capture, composable fixtures incl.
  `withAnimations`/`withResolved`, localStorage stub).
- **E2E** (`cd web && npx playwright test`, **67 specs / 9 files**): real daemon on a temp
  seeded project + real vite + chromium; asserts `/api/state` AND rendered UI/CSS/geometry,
  with revert symmetry; per-test reset restores a pristine snapshot (autosave-aware).
  Includes a dedicated **jassub pixel tier** (`e2e/jassub.spec.ts`, **14 specs**) that asserts
  the real libass-in-wasm render.
- **Desktop (Electron)**: `desktop/lib.test.js` (node:test) for the main-process helpers; an
  end-to-end `--smoke` (`xvfb-run -a npm --prefix desktop run smoke`) spawns the daemon,
  healthchecks, and exits clean.
- Audit decision log: `docs/superpowers/testing/2026-06-05-adjudication-log.md`
  (the campaign found, among others: set_globals bypassing undo, echo-clobbered typing, the
  stage container-query bug, no persistence at all).

## 9. Known gaps & parked items

- **Remaining gaps (web)**: re-import/swap lyrics on a live project; margins numeric entry
  (drag-box covers interactively); canvas W×H editing (deliberate); portable preset file
  save/load. (Attaching/changing video after creation and the rich font picker are DONE.)
- **No audio playback** in the web (media is server-side; would need a daemon media
  endpoint + synced `<audio>`).
- **Animations are SHIPPED** (general animation system; fades are a special case — §2a).
- **Spec 2 (parked)**: "Connect to Suno" via Playwright persistent profile — fetch
  alignment by song link without manual tokens (design sketched in the create/import spec).
- Designer questions parked in `design-system/HANDOFF_create-project-questions.md` and
  `HANDOFF_finish-ui-questions.md` (answered rounds live alongside as `*-answers.md`).
- Multi-word merge >2 is atomic; **merge of non-adjacent selections** intentionally
  refused (toast). `merge_events` is adjacent-next by contract.
- Wall-clamped box drags are intentionally lossy (overshoot discarded — Tk parity).
