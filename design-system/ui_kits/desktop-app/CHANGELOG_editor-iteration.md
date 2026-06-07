# Editor iteration — change-log (for dev handoff)

Scope: the **merged editor** prototype in `ui_kits/desktop-app/` (Project Library → Timeline-Dock
editor) plus the **timeline-animation concept** (`timeline-anim.html`). All changes are in the
prototype layer; the engine model (`model.jsx`) shape is unchanged. Where a change implies a real
engine contract, it's noted.

## Files touched
| File | What changed |
|---|---|
| `app.jsx` | Selection model (range/pick), history (replace + keyboard undo/redo + press-flash), retime/group-move handlers, line ops (break/join toggle, multi, cross-line), merge/unmerge (selection-preserving, cross-line), clearStyle fix, resizable panels, scrub handler, blocks carry `ids`/`subs`/`subTexts`. |
| `stage.jsx` | `WordTrack` drag/resize/group-move + magnet + near-lines + merged-cue segments; `Waveform` `showPlayhead`; `PreviewStage` placement redefinition (safe-area box, edge handles, snap guides, symmetric resize, caption-follows-box, pin+read-only); `TopBar` undo/redo press-flash + AI-pill connection popover w/ copy. |
| `panels.jsx` | Font **picker** (was numeric), CueLanes range/pick selection, OpsToolbar (Unmerge, Break/Join **toggle**, removed dock undo/redo), ControlsRail (alignment disabled under free-placement, removed “Coming soon”). |
| `icons.jsx` | Added `magnet` icon. |
| `theme.css` | All styling for the above (handles, guides, snap lines, toggles, modifier pill, resize affordances, AI popover, preview sizing, unselectable). |
| `tl-anim.js` / `tl-anim.css` / `timeline-anim.html` | Animation-strip concept: magnet snapping, zoom-to-playhead, draggable playhead, source-linking, magnet toggle, no text-selection. |
| `README.md` (repo root) | Waveform noted as deferred; scrub hint updated. |

---

## 1. Timeline — drag, resize & magnet snapping (`stage.jsx WordTrack`, `app.jsx`, `theme.css`)
- **Drag a block to retime; drag either edge to resize.** Whole gesture is one undo step
  (`useHistory.replace` for live frames, `set` only on the first frame).
- **Magnet snapping** (`SNAP_PX = 9`): edges magnetize to neighbour block edges, the playhead,
  event/group boundaries, and track start/end. Snapped edge shows a solid cyan guide + a `0.00s`
  time tag.
- **Near-line preview** (`REVEAL_PX = 40`): candidate snap targets fade in as an edge approaches
  (faint dotted lines, opacity scales with proximity); the active lock draws strong + labelled.
- **Magnet toggle** in the timeline toolbar (on by default). **Alt** held during a drag inverts the
  current mode; the toggle tints **amber** (`--warn`) while Alt is down.
- **Group move:** dragging any block that's part of a multi-selection moves the whole selection by a
  single snapped delta, preserving relative gaps and clamping the group within `[0, dur]`.
- New `magnet` icon (`icons.jsx`).

## 2. Selection model (`app.jsx`, `panels.jsx CueLanes` + `stage.jsx WordTrack`)
- **Shift = range select** between an anchor and the clicked cue (contiguous, by token order);
  **Ctrl/Cmd = cherry-pick** (toggle one). Plain click = single + set anchor.
- Anchor stored in a **ref** (`anchorRef`) so range selection is synchronous/correct.
- Works identically in the **cue lanes** and the **timeline blocks**.
- **Held-modifier indicator**: a pill in the dock tabs (`⇧ Range select` / `⌘ Cherry-pick`) appears
  while Shift/Ctrl is held.
- Multi-selected rows highlight stronger (violet fill + left bar).

## 3. Layout ops — lines & merging (`app.jsx`, `panels.jsx OpsToolbar`)
- **Break/Join is one contextual toggle** (replaces two buttons): "Break line" when no `\N` follows
  the cue, "Join line" (on-state) when one does.
- **Multi-select line behavior:** if the selection spans >1 line → **Join** (collapse those lines to
  one, per event); else → **Break after each** selected cue.
- **Merge words across line breaks:** merges the contiguous selected run into one cue and drops the
  `\N`s *inside* the run (breaks outside are preserved). Single-line merges still work.
- **Unmerge:** splits a merged token back into separate words.
- **Selection is preserved through merge/unmerge:** many → the merged cue selected; merged →
  all unmerged words selected. (`clearStyle` etc. operate on the live `np`, not a stale clone.)
