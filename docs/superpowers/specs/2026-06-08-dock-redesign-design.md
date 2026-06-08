# Dock Cue-Lanes Redesign + UX Corrections — Design

**Date:** 2026-06-08
**Branch:** `feat/dock-redesign` (stacks on `feat/electron-shell`)
**Source:** designer sync zip 11 — `export/product-sync/SYNC.md` (+ `changed/*.jsx` kit reference).
**Status:** approved direction (designer handoff + 2 product decisions) → implementation plan next.

## Goal

Port the designer's dock + inspector redesign into the shipped web product (`web/src/**`):
replace the privileged 4-column fade-lane dock with `LAYOUT(text·start·end) + one general
ANIMATION lane` (fades become ordinary chips), add a start/end **spill** indicator, and apply five
UX corrections (distinct timeline selection, empty-space deselect, double-click view-flip + reveal,
collapsible waterfall tiers, header=collapse-only). Behavior/visual contract only — the kit is
window-scoped JSX; we port intent, not literal code.

## Product decisions (this branch)

- **Spill is computed web-side** from the already-exposed per-token `anims_resolved` (no engine/daemon
  change). `anims_resolved` is the engine's *effective* list (inheritance + suppression + conflict
  already applied via `resolve_animations`), with resolved `segments[].start_s/end_s` — so the web
  needs only `min(start_s)/max(end_s)` vs the cue's word-atom window. (Simpler than the kit's
  `cueExtent`, which recomputed anchor times.)
- **AnimSection is left as-is** — only `StyleWaterfall` gets chevron whole-tier collapse; AnimSection
  keeps its existing "Inherited (n)" disclosure.

## Current-state gap (from recon)

- `CueLanes.tsx`: 4 columns (LAYOUT/FADE-IN/FADE-OUT/ANIMATION) with `FadeCell`/`AnimCell`; rows keyed
  by `{li,ti}`; selection passed as position (good). No column resize. `model/animRows.ts` already
  exports `cueRows()` → per-cue rows with `kind` (own/inherited/tombstone) + `src` (global/group/tag)
  + `channel` — the chip data is ready.
- `anims_resolved` (`types.ts` `ResolvedAnim.segments[].{start_s,end_s}`) exposed per token already.
- `StyleWaterfall.tsx`: 3 tiers each with `onSelect`→`onSelectTier(scope)` + `.sel` ring; no collapse.
- `Editor.tsx`: `sel={scope,gi,tok}` + `selectedWords`; `clearSelection()`; **Esc clears** already;
  **no empty-space-click clear**; dock tabs `dockTab: "timeline"|"lanes"`; no double-click flip/reveal.
  Persists panes via `localStorage["kss.railW"|"kss.dockH"|"kss.magnet"]`.
- `WordTrack.tsx`: block `.sel` class (weak); **no `has-sel` recede**; fade marks already absent;
  **no block double-click**.

## What to build

### 1. Cue-lanes redesign → `CueLanes.tsx` (+ `theme`/CSS)
`LAYOUT · text | start | end | ANIMATION` via a CSS-var grid template (`--lane-cols`) shared by header
+ rows. Drop the two FADE columns and `FadeCell`. **text** unchanged. **start/end** show the cue's
structural window (word-atom min start / max end), neutral, plus the spill marker. **ANIMATION** = one
lane of channel-colored chips from `cueRows()`: own → solid channel tint; inherited → grey + `grp`/
`glob` tag; suppressed → struck/dashed; multi-channel preset → one lead chip (group_id dedupe — already
done in `cueRows`). Timing read-outs do NOT belong in the lanes (that's the Timeline tab's job).

### 2. Spill indicator → new `web/src/model/spill.ts` + CueLanes start/end cells
`cueExtent(words, animsResolved)` → `{ s, e, animStart, animEnd, spillBefore, spillAfter, beforeDelta,
afterDelta }` where `s=min(word.start)`, `e=max(word.end)`, `animStart=min(start_s)` /
`animEnd=max(end_s)` over all segments of `animsResolved` (empty → no spill), `eps=1e-4`. Cells: neutral
structural time always; when `spillBefore`/`spillAfter`, an **outward cyan caret** (`‹` start / `›` end)
+ delta (`−0.15`/`+0.30`) + a cyan bleed-tick on the outer edge. **Only outward spill is flagged**
(in-window anims like a fade-in get no marker).

