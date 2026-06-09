# Timeline density rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the zip-15 timeline rework — 3-stop density toggle (Compact·Coherent·Lanes) + group-coherent packing + constant-height animation bars + expand-to-overlay accordion + H/V zoom, in a vertically/horizontally scrollable timeline that FLIP-animates between density stops and pins the selected cue.

**Architecture:** A new **pure** packing module (`trackPack.ts`) feeds row assignments to `WordTrack`; `animStrips.ts` switches from slot-divided bands to constant-height bars + an overflow descriptor; `WordTrack` renders rows of 55px card blocks inside a scroller, with the density control + zoom sliders driven by Editor state. No engine/daemon changes — drag/retime/anim dispatch payloads are unchanged.

**Tech Stack:** React 18 + TS, Vitest/jsdom, Playwright e2e, CSS in `theme.css`. Spec: `docs/superpowers/specs/2026-06-09-timeline-density-rework-design.md`. Prototype reference (archived): `docs/superpowers/zip15-decisions/resources/{Timeline-View-Toggle,Track-Packing-Study,Strips-Refined}.html`.

**House rules:** engine/daemon code is TDD-first (this plan is web-only, but new pure modules are TDD-first too). Commit only the listed files per task (never `git add -A`). Run `cd web` for npm/vitest/playwright.

---

## Phase 1 — `trackPack.ts` (pure packer, TDD-first)

### Task 1: Packing module + unit tests

**Files:**
- Create: `web/src/model/trackPack.ts`
- Test: `web/src/model/trackPack.test.ts`

- [ ] **Step 1: Write the failing test** — `web/src/model/trackPack.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { packTimeline, type PackItem } from "./trackPack";

// helper: build items; key defaults to `${gi}-${s}`
const I = (gi: number, s: number, e: number, key = `${gi}-${s}`): PackItem => ({ key, gi, s, e });
const rowOfItem = (r: ReturnType<typeof packTimeline>, key: string) => r.rowOf.get(key);

describe("trackPack", () => {
  it("lanes — one row per gi, ordered by gi", () => {
    const r = packTimeline([I(2, 0, 1), I(0, 0, 1), I(0, 2, 3)], "lanes");
    expect(r.rows.length).toBe(2);
    expect(r.rows[0].every((it) => it.gi === 0)).toBe(true); // gi 0 first
    expect(r.rows[1].every((it) => it.gi === 2)).toBe(true);
    expect(rowOfItem(r, "0-2")).toBe(0); // both gi-0 items share a row
  });

  it("coherent — non-overlapping groups merge onto one row", () => {
    // group 0 spans [0,1], group 1 spans [2,3] — disjoint → share row 0
    const r = packTimeline([I(0, 0, 1), I(1, 2, 3)], "coherent");
    expect(r.rows.length).toBe(1);
  });

  it("coherent — overlapping groups go to separate rows; a group is never split", () => {
    // group 0: [0,1]+[1.5,3] (span [0,3]); group 1: [0.5,2] overlaps group 0
    const r = packTimeline([I(0, 0, 1, "a"), I(0, 1.5, 3, "b"), I(1, 0.5, 2, "c")], "coherent");
    expect(r.rows.length).toBe(2);
    expect(rowOfItem(r, "a")).toBe(rowOfItem(r, "b")); // group 0 stays together
    expect(rowOfItem(r, "c")).not.toBe(rowOfItem(r, "a"));
  });

  it("compact — overlapping items of one group scatter across rows", () => {
    const r = packTimeline([I(0, 0, 2, "a"), I(0, 1, 3, "b")], "compact"); // overlap
    expect(r.rows.length).toBe(2);
    expect(rowOfItem(r, "a")).not.toBe(rowOfItem(r, "b"));
  });

  it("touching endpoints do NOT overlap (epsilon) — they share a row", () => {
    const r = packTimeline([I(0, 0, 1, "a"), I(1, 1, 2, "b")], "compact"); // a.e == b.s
    expect(r.rows.length).toBe(1);
  });

  it("compact orders by start and first-fits (fewest non-colliding rows)", () => {
    // three sequential cues → one row
    const r = packTimeline([I(0, 0, 1), I(1, 1.1, 2), I(2, 2.1, 3)], "compact");
    expect(r.rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run it; verify failure**

Run: `cd web && npx vitest run src/model/trackPack.test.ts`
Expected: FAIL — `Cannot find module './trackPack'`.

- [ ] **Step 3: Implement `web/src/model/trackPack.ts`**

```ts
// trackPack.ts — pure row-packing for the timeline density toggle.
// lanes: one row per group · coherent: each group on one row, non-overlapping
// groups share · compact: greedy first-fit at the token level (groups may scatter).
// Overlap is strict + epsilon-guarded: touching endpoints (a.e == b.s) do NOT overlap.

