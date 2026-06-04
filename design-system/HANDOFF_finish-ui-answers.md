# Designer answers — finish-ui (placement drag-box, export menu, fade defaults, project tab)

Direct answers to each parked question, **plus** an updated, consistent design implemented in the
v3 kit (`ui_kits/desktop-app/`) so the four features read as one coherent system. Every answer is
built from existing kit atoms/tokens — no new brand colors. Where the engineer already had a
decision, I either **confirm** it or give a small **adjust** with rationale.

Spec: `docs/superpowers/specs/2026-06-04-finish-ui-design.md`. Implemented across `stage.jsx`
(PreviewStage drag-box + ExportPopover, TopBar), `panels.jsx` (ControlsRail/Project tab),
`app.jsx` (FadeDefaultsPanel, placement/export/fade handlers), `theme.css`.

---

## 1. Drag-box interaction states — **confirm + specify**
Confirmed: body = `grab`/`grabbing`; handles = directional resize cursors; while dragging the box
border goes **solid accent + glow** and the stage content (caption/scanlines) dims (`.stage.dragging
.cap{opacity:.45}`); **Esc** snaps back (restores the pre-drag placement).

- **a. Handle states.** Handles are 9px magenta squares with a white core; **hover/active = scale
  1.5× + accent glow** (`.bbox i.mh:hover{transform:scale(1.5);box-shadow:0 0 10px var(--glow-accent)}`).
  No fill change needed — size-bump + glow is enough and matches the timeline-block hover language.
- **b. Pinned vs margin look — YES, make them different.** Margin mode = the dashed rectangle with
  8 handles + a small `margins` tag at the top-left corner. Pinned (`\pos`) mode = **no rectangle**;
  a **crosshair + center dot + `\pos` tag** at the anchor (`.pinbox`). This makes the two placement
  models legible at a glance and matches the engine (one edits margins, the other a single point).
- **c. Margin-edge affordance.** The `margins` tag labels the box as margin-driven; per-edge labels
  would clutter the small preview. The **live readout** (Q2) names the exact edge values during drag,
  which is the clearer moment to show them. So: tag at rest, values on drag — no permanent per-edge
  chrome.

## 2. Live readout while dragging — **adjust → add a cursor readout (v1)**
Engineer said none in v1; I recommend a **small floating chip near the cursor** — it's cheap, uses
the toast/inspector visual language, and removes the "drag blind, look away to the Project tab to
confirm" round-trip. Implemented: a magenta `.drag-readout` chip that follows the pointer showing
`L 80 · R 80 · V 60` in margin mode or `pos 960, 540` in pinned mode. It only exists during drag.
- **a. Near cursor** (chosen) over **b. on box edges** — edge labels fight the 8 handles in a small
  preview; a single cursor-anchored chip is calmer and always legible.

## 3. Snapping — **confirm (free drag), with a documented upgrade path**
Confirmed for v1: **free dragging, no snap**, matching the cue-timeline precedent. If it later feels
imprecise, the on-brand upgrade is **soft magnetic guides** (canvas center + safe-margin lines that
appear only while dragging, in `--cyan` like the playhead) with **Alt to disable** — not hard
grid snapping. Not built in v1.

## 4. Export menu surface — **confirm popover; adjust the .ass row**
Confirmed: clicking **Export** opens a compact **anchored popover** (not a centered modal) with one
surface, two actions. Implemented `.exp-pop` anchored under the button, top-right.
- **a. Anchored popover** (chosen) over centered modal — burn/download is a quick action, not a
  focused task like "create project"; anchoring keeps context. (The create dialog stays a modal.)
- **b. Hierarchy.** Primary = **Burn video** (gradient CTA) with an **Output filename** field +
  optional **Input video** path (labeled "same-host · defaults to project video"). **Download .ass**
  is a **secondary row** below a divider (icon + title + "Subtitle file only — no render"). I kept it
  a row, **not** a co-equal split button: burning is the 95% action; a split button would over-weight
  the .ass path and crowd the primary. The row is clearly tappable and self-explained.
- **c. Progress.** **Keep the bottom toast bar** (confirmed). The popover closes on Burn and the
  existing toast reports `Burning → … · 0%` → `Burned → …`. Don't trap progress inside a popover the
  user will dismiss.

## 5. Global fade defaults — **adjust placement → its own persistent inspector panel**
Engineer put them inside the fade panel below the per-group rows. Problem: that panel only appears
when a fade group is selected, so the project-wide defaults would be unreachable most of the time.
- **a. Where.** I made **Fade defaults** a **dedicated, always-visible panel in the Inspector**
  (same `.fg-panel` family as the per-group fade editor, so the inheritance relationship still
  reads), titled "Fade defaults · project-wide · global", with three `.pv-step` steppers
  (`fade-in ms`, `fade-out ms`, `linger s`). It sits with the other inspector panels rather than the
  Project tab, because it's a *timing* default that pairs conceptually with the per-group fade rows
  (the "(global)" source tag in those rows points right at it). This satisfies the spirit of the
  engineer's grouping while keeping it reachable.
- **b. Separation.** A titled panel with the `project-wide · global` hint is enough; a bare divider
  inside the transient fade panel wasn't, which is why it became its own panel.

## 6. Project tab after wiring — **confirm, with answers**
Implemented: real **Lyrics**/**Video** names (Video shows `—` when absent), **Alignment** is a real
control, group-by row removed, a one-line note under the `\pos` toggle.
- **a. Group-by row — drop it** (confirmed). It's an import-time choice, not an editing control; a
  permanent row implies it's re-runnable. If provenance matters, surface "imported by: section" as a
  tiny caption on the **Project Library** card, not a control in the editor.
- **b. The note under the toggle — keep it inline** (not a tooltip). It's one short line and it
  *changes with state* ("Pin coordinate comes from dragging the preview box." vs "Margins come from
  dragging the preview box edges."), which teaches the drag-box link better than a hover-only tip.
- **Bonus:** Alignment is a **3×3 numpad grid popover** (the 9 ASS anchors laid out spatially) rather
  than a flat dropdown — it maps directly to the subtitle anchor model and is faster to read/pick.
  Falls back conceptually to a labeled select (`Bottom-Center (2)`).

---

### Summary of what changed in the kit
- **stage.jsx** — functional placement box (margin + pinned modes, 8 resize handles, Esc-cancel,
  border-brighten + stage-dim while dragging), cursor-following live readout, and the Export popover.
- **panels.jsx** — Project tab rewired: real source names, 3×3 alignment grid, `\pos` toggle + state
  note, group-by removed, presets disabled w/ "Coming soon".
- **app.jsx** — `setPlacement` / `setFadeDefaults` / export (burn + download) handlers on the shared
  undo timeline; persistent `FadeDefaultsPanel` in the Inspector.
- **theme.css** — all of the above, from existing tokens. (One gotcha fixed: entrance animations must
  rest at `opacity:1` and animate transform only — an inactive preview iframe pauses keyframes on
  frame 0, which would otherwise leave the popover invisible.)
