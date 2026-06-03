# Designer questions — subtitle editing (retime + text), v3 web UI

**Status:** parked for later. The engineer is implementing an on-brand solution now (reusing existing
v3 components); these are the open *design* questions we'd raise with the designer **only if the
result looks off**. Each item states the current engineer decision so you can react to a concrete
proposal rather than a blank slate.

**Feature recap (what's being built):** edit *existing* subtitles only — **retime** (move/resize a
cue's start/end) and **edit text**. No add/delete in this pass. Timing edits are gated behind a
**lock toggle that is locked by default** (text editing is always allowed). Two edit surfaces: the
**cues timeline** (drag) and the **Timing panel** (numeric + text). Spec:
`docs/superpowers/specs/2026-06-03-subtitle-editing-design.md`.

Relevant existing v3 pieces to reuse/respect: the expanded **cues timeline** (one labelled lane per
event; cue blocks colored by `--cue-N`, playhead spanning lanes), the **Timing panel** card
(currently a `.locked` card with a lock pill + start/stop rows), the inspector **steppers**
(`.pv-step`: −/value/+), the **toggle** atom, form controls (`.text-inp`, `.combo`), and the
selection highlight (`.sel` / `.multi`). Tokens in `colors_and_type.css` (accent `#FF3DA6`, violet,
cyan playhead, surfaces, `--cue-1..10`).

---

## 1. Timeline resize handles (the only genuinely-new visual)
**Engineer decision:** on hover or selection, show thin left/right **edge grips** (`ew-resize`,
~5–6px, accent-tinted) on a cue block; the block body is the move zone (`grab`). Grips fade in on
hover/selection so blocks aren't cluttered at rest.
**Questions:**
- a. Preferred look for the resize grip — a thin solid accent bar inset at each edge, a bracket/“[ ]”
  glyph, a notch, or a full-height handle? Any hover/active color or glow?
- b. Show grips only on hover/selection (current plan) or always-visible on every block?
- c. Should the move-vs-resize zones have distinct visual cues beyond cursor (e.g., a faint center
  “grip dots” for move)?

## 2. Small / dense cues (the real ergonomic risk)
Word-timed lyrics produce many very short cues → blocks a few px wide where move + two resize zones
can't all fit.
**Engineer decision (layered):** min visual block width ~14px; grips may **overhang** outward on
narrow blocks; below ~22px the block is **move-only** by drag and resize falls to the numeric panel +
keyboard nudge; horizontal **zoom is deferred**.
**Questions:**
- a. Is "min-width + overhanging grips + panel/keyboard fallback for tiny cues" acceptable, or do you
  want a dedicated affordance (e.g., a magnified hover lens, an inline mini-zoom, or an explicit
  "edit mode" that enlarges the lane)?
- b. When grips overhang a narrow block, how should overlapping neighbours read (z-order, dimming the
  others)?
- c. Should we revisit **horizontal zoom** now? (Deferred for scope; it's the fully-general fix.)

## 3. Lock / unlock timings (default LOCKED)
**Engineer decision:** the Timing-panel header pill becomes a clickable **lock toggle** (default
locked). While locked: no timeline grips, drags ignored, numeric start/end read-only, keyboard nudge
off; **text stays editable**.
**Questions:**
- a. Where should the lock live — only in the Timing panel, or also a control on the timeline
  itself (since that's where dragging happens)? A global "edit timings" switch in the dock header?
- b. How should the **timeline** signal the locked state (so a user doesn't try to drag)? e.g. a small
  lock badge on the lane header, slightly dimmed blocks, a `not-allowed` cursor, or nothing?
- c. Locked is the default — should there be a one-time hint/tooltip pointing to the unlock toggle?

## 4. Unlocked Timing panel (numeric editing)
**Engineer decision:** reuse inspector **steppers** for **start** and **end** (−/value/+, direct
entry, ↑/↓ to step, Shift = bigger step) + a **text** input; commit on blur/Enter. Times shown to ms.
**Questions:**
- a. Layout: two stepper rows (Start / End) like the inspector, or a combined "Start → End · dur"
  row? Show **duration** as a derived read-only value?
- b. Time format: `m:ss.mmm`, plain seconds `12.766`, or frames? Decimal precision?
- c. Should the panel include a tiny inline scrubber/mini-timeline for the selected cue, or keep it
  numeric-only (timeline handles the visual)?

## 5. Multi-select + group move feedback
**Engineer decision:** shared selection across timeline ↔ cue lanes; click = one (primary),
Ctrl/Cmd-click = toggle, Shift-click = range. Group **move** shifts all selected by the same delta
(diffs preserved). Reuse `.sel`/`.multi` highlight.
**Questions:**
- a. Distinguish the **primary** cue (drives the panel) from **secondary** selected cues visually?
  (e.g., primary = solid accent outline, others = subtle outline.)
- b. During a group drag, how to show the live preview — move the real blocks, or a ghost overlay?
  Any **time tooltip** following the cursor showing the new start/end (and delta)?
- c. Selection highlight parity between the timeline blocks and the cue-lane rows — same treatment, or
  lane-specific?

## 6. Drag interaction polish
**Engineer decision:** click-vs-drag distinguished by a small movement threshold; `Esc` mid-drag
cancels (snap back); `Esc` when selected clears selection.
**Questions:**
- a. Snapping — should drags snap to neighbouring cue edges / the playhead / a time grid, with a
  modifier to disable? (Currently free, no snap.)
- b. Any affordance for "you can press Esc to cancel" during a drag?

## 7. Text editing affordance
**Engineer decision:** edit text in the **Timing panel** text field only (not inline on the block).
**Question:** is panel-only text editing fine, or do you want **double-click-to-edit inline** on the
timeline block / cue-lane row?

---

### How to use this
If the shipped result looks good, this doc stays parked. If anything in §1–§7 reads as off in
practice, we send the relevant questions (with screenshots of the built UI) to the designer and
iterate — the same round-trip pattern used for the original v3 kit.