export type Density = "compact" | "coherent" | "lanes";

export interface PackItem { key: string; gi: number; s: number; e: number; }
export interface PackResult { rows: PackItem[][]; rowOf: Map<string, number>; }

const EPS = 1e-6;
const overlaps = (aS: number, aE: number, bS: number, bE: number) =>
  aS < bE - EPS && bS < aE - EPS;

function build(rows: PackItem[][]): PackResult {
  const rowOf = new Map<string, number>();
  rows.forEach((row, r) => row.forEach((it) => rowOf.set(it.key, r)));
  return { rows, rowOf };
}

function byGroup(items: PackItem[]): Map<number, PackItem[]> {
  const m = new Map<number, PackItem[]>();
  for (const it of items) (m.get(it.gi) ?? m.set(it.gi, []).get(it.gi)!).push(it);
  return m;
}

function packLanes(items: PackItem[]): PackResult {
  const g = byGroup(items);
  const gis = [...g.keys()].sort((a, b) => a - b);
  return build(gis.map((gi) => g.get(gi)!));
}

function packCompact(items: PackItem[]): PackResult {
  const order = [...items].sort((a, b) => a.s - b.s || a.e - b.e);
  const rows: PackItem[][] = [];
  const ends: number[] = [];
  for (const it of order) {
    let r = ends.findIndex((end) => it.s >= end - EPS);
    if (r === -1) { r = ends.length; ends.push(0); rows.push([]); }
    ends[r] = it.e + 0.04; // anti-touch pad
    rows[r].push(it);
  }
  return build(rows);
}

function packCoherent(items: PackItem[]): PackResult {
  const g = byGroup(items);
  const groups = [...g.entries()]
    .map(([gi, its]) => ({ gi, its, first: Math.min(...its.map((i) => i.s)) }))
    .sort((a, b) => a.first - b.first || a.gi - b.gi);
  const rows: PackItem[][] = [];
  for (const grp of groups) {
    let target = rows.findIndex(
      (row) => !grp.its.some((it) => row.some((ri) => overlaps(it.s, it.e, ri.s, ri.e))),
    );
    if (target === -1) { target = rows.length; rows.push([]); }
    rows[target].push(...grp.its);
  }
  return build(rows);
}

