# Finish Web UI — placement editing, multi-merge, export & fade parity — Design

**Status:** scope + decisions approved in brainstorming; pending written-spec review.
**Branch:** `feat/finish-ui` (off `feat/project-create-import`).

## 1. Goal

Close the dishonest-placeholder and Tk-parity gaps in the v3 web UI:

1. **Project tab (`ControlsRail`)** — real lyrics/video names, remove the fake group-by dropdown,
   a working Alignment control, honest `\pos` toggle.
2. **Draggable preview bounding-box** — the stage already *renders* the box + 8 handles and the
   help text promises drag; implement the Tk behavior (drag/resize → margins or `\pos`).
3. **Atomic multi-word merge** — lift the 2-word limit via one atomic engine span-merge.
4. **`.ass` download** — the file the app exists to produce becomes saveable from the web.
5. **Global fade defaults** — the fade waterfall's *global* tier becomes editable (the tool
   `set_fade_defaults` already exists; this is UI only).
6. **Burn options** — output filename + optional input-video override instead of the hardcoded
   `<project>_subbed.mp4`.

**Decided & out of scope (parked as follow-ups):** attach/change video post-create, lyrics
re-import on a live project, a real font picker, margins numeric entry, Canvas W×H editing
(display-only by decision), portable preset file save/load, library search, project thumbnails.
Animation presets stay an honest "Coming soon" (engine lacks them).

## 2. Engine — atomic span merge

New mutation in `engine/mutations.py`:

```python
def merge_token_span(project, gi, li, ti_first, ti_last, sep=""):
    """Collapse tokens [ti_first..ti_last] of one line into a single token.
    ids concatenate in order; keeps the LEFT token's style and del flag (same
    semantics as merge_prev_word). Validates 0 <= ti_first < ti_last < len(toks);
    raises ValueError otherwise."""
```

- `merge_prev_word` stays (Tk + existing tool back-compat).
- One mutation = one undo step. Word atoms and fade tags (which reference word *ids*) untouched.
- **Tests (TDD):** 3+-token merge (ids order, `core.token_text` rendering), left style/del kept,
  `sep` applied, full-line merge, validation errors, undo restores tokens.

New tool `merge_word_span(ctx, gi, li, ti_first, ti_last, sep="")` in `mcp_server/tools.py`
(returns `_event_view(ctx, gi)`), registered in `server.py`. `/api/call` dispatches by name —
no daemon route changes.

## 3. Daemon contract — expose the video

`get_project` gains one top-level field: `"video": ctx.video_path()` (absolute path or `null`).
Additive; nothing else changes. Web `types.ts`: `Project.video: string | null`.
Tests: `get_project` has `video: null` without video, the path after `set_video`.

## 4. Web — ControlsRail rewrite

Props: `{ project, projectName, onSetGlobal(key, value) }` (Editor passes its existing
`set_globals`-partial dispatcher).

| Row | Behavior |
|---|---|
| Lyrics | Real: `<projectName>/lyrics.json` (display-only). |
| Video | Real: basename of `project.video`, "—" when null (display-only). |
| Group lyrics by | **Removed** (import-time-only; create modal owns it). |
| Canvas | Display-only (real values). |
| Alignment | **Real `<select>`** (numpad 1–9 labels) → `onSetGlobal("align", n)`. |
| Free placement (`\pos`) | **Wired toggle** (see §5): ON derives `pos` from the current box anchor; OFF clears `use_pos`. |
| Animation preset | Unchanged honest "Coming soon". |

The inert `Select`/`Combo` atoms lose their last consumer — remove them from `atoms/index.tsx`
if nothing else imports them.

**Tests:** real names render ("—" without video); no group-by row; alignment select fires
`onSetGlobal("align", n)`; `bleating_*` strings gone.

## 5. Web — draggable preview bounding-box (Tk parity)

`PreviewStage`'s `.bbox` becomes live. Geometry imported from `app_base.py`
(`_box_from_margins` / `_margins_from_box` / `_anchor_xy_playres`), expressed in **canvas
(PlayRes) units**, scaled to the stage's on-screen size:

- **Box from state:** `left = margin_l`, `right = play_w − margin_r`; vertical by alignment row:
  bottom-row (1/2/3) → `bottom = play_h − margin_v`, `top = bottom − 0.18·play_h`; top-row
  (7/8/9) → `top = margin_v`, `bottom = top + 0.18·play_h`; middle (4/5/6) → a centered band
  `±0.09·play_h`. When `pos != null`, the box is anchored so that its alignment anchor point sits
  at `pos` (same box size).
- **Anchor point** (for `pos` derivation): x = left/center/right edge for align column 1/2/3 of
  the numpad; y = bottom/middle/top edge for align row. Exactly Tk's `_anchor_xy_playres`.