### 3. Resizable columns → CueLanes + CSS
Three header `.col-grip` drag handles resize text/start/end (px, min 64); ANIMATION flexes
(`minmax(150px,1.4fr)`). Header+rows share `--lane-cols`. Double-click a grip resets that column.
Persist to `localStorage["kss.laneCols"]` following the existing `kss.*` pane pattern.

### 4. Distinct timeline selection → `WordTrack.tsx` + CSS
`.block.sel`: white inner ring → accent outer ring → glow, `translateY(-2px) scale(1.015)`, bold label,
raised z-index. When any block is selected, add `has-sel` on the track wrapper and recede others
(`.track.has-sel .block:not(.sel):not(.multi):not(.live){opacity:.4;filter:saturate(.7)}`); the `.live`
block stays full-strength.

### 5. Deselect (empty-space click) → `Editor.tsx` (+ track/lanes click handlers)
Esc already clears (keep; it's ignored while typing/dragging). Add: clicking empty space clears — the
timeline **track** bg, empty **lanes** area, **dock-body** bg. Do NOT clear on cue elements
(`.block,.lane-row,.lane-evt`), grips, or scrub/controls (`.ruler,.wave,.tl-toolrow,.playhead,button,
input,a`). Cleared = `clearSelection()` (existing).

### 6. Double-click cue → flip view + reveal → `Editor.tsx`, `WordTrack.tsx`, `CueLanes.tsx`
Double-click a lanes **row** → Timeline tab, cue selected. Double-click a timeline **block** → Cue-lanes
tab, cue selected, group auto-expanded. After the flip, scroll the selected cue into view in the dock
scroller via `scrollTop/scrollLeft` math — **never `scrollIntoView`** — with a `requestAnimationFrame`
retry-until-painted (the flipped/expanded view paints a frame or two later).

### 7. Waterfall tiers: collapse + header=collapse-only → `StyleWaterfall.tsx` (+ CSS)
Each tier (CUE/GROUP/GLOBAL) gets a chevron; clicking the **header** toggles collapse of that tier's
rows. Persist to `localStorage["kss.wfCollapsed"]`. **Remove** the old header `onSelect`→`onSelectTier`
scope-change AND the per-tier `.sel` ring entirely (header click = collapse only). The CUE tier already
names the cue via its badge; real selection lives in lanes/timeline. `onSelectTier` becomes dead → remove
its prop threading if unused elsewhere.

## Testing

- **`web/src/model/spill.test.ts`** (vitest): no anims → no spill; fade-out at `cue_end+`/segment
  `end_s>e` → `spillAfter`, `afterDelta`>0; flash before start → `spillBefore`; in-window anim (start_s>s,
  end_s<e) → neither; multi-anim → min/max across all.
- **`CueLanes.audit`/`.test`**: renders text/start/end/ANIMATION (no FADE columns); a fade chip + a
  sweep chip coexist; inherited chip shows `grp`/`glob`; suppressed chip struck; spill caret+delta shows
  on outward spill, hidden in-window; column-grip drag changes `--lane-cols` and persists; row
  double-click fires `onCueOpen`.
- **`StyleWaterfall` tests**: header click toggles collapse (rows hidden) + persists; NO scope change on
  header click; no `.sel` ring on any tier.
- **`Editor` tests**: empty-space click on dock-body/track/lanes clears selection; click on a `.block`/
  grip/`.ruler` does NOT; double-click flip switches tab + keeps cue selected (reveal mocked).
- **`WordTrack` tests**: selected block has `.sel`; track gets `has-sel` when a block is selected.
- Existing daemon/e2e/Tk suites unaffected (no engine/daemon change). Web e2e: add a dock-redesign spec
  if cheap, else cover via vitest.

## Files

New: `web/src/model/spill.ts` (+ `.test.ts`).
Modified: `web/src/components/panels/CueLanes.tsx` (+ tests), `web/src/components/panels/StyleWaterfall.tsx`
(+ tests), `web/src/components/Editor.tsx` (+ tests), `web/src/components/stage/WordTrack.tsx` (+ tests),
the web CSS/theme file(s) backing `.lanes`/`.tier3`/`.block`, and removal of the now-dead `FadeCell` +
`onSelectTier` plumbing.

## Non-goals

No engine/daemon change (spill is web-side). AnimSection untouched. Legacy fade model already removed on
`feat/rtl` (no action). No new persistence mechanism — reuse `localStorage["kss.*"]`.