export function packTimeline(items: PackItem[], density: Density): PackResult {
  if (density === "lanes") return packLanes(items);
  if (density === "compact") return packCompact(items);
  return packCoherent(items);
}
```

- [ ] **Step 4: Run; verify pass**

Run: `cd web && npx vitest run src/model/trackPack.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/model/trackPack.ts web/src/model/trackPack.test.ts
git commit -m "feat(timeline): pure trackPack row packer (compact/coherent/lanes) — TDD"
```

---

## Phase 2 — constant-height animation strips

### Task 2: `animStrips.ts` → constant bars + overflow descriptor

> **CORRECTION (sequencing, applied during execution):** Phase 2 is **ADDITIVE** so the build stays
> green. Add a NEW pure `layoutBars(anims, cueStartS, pxPerSec)` + the constants + `barFill` gradients +
> a new `animStrips.test.ts`, **without modifying** the existing `layoutStrips`/`StripLayout`/`MAX_BARS`
> that `WordTrack.tsx` still imports. **Do NOT touch `WordTrack.tsx` or the AT-* tests in Phase 2.**
> Phase 3 switches WordTrack to `layoutBars`, deletes the old `layoutStrips`, and updates AT-03/04/05/07.
> (Step 5 below — "update existing strip tests" — moves to Phase 3.)

**Files:**
- Modify: `web/src/model/animStrips.ts` (constants `18`/`19`; `layoutStrips` `94-146`)
- Test: `web/src/model/animStrips.test.ts` (create)
- Reference: `Strips-Refined.html` `renderA`/`barsHTML`/`stripBg` for the per-type gradients + values.

- [ ] **Step 1: Write the failing test** — `web/src/model/animStrips.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { layoutStrips, BLOCK_H, MAX_VISIBLE, BAR_H, TEXT_H, GAP, TINY_PX } from "./animStrips";
import type { ResolvedAnim } from "../types";

const A = (channel: string, t0: number, t1: number): ResolvedAnim =>
  ({ channel, segments: [{ t0, t1 }] } as unknown as ResolvedAnim);