- **Merged-cue internal timing:** in the timeline a merged block renders **each word's text in its
  own time segment** (positioned by the word's real start/end) with a divider tick — instead of one
  centered label.

## 4. Playhead & scrubbing (`app.jsx`, `stage.jsx`, `theme.css`)
- **One continuous current-time marker** through the ruler/track (replaced the two stub lines).
- **Reduced-opacity line** (so it doesn't hide content), with an opaque grab head.
- **Draggable to scrub** (drag the playhead or the ruler); the playhead **snaps** under the same
  magnet rule (Alt inverts), with the same near-line preview.

## 5. History & undo/redo (`app.jsx`, `stage.jsx TopBar`, `theme.css`)
- **Ctrl/⌘+Z = undo**, **Ctrl/⌘+Shift+Z** or **Ctrl+Y = redo** (global key handler via a `hRef`/
  `actRef`, bound once).
- **Press-flash:** triggering undo/redo (key *or* button) briefly flashes the TopBar button
  (`.btn.pressed`). No-ops (and no flash) when there's nothing to undo/redo.
- **De-duplicated:** undo/redo removed from the cue-lanes toolbar — it's global, so it lives only in
  the TopBar.

## 6. Inspector fixes (`panels.jsx`, `app.jsx`)
- **Font is now a real picker** (dropdown of font families). It was declared `kind:"combo"` but had
  no case in `PropRow`, so it fell through to the **numeric stepper** (and could corrupt the value) —
  fixed.
- **"X" clear-override bug:** the CUE tier passes `tier="word"`, but `clearStyle` only handled
  `"group"`/`"cue"` → it cloned state (activating undo) without deleting. Now clears cue overrides.
- Removed the **"Animation preset — Coming soon"** stub from the controls rail.
- Note: **Box alpha shown in hex** is intentional (mirrors the ASS/libass alpha byte,
  `00`=opaque…`FF`=transparent). Left as-is; swap to % on request.

## 7. Layout / resizable panels (`app.jsx`, `theme.css`)
- **Rail width** (drag its right edge) and **dock height** (drag its top edge) are resizable
  (`startResize`, clamped). Handles highlight on hover/drag.
- **Editor is unselectable** (`user-select:none` on `.app`; `body.tl-drag` hardens it during any
  drag) — no accidental text selection while clicking/dragging cues.

## 8. Preview stage sizing (`stage.jsx`, `theme.css`)
- **Preview fills the centre** — largest 16:9 that fits the margins (container-query sized), capped
  at **1:1** (1920px); the caption scales with the stage (`cqw`).
- **Live/Exact toggle is fixed-width** (the `CSS approx` / `libass` label no longer shifts the
  segmented control).
- **Waveform removed** from the editor timeline (component kept for later); the ruler is the scrub
  surface now. README updated.

## 9. Preview placement — redefined (`stage.jsx PreviewStage`, `panels.jsx ControlsRail`, `theme.css`)
Grounded in the real model: placement = **alignment + L/R/V margins**, or **`\pos`**.
- **Box = caption safe-area**, driven by margins + alignment; it **hugs the measured caption height**
  (no fake fixed rectangle). Caption text follows the box (or the pin).
- **Edge-only handles** as full-length bars: **left + right always**, plus **top OR bottom** per
  alignment (none for middle). Body is **not** draggable (edges only).
- **Snap guides visible upfront**: canvas-center cross + **5% / 10% safe-area** rectangles always
  shown faintly; the matching line brightens on snap. **Alt** bypasses snapping.
- **Symmetric resize by default** (a shared delta moves both margins, keeping the box centred and
  **stopping at min width without sliding the centre**); hold **Shift** for one-side.
- **Free placement (`\pos`)**: draggable pin + a **read-only** safe-area box; the **Alignment**
  control is disabled while free placement is on.
- **Handle reachability fixes:** handles inset within the stage and the box raised above the caption
  with `pointer-events` only on the handles — so left/right/bottom stay grabbable at **0 margins /
  full width**.

## 10. AI presence / MCP connect (`stage.jsx TopBar`, `theme.css`)
- Hovering the **"AI agent · live"** pill opens a popover with the **MCP connection params** (host,
  port, `/mcp`, `ws://…/ws`, `POST …/api/call`, `Bearer` token; loopback + CORS note) — values from
  the daemon contract.
- **Copyable**: each row is click-to-copy (shows "Copied ✓"), plus a **"Copy agent config (JSON)"**
  button that copies a ready-to-paste `mcpServers` block.

## 11. Timeline-animation concept (`tl-anim.js`, `tl-anim.css`, `timeline-anim.html`)
- Strips are **snappable and snap targets** (snap to cue edges, other strips, the playhead, window
  ends), with a **Magnet** toggle + **Alt** bypass + guide lines + near-line preview.
- **Zoom anchors on the current time** (pins the playhead's on-screen position instead of growing
  from the left).
- **Draggable, reduced-opacity playhead** with a grab head.
- **Source linking:** hovering/selecting a **group/global**-sourced animation outlines every other
  in-view instance sharing the same source id; the focus panel shows "Source · Group/Global · N cues".
- Dragging no longer selects strip/label text.

---

## Dev notes / engine implications
- Range/pick selection, group-move, cross-line merge and join all operate on the `model.jsx`
  `layout → lines(\N) → toks(ids[])` shape; they map to `set_*` / `add_animation` style edit tools and
  the one shared undo/redo timeline (see `HANDOFF_real-model.md`, `uploads/HANDOFF_daemon-contract.md`).
- Placement edits write `margin_l/r/v`, `align`, `use_pos`, `pos` on `project.placement` (engine:
  global cfg via `set_globals`).
- Merged-cue segments need per-word `start/end` (already in the render-group word list).