- **Interactions:** drag body = move; drag one of the 8 handles = resize; pointer-capture with a
  3px click-vs-drag threshold and **Esc-cancel** (same pattern as the WordTrack drag controller);
  live visual preview during drag; on release **one** `set_globals` call:
  - margin mode (`pos == null`): `{margin_l, margin_r, margin_v}` recomputed from the box
    (Tk's `_margins_from_box`, clamped ≥ 0).
  - `\pos` mode (`pos != null`): `{pos: [x, y]}` from the anchor point.
- **`\pos` toggle** (ControlsRail): ON → `set_globals {use_pos: true, pos: <current box anchor>}`
  (no silent no-op — the coordinate is derived right there); OFF →
  `set_globals {use_pos: false, pos: null}` (placement reverts to margins).
- Pure geometry lives in a new `web/src/model/bbox.ts` (boxFromState, marginsFromBox,
  anchorXY, applyMove/applyResize with clamping) — unit-testable without DOM.

**Tests:** bbox.ts geometry round-trips (margins→box→margins identity; anchor per alignment;
clamps at canvas edges; resize respects min size); stage dispatches one `set_globals` per
release; Esc cancels with no dispatch.

**Designer questions** (parked, HANDOFF doc): live margin/pos readout during drag? snapping?
distinct visual for pinned (`\pos`) vs margin mode? min box size?

## 6. Web — multi-word merge

`Editor.mergeWords()`: map selected word ids → tokens; validate same `gi, li` and contiguous
`ti` run (dedup ids already sharing a token); dispatch **one**
`merge_word_span {gi, li, ti_first, ti_last, sep: " "}`. Invalid → toast
"merge needs adjacent words on one line". `canMergeWords` gating: `>= 2` selected.
**Tests:** 3-word merge → one span call; gap / cross-line → toast, no dispatch; 2-word path
still works; TODO comment gone.

## 7. Web — export menu (.ass download + burn options)

The toolbar **Export** button opens a small popover/dialog instead of immediately burning:

- **Download .ass** — fetches `GET /api/ass` and saves it client-side (blob download,
  `<projectName>.ass`). No daemon change.
- **Burn video** — fields: output filename (default `<projectName>_subbed.mp4`) and optional
  input-video override (server path, shown only when `/api/env.same_host`; default = the
  project video). Submits the existing `POST /api/burn {out, video_in?}`; progress keeps
  streaming via the existing WS path.

**Tests:** download triggers a blob save with the .ass content; burn posts the edited output
name and optional video_in; default output name derived from projectName.

## 8. Web — global fade defaults

In the right-rail fade panel (where "(global)" is currently shown as a read-only source),
add a small **Global defaults** row group: steppers for `fade_in_ms`, `fade_out_ms` (ms, step
50) and `linger` (s, step 0.1), dispatching the **existing** `set_fade_defaults` tool
(`{fade_in_ms?|fade_out_ms?|linger?}`). Values read from `project.globals`.
**Tests:** steppers render current globals and dispatch `set_fade_defaults` with the single
changed key.

## 9. Error handling

Engine `ValueError` → 422 → existing red toast. Client-side validation (merge adjacency, box
clamping) prevents most invalid calls; engine stays the backstop.

## 10. Testing summary

- Python: `test_engine_mutations.py` (+span merge), `test_mcp.py`/`test_daemon.py`
  (+`merge_word_span`, +`get_project.video`). TDD-first per policy.
- Web: `model/bbox.test.ts` (new), ControlsRail tests (new), PreviewStage drag tests (new),
  Editor merge tests (extend), Export menu tests (new), fade-defaults tests (extend), full
  suite + build.
- Tk suites unaffected (batched at the end).

## 11. File map

- **Create:** `web/src/model/bbox.ts` (+ test), `web/src/components/ExportMenu.tsx` (+ test),
  ControlsRail + PreviewStage test files, `design-system/HANDOFF_finish-ui-questions.md`.
- **Modify:** `engine/mutations.py`, `mcp_server/tools.py`, `mcp_server/server.py`,
  `web/src/types.ts`, `web/src/api/client.ts` (getAss blob helper if needed),
  `web/src/components/panels/ControlsRail.tsx`, `web/src/components/stage/PreviewStage.tsx`,
  `web/src/components/Editor.tsx`, `web/src/components/panels/FadeGroupPanel.tsx`,
  `web/src/components/atoms/index.tsx` (drop dead atoms), `web/src/theme.css` (export menu /
  fade-defaults styles), tests as above.
- **Follow-ups doc:** the parked parity gaps (#video-attach, #re-import, #font-picker, etc.)
  recorded in this spec's §1; no separate tracker.