describe("animStrips constant-height", () => {
  it("BLOCK_H is the constant card height (55)", () => {
    expect(BLOCK_H).toBe(TEXT_H + MAX_VISIBLE * BAR_H + (MAX_VISIBLE - 1) * GAP + 7); // 55
  });

  it("bars get constant px tops (TEXT_H + i*(BAR_H+GAP)) and height BAR_H", () => {
    const r = layoutStrips([A("primary", 0, 0.5), A("alpha", 0, 0.5)], 0, 100);
    const bars = r.strips.filter((s) => s.kind === "bar" || s.kind === "glyph");
    expect(bars[0].topPx).toBe(TEXT_H);                 // 22
    expect(bars[1].topPx).toBe(TEXT_H + (BAR_H + GAP)); // 32
    expect(bars[0].heightPx).toBe(BAR_H);               // 6 (no slot division)
  });

  it("≤3 anims → no overflow; >3 → overflowCount, no sliver strip", () => {
    const three = layoutStrips([A("primary",0,1),A("alpha",0,1),A("size",0,1)], 0, 100);
    expect(three.overflowCount).toBe(0);
    expect(three.strips.some((s) => s.kind === "overflow")).toBe(false);
    const five = layoutStrips([A("primary",0,1),A("alpha",0,1),A("size",0,1),A("move",0,1),A("glow",0,1)], 0, 100);
    expect(five.overflowCount).toBe(2);                 // 5 - 3
    expect(five.strips.filter((s) => s.kind === "bar" || s.kind === "glyph").length).toBe(MAX_VISIBLE);
    expect(five.strips.some((s) => s.kind === "overflow")).toBe(false); // disc is component-level now
  });

  it("width < TINY_PX → glyph kind", () => {
    const r = layoutStrips([A("primary", 0, 0.1)], 0, 100); // 0.1s * 100 = 10px < 18
    expect(r.strips[0].kind).toBe("glyph");
  });

  it("does not grow the block — no cueHeight beyond BLOCK_H", () => {
    const r = layoutStrips([A("primary",0,1),A("alpha",0,1),A("size",0,1),A("move",0,1)], 0, 100);
    expect(r.blockHeight ?? BLOCK_H).toBe(BLOCK_H);
  });
});
```

- [ ] **Step 2: Run; verify failure** — `cd web && npx vitest run src/model/animStrips.test.ts` → FAIL (exports/shape missing).

- [ ] **Step 3: Refactor `animStrips.ts`**
  - Add exports: `export const TEXT_H = 22, BAR_H = 6, GAP = 4, PAD_B = 7, MAX_VISIBLE = 3, TINY_PX = 18; export const BLOCK_H = TEXT_H + MAX_VISIBLE*BAR_H + (MAX_VISIBLE-1)*GAP + PAD_B;` Keep `MAX_BARS` as an alias of `MAX_VISIBLE` only if other modules import it (grep; else remove).
  - `StripLayout`: replace the `%`-based `top`/`height` with `topPx: number` and `heightPx: number`; keep `left`/`width` (px), `kind` (`"bar" | "glyph"`), `vt`, `src`, `warning`. Remove the `"overflow"` and `"collapse"` kinds and the `stripes`/`count`/`cueHeight` fields (overlay is component-level now).
  - `layoutStrips(anims, cueStartS, pxPerSec)`: render **all** anims' geometry but mark only the first `MAX_VISIBLE` as shown bars; `topPx = TEXT_H + i*(BAR_H+GAP)`, `heightPx = BAR_H`; `kind = (width < TINY_PX) ? "glyph" : "bar"`; return `{ strips, overflowCount: Math.max(0, anims.length - MAX_VISIBLE), fullCount: anims.length }`. No band/slot math, no sliver, no `cueHeight`.
  - Add a `barFill(anim, groupColor)` (port `stripBg` from `Strips-Refined.html`: per-type gradients; `size` adds the triangle `clip-path`); keep `stripStyle` as the wrapper or fold in. `typeForChannel`/`typeColor`/`typeGlyph`/`animColMarker` signatures unchanged.

- [ ] **Step 4: Run; verify pass** — `cd web && npx vitest run src/model/animStrips.test.ts` → PASS.

- [ ] **Step 5: Update existing strip tests that asserted the old model**
  - `web/src/components/stage/WordTrack.anim.audit.test.tsx`: AT-03 (cap 3 — keep), AT-04 (was "2 bars + `+2` chip" → now 3 bars + a component disc; assert `overflowCount`/disc, not a sliver strip), AT-05 (inline-expand `block.style.height="67px"` → REMOVE/replace: block stays `BLOCK_H`; expansion is the overlay in Phase 5 — mark AT-05/AT-06 as `it.todo` here with a comment pointing to Phase 5, or delete and re-add in Phase 5), AT-07 (glyph threshold: `MIN_PX=26`→`TINY_PX=18`). Update assertions to the new px-top model.
  - Run `cd web && npx vitest run src/components/stage/WordTrack.anim.audit.test.tsx` until green.

- [ ] **Step 6: Commit**

```bash
git add web/src/model/animStrips.ts web/src/model/animStrips.test.ts web/src/components/stage/WordTrack.anim.audit.test.tsx
git commit -m "feat(timeline): constant-height animation bars (drop slot-divided band + +N sliver)"
```

---

## Phase 3 — card block + packed rows + scroller (default Coherent)

### Task 3: WordTrack renders packed rows of 55px card blocks in a scroller

**Files:**
- Modify: `web/src/theme.css` (timeline block/row/scroller styles)
- Modify: `web/src/components/stage/WordTrack.tsx` (`122`, `568-710`)
- Modify: `web/src/components/Editor.tsx` (pass `density="coherent"` constant for now)
- Test: `web/src/components/stage/WordTrack*.test.tsx`, `web/e2e/dock.spec.ts`
- Reference: `Timeline-View-Toggle.html` `render()` + the `.band/.cue/.cue-t/.astrip/.gutter-col/.glabel` CSS.

- [ ] **Step 1: CSS** — add to `web/src/theme.css` (values from spec §4 / prototype): `.wt-scroller { overflow:auto; max-height: <fit dock>; position:relative }`, sticky `.wt-ruler`, `.wt-row { position:relative; height: var(--row-h) }`, `.wt-block { position:absolute; height:55px; border-radius:8px; ... }` with `.blk-title { height:22px; font:600 12.5px display; ellipsis }`, `.wt-block .astrip { position:absolute; height:6px; border-radius:3px }`, `.wt-block.glyph-chip`, the Lanes `.wt-gutter`/`.glabel`/`.gdot`, and the density `.seg`/`.seg button.on`. Keep existing `.wt-playhead`/`.snap-guide`. (Port colors/dims verbatim from the prototype `<style>`.)

- [ ] **Step 2: WordTrack — build `PackItem[]` and render rows**
  - Add prop `density: Density` (import from `model/trackPack`). Build `items = words.map(w => ({ key: String(w.wid), gi: w.gi, s: previewStart(w), e: previewEnd(w) }))` and `const pack = packTimeline(items, density)`.
  - Replace the `lanes.map` event loop (`568-678`) with `pack.rows.map((row, r) => <div className="wt-row">...)`. For each item in the row, render a `.wt-block` card positioned `left%/width%` by time (reuse `582-583` math), `background: colorForIndex(it.gi)` tint, containing `.blk-title` (cue text; merged cues keep `.blk-seg` inside the title band) + the bars from `layoutStrips` (now px tops). Block height `BLOCK_H`.
  - **Lanes mode**: when `density==="lanes"`, render the left `.wt-gutter` + `.glabel` per row (one group/row) as today; Compact/Coherent collapse the gutter (no labels).
  - **Scroller**: wrap rows in `.wt-scroller`; render the ruler sticky; the playhead/guides span the scroll content (keep the gutter-offset left math, but gutter width is 0 in compact/coherent).
  - **Preserve**: measure `pxPerSec` from a stable full-width element (a `.wt-rowarea` ref that always spans the timeline width) instead of "first lane"; keep `handleBlockPointerDown`/`startDrag`/`startAnimDrag`/snap/the `unlocked` gate and all dispatch payloads. The block's data attrs (`data-wid`, handle spans) stay so drag/anim tests keep resolving tokens.

- [ ] **Step 3: Editor** — pass `density="coherent"` (literal for now; state arrives in Phase 4). Keep all other props.

- [ ] **Step 4: Update tests**
  - `WordTrack.test.tsx`, `WordTrack.drag.test.tsx`, `WordTrack.snap.test.tsx`, `WordTrack.audit.test.tsx`: adjust selectors from `.wt-lane`/`.wt-area` to `.wt-row`/`.wt-block`; the drag math (px↔sec) and dispatch assertions must remain identical. Confirm `pxPerSec` still derives correctly (mock area width as today).
  - `WordTrack.strips.snap.test.tsx`, `WordTrack.anim.audit.test.tsx`: bar geometry now px-top; update accordingly (AT-01/AT-02 left/width unchanged).
  - `web/e2e/dock.spec.ts` G-14b: today asserts two cues share a row by absolute position. Under default Coherent two non-overlapping cues of different groups may now share OR be on adjacent rows depending on overlap — re-express G-14b as "in Coherent, two non-overlapping groups pack onto one row (|Δy|<3)" and add a sibling assertion that an overlapping pair lands on different rows. Keep G-15/G-16 drag specs (selectors updated).
  - Run `cd web && npx vitest run` until green.

- [ ] **Step 5: Commit**

```bash
git add web/src/theme.css web/src/components/stage/WordTrack.tsx web/src/components/Editor.tsx \
        web/src/components/stage/WordTrack.test.tsx web/src/components/stage/WordTrack.drag.test.tsx \
        web/src/components/stage/WordTrack.snap.test.tsx web/src/components/stage/WordTrack.audit.test.tsx \
        web/src/components/stage/WordTrack.strips.snap.test.tsx web/src/components/stage/WordTrack.anim.audit.test.tsx \
        web/e2e/dock.spec.ts
