# Designer questions — finish-ui (placement drag-box, export menu, fade defaults)

**Status:** parked for later. The engineer is implementing on-brand solutions composed from
existing v3 kit atoms; these are the open *design* questions we'd raise with the designer **only
if the shipped result looks off**. Each item states the current engineer decision so you can
react to a concrete proposal. Spec: `docs/superpowers/specs/2026-06-04-finish-ui-design.md`.

**Feature recap:** (1) the preview's bounding box (already in the kit: `.bbox` + 8 handles +
"Drag inside the box to move…" help text) becomes functional — drag/resize edits margins, or the
`\pos` pin when free placement is on; (2) the toolbar **Export** button opens a small menu/dialog
(Download `.ass` / Burn with output name + optional video override) instead of immediately
burning; (3) the fade panel gains editable **global** fade/linger defaults; (4) the Project tab's
rows become real (lyrics/video names, working Alignment dropdown; fake group-by row removed).

---

## 1. Drag-box interaction states (the kit shows only the resting state)
**Engineer decision:** body drag = `grab`/`grabbing` cursor; handles = directional resize
cursors; while dragging, the box border brightens (accent) and the rest of the stage dims
slightly; Esc cancels (snaps back).
- a. Hover/active styling for the 8 handles — fill, glow, size bump?
- b. Should the box look different in **pinned (`\pos`) mode** vs **margin mode** (e.g. a pin
  glyph at the anchor corner, different border style)? Currently: same look both modes.
- c. Any affordance distinguishing "this edge maps to a margin" vs free edges?

## 2. Live readout while dragging
**Engineer decision:** none in v1 — the box itself is the feedback; values land in the Project
tab after release.
- a. Want a small floating readout near the cursor (`L 80 · R 80 · V 60` / `pos 960,540`)?
- b. Or readouts on the box edges themselves?

## 3. Snapping
**Engineer decision:** free dragging, no snap (matches the cues-timeline precedent).
- a. Snap to canvas center / thirds / safe margins, with a modifier to disable?

## 4. Export menu surface
**Engineer decision:** clicking **Export** opens a small anchored popover (kit modal styles,
compact): primary action "Burn video" with an output-filename field (+ optional input-video
server path when same-host) and a secondary "Download .ass" row. One surface, two actions.
- a. Popover anchored to the button vs a centered modal (like the create dialog)?
- b. Field order / hierarchy: is Download-.ass prominent enough as a secondary row, or should it
  be a co-equal split button?
- c. Show burn progress inside the popover, or keep the existing bottom toast bar? (Current:
  keep the toast bar.)

## 5. Global fade defaults row group
**Engineer decision:** inside the existing fade panel, below the per-group rows, a separated
"Global defaults" group with three steppers (`fade-in ms`, `fade-out ms`, `linger s`) using the
inspector's `.pv-step` atoms; the "(global)" source note in per-group rows stays.
- a. Does the global tier belong in this panel, or in the Project tab (it's a project-wide
  setting like placement)?
- b. Visual separation between per-group and global tiers — divider + label enough?

## 6. Project tab after wiring
**Engineer decision:** same rows/styling; group-by row removed; Alignment becomes a real select
styled like the kit dropdown; lyrics/video become real names (video shows "—" when absent);
a one-line note under the `\pos` toggle ("pin coordinate comes from dragging the preview box").
- a. OK to drop the group-by row entirely, or want a read-only "imported by: section" souvenir?
- b. The note under the toggle — keep, or tooltip instead?

---

### How to use this
If the shipped result looks good, this doc stays parked. If anything reads off, send the
relevant questions with screenshots to the designer — the same round-trip used for the v3 kit.