git commit -m "feat(timeline): packed rows of constant-height card blocks in a scroller (default Coherent)"
```

---

## Phase 4 — density toggle + zoom + FLIP + selected-cue pin

### Task 4: density/zoom controls, Editor state, FLIP transition, anchors

**Files:**
- Modify: `web/src/components/Editor.tsx` (state + persistence + control)
- Modify: `web/src/components/stage/WordTrack.tsx` (FLIP, scroller anchors, zoom)
- Modify: `web/src/model/snap.ts` (wire the existing `zoomAnchorScroll`)
- Test: new `web/src/components/stage/WordTrack.density.test.tsx`; `web/e2e/dock.spec.ts`
- Reference: `Timeline-View-Toggle.html` `setMode`/`captureFlip`/`playFlip`/`captureV`/`restoreV`/`pps`.

- [ ] **Step 1: Editor state + persistence** — add `density` (`"coherent"` default, persist `kss.tlDensity`), `hz` (1, `kss.tlHz`), `vz` (1, `kss.tlVz`) mirroring the `magnet` persistence pattern (`Editor.tsx:82-91`). Pass `density`, `pxPerSecOverride = BASE_PPS*hz`, and a `vz`-derived `rowH` to WordTrack.

- [ ] **Step 2: Controls** — in the timeline toolbar (`.tl-toolrow`), render the 3-stop `.seg` (Compact ☷ / Coherent ☲ / Lanes ☰, `.on`=accent, `onClick`→`setDensity`) + two `<input type="range">` zoom sliders (H 0.6–3 step .05, V 0.8–2 step .05). Wire to Editor setters.

- [ ] **Step 3: FLIP + pin in WordTrack** — on `density` change: `captureFlip()` (rect of every `[data-flip]` block + ruler + playhead) → React re-renders new rows → in a `useLayoutEffect` keyed on `density`, compute dx/dy, invert (`transform`, `transition:none`), then double-rAF play (`transform:translate(0,0)`, `transition: transform .38s var(--ease-out)`), cleanup at 460ms. Skip under `prefers-reduced-motion`. Before re-layout capture the selected block's top-within-scroller; after, set `scroller.scrollTop += (now - before)` to pin it.

- [ ] **Step 4: Zoom anchoring** — H-zoom: on `hz` change keep the playhead x fixed via `zoomAnchorScroll` (`snap.ts:138`, currently unused — wire `scrollLeft = t*pps() - preX`). V-zoom: row height = `round(max(BLOCK_H+10, 50*vz))`; reuse the captureV/restoreV vertical anchor.

- [ ] **Step 5: Tests** — `WordTrack.density.test.tsx`: rendering with `density="compact|coherent|lanes"` yields the expected row counts for a crafted `words`/`events` fixture (assert `.wt-row` count; reuse trackPack expectations); the density control click calls `setDensity`; persistence read/write. e2e `dock.spec.ts`: clicking Lanes increases `.wt-row` count vs Coherent; the selected cue stays in view across a toggle (its bounding box y within tolerance). jsdom can't measure FLIP — assert state/markup, not pixels.
  - Run `cd web && npx vitest run` green; `xvfb-run -a npx playwright test dock.spec.ts` green.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/Editor.tsx web/src/components/stage/WordTrack.tsx web/src/model/snap.ts \
        web/src/components/stage/WordTrack.density.test.tsx web/e2e/dock.spec.ts
git commit -m "feat(timeline): density toggle + H/V zoom + FLIP transition + selected-cue pin"
```

---

## Phase 5 — expand-to-overlay accordion (replaces +N sliver)

### Task 5: floating full-height overlay with cyan marker; accordion dismissal

**Files:**
- Modify: `web/src/components/stage/WordTrack.tsx` (disc + overlay)
- Modify: `web/src/components/Editor.tsx` (`expandedCues:Set` → `expandedCue:number|null`)
- Modify: `web/src/theme.css` (`.wt-block.overlay` + `::after` cyan marker, `.disc`)
- Test: `web/src/components/stage/WordTrack.anim.audit.test.tsx` (restore AT-05/AT-06), new overlay test; `web/e2e/animations.spec.ts`
- Reference: `Strips-Refined.html` `renderA` overlay branch + `.cue.overlay`/`.cue.overlay::after`/`.disc` CSS.

- [ ] **Step 1: State contract** — in Editor replace `expandedCues: Set<number>` + `onExpandOverflow`/`onCollapseOverflow` with `expandedCue: number | null` + `onToggleOverflow(wid: number)` (accordion: set to wid, or null if same). Add a document click-away (outside `.wt-scroller`) + Esc handler that clears it (mirror the prototype; Esc may need to coexist with the existing anim-focus Esc — clear overflow first, then fall through).

- [ ] **Step 2: Disc + overlay in WordTrack** — when a block's `overflowCount>0`, render the `.disc` (`＋N`, or `－` when open) with `stopPropagation`. When `expandedCue===wid`, render a floating `.wt-block.overlay` copy at the same `left`/`width`, height `fullBlockH(fullCount)`, `z-index:25`, containing the title + **all** bars (call `layoutStrips` without the `MAX_VISIBLE` cap, or a `{ all:true }` flag), plus the cyan `::after` marker (`height:BLOCK_H` via `--baseh`, `border-bottom:none`). Ensure the overlay isn't clipped — render it in an overlay layer above `.wt-scroller` (portal or a sibling positioned by the block's measured rect) so a row's `overflow` doesn't cut it.

- [ ] **Step 3: CSS** — `.wt-block.overlay { z-index:25; box-shadow:0 14px 34px rgba(0,0,0,.55); }` and `.wt-block.overlay::after { content:""; position:absolute; inset:0 0 auto 0; height:var(--baseh); border:1px solid color-mix(in srgb,var(--cyan) 28%,transparent); border-bottom:none; border-radius:8px 8px 0 0; pointer-events:none; }`; `.disc` pill per prototype (`top:4px;right:6px;h:16px`, cyan on open).

- [ ] **Step 4: Tests** — restore AT-05 (disc `＋N` opens overlay with all bars; lane/row height unchanged) and AT-06 (clicking `－`/Esc/click-away closes; accordion: opening another closes the first). New: overlay carries the cyan marker element; overlay bars count == fullCount. e2e `animations.spec.ts`: a cue with >3 anims shows `＋N`; clicking opens `.wt-block.overlay`; Esc closes.
  - Run `cd web && npx vitest run` green; `xvfb-run -a npx playwright test animations.spec.ts dock.spec.ts` green.

- [ ] **Step 5: Full verification + commit**
  - `cd web && npx tsc --noEmit` clean; `npx vitest run` all green; `xvfb-run -a npx playwright test` full suite green; Python unaffected (no backend change) but run `for f in test_daemon test_daemon_projects; do .venv/bin/python tests/$f.py; done` as a sanity check.

```bash
git add web/src/components/stage/WordTrack.tsx web/src/components/Editor.tsx web/src/theme.css \
        web/src/components/stage/WordTrack.anim.audit.test.tsx web/e2e/animations.spec.ts
git commit -m "feat(timeline): expand-to-overlay accordion overflow (replaces +N sliver)"
```

---

## Self-review notes (carried into execution)
- **Spec coverage:** §1 density toggle → Ph4; §2 packing → Ph1; §3 constant bars → Ph2; §4 overlay → Ph5; §3.5 zoom → Ph4; §5/§6/§7 no code. ✓
- **Type consistency:** `Density` defined once in `trackPack.ts`, imported by WordTrack/Editor. `PackItem.key = String(wid)`. `StripLayout` px fields (`topPx`/`heightPx`) used identically in `animStrips.ts` and WordTrack. `overflowCount`/`fullCount` named consistently across Ph2/Ph5.
- **Risk seams (watch during execution):** the px↔seconds drag mapping must survive the row rework (Ph3 Step 2); the overlay must escape row clipping (Ph5 Step 2); G-14b semantics change with packing (Ph3 Step 4); FLIP must not fight pointer hit-testing during a drag (Ph4 Step 3 — only animate on density change, never mid-drag).
- **No engine/daemon changes** anywhere; dispatch payloads (`set_word_times`, `set_animation_props`, `MIN_ANIM_MS=50`) unchanged — AT-10/AP-5 stay green.
