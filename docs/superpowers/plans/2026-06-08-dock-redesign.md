# Dock Cue-Lanes Redesign + UX Corrections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port designer zip 11 into the web product — redesign the dock cue-lanes to `LAYOUT(text·start·end) + one ANIMATION lane`, add a web-computed start/end spill indicator, and apply five UX corrections (distinct timeline selection, empty-space deselect, double-click view-flip+reveal, collapsible waterfall tiers, header=collapse-only).

**Architecture:** Pure web change (`web/src/**`). Spill is computed web-side from the already-exposed per-token `anims_resolved` (the engine's effective list) vs the cue's word-atom window — no engine/daemon change. Cue chips reuse `model/animRows.ts#cueRows`. New persisted UI state uses the existing `localStorage["kss.*"]` pane pattern.

**Tech Stack:** React/Vite/TS, vitest. Kit reference (read-only): `/tmp/dz11/export/product-sync/changed/{panels,model,app,stage,theme}.{jsx,css}` and `SYNC.md`. Spec: `docs/superpowers/specs/2026-06-08-dock-redesign-design.md`.

**Branch:** `feat/dock-redesign` (created, stacks on `feat/electron-shell`).

**House rules:** No engine code → no engine tests. Web is vitest-first for logic. Never `git add -A`. Decisions: spill is web-side; AnimSection untouched.

---

## File Structure

New:
- `web/src/model/spill.ts` — `cueExtent(words, animsResolved)` spill resolver.
- `web/src/model/spill.test.ts` — unit tests.

Modified:
- `web/src/components/panels/CueLanes.tsx` (+ `.test.tsx` / `.audit.test.tsx`) — 4-col→2-logical-col rewrite, chips, spill cells, resizable columns, row double-click.
- `web/src/components/panels/StyleWaterfall.tsx` (+ tests) — chevron collapse, remove scope-select + `.sel` ring.
- `web/src/components/Editor.tsx` (+ tests) — empty-space deselect, double-click view-flip + reveal, lane-col + wf-collapse persistence wiring.
- `web/src/components/stage/WordTrack.tsx` (+ tests) — `has-sel` recede flag, block double-click `onOpen`.
- The web CSS backing `.lanes`/`.tier3`/`.block` (find with grep in Task 1 step 1) — grid `--lane-cols`, chips, spill caret/tick, `.col-grip`, `.block.sel`/`.track.has-sel`, tier chevron/collapsed. Port verbatim-ish from kit `theme.css`.

---

## Task 1: Spill resolver (`web/src/model/spill.ts`)

**Files:** Create `web/src/model/spill.ts`, `web/src/model/spill.test.ts`.

Reference: kit `model.jsx#cueExtent` (lines 179-190). Product simplification: `anims_resolved` already carries resolved `start_s/end_s` (no `anchorSec` needed) and is already the effective (post-suppression) list.

- [ ] **Step 1: Write the failing test** — `web/src/model/spill.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cueExtent } from "./spill";
import type { ResolvedAnim } from "../types";

const seg = (start_s: number, end_s: number) => ({ start_s, end_s, from: 0, to: 1, accel: 1 });
const anim = (segs: { start_s: number; end_s: number }[]): ResolvedAnim =>
  ({ id: "a", name: "x", channel: "alpha", segments: segs as ResolvedAnim["segments"] });
const words = [{ text: "a", start: 1.0, end: 2.0 }];

describe("cueExtent", () => {
  it("no anims → no spill, window = word atoms", () => {
    const r = cueExtent(words, []);
    expect([r.s, r.e]).toEqual([1.0, 2.0]);
    expect(r.spillBefore).toBe(false);
    expect(r.spillAfter).toBe(false);
  });
  it("anim ending after cue end → spillAfter with positive delta", () => {
    const r = cueExtent(words, [anim([seg(1.8, 2.3)])]);
    expect(r.spillAfter).toBe(true);
    expect(r.afterDelta).toBeCloseTo(0.3, 5);
    expect(r.spillBefore).toBe(false);
  });
  it("anim starting before cue start → spillBefore", () => {
    const r = cueExtent(words, [anim([seg(0.85, 1.5)])]);
    expect(r.spillBefore).toBe(true);
    expect(r.beforeDelta).toBeCloseTo(0.15, 5);
    expect(r.spillAfter).toBe(false);
  });
  it("in-window anim (fade-in) → no spill either side", () => {
    const r = cueExtent(words, [anim([seg(1.0, 1.4)])]);
    expect(r.spillBefore).toBe(false);
    expect(r.spillAfter).toBe(false);
  });
  it("min/max across multiple anims & segments", () => {
    const r = cueExtent(words, [anim([seg(0.9, 1.2)]), anim([seg(1.5, 2.5)])]);
    expect(r.spillBefore).toBe(true);
    expect(r.spillAfter).toBe(true);
  });
  it("multi-word cue uses min start / max end of atoms", () => {
    const r = cueExtent([{ text: "a", start: 1, end: 1.5 }, { text: "b", start: 1.5, end: 3 }], []);
    expect([r.s, r.e]).toEqual([1, 3]);
  });
});
```

- [ ] **Step 2: Run → fail.** `npx vitest run src/model/spill.test.ts` (from `web/`). Expected: cannot resolve `./spill`.

- [ ] **Step 3: Implement `web/src/model/spill.ts`**:

```ts
// web/src/model/spill.ts — structural window of a cue + OUTWARD animation spill, for
// the cue-lanes start/end sub-lanes. Web-side: anims_resolved is already the effective
// (post-inheritance, post-suppression) list with resolved segment times.
import type { ResolvedAnim, Word } from "../types";

export interface CueExtent {
  s: number; e: number;                  // structural window (word-atom min start / max end)
  animStart: number; animEnd: number;    // including animation reach
  spillBefore: boolean; spillAfter: boolean;
  beforeDelta: number; afterDelta: number;  // how far past the boundary (>=0)
}

const EPS = 1e-4;

export function cueExtent(words: Pick<Word, "start" | "end">[], animsResolved: ResolvedAnim[]): CueExtent {
  const s = Math.min(...words.map((w) => w.start));
  const e = Math.max(...words.map((w) => w.end));
  let animStart = s, animEnd = e;
  for (const a of animsResolved) {
    for (const seg of a.segments ?? []) {
      animStart = Math.min(animStart, seg.start_s, seg.end_s);
      animEnd = Math.max(animEnd, seg.start_s, seg.end_s);
    }
  }
  return {
    s, e, animStart, animEnd,
    spillBefore: animStart < s - EPS, spillAfter: animEnd > e + EPS,
    beforeDelta: Math.max(0, s - animStart), afterDelta: Math.max(0, animEnd - e),
  };
}
```

- [ ] **Step 4: Run → pass.** `npx vitest run src/model/spill.test.ts` → 6 pass.

- [ ] **Step 5: Commit.**
```bash
git add web/src/model/spill.ts web/src/model/spill.test.ts
git commit -m "feat(web): web-side cue spill resolver (structural window + outward anim reach)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Cue-lanes rewrite — 2 logical columns, chips, spill cells

**Files:** `web/src/components/panels/CueLanes.tsx` + the CSS file backing `.lanes`/`.lane-row`/`.lane-head` + a new `web/src/components/panels/CueLanes.test.tsx` (or extend the existing audit test).

First locate the CSS:
- [ ] **Step 0: Find the lanes CSS.** Run (from `web/`): `grep -rln "lane-head\|\.lc \|lane-row" src/**/*.css src/*.css 2>/dev/null`. Edit that file for the grid/chip/spill rules (kit reference: `/tmp/dz11/export/product-sync/changed/theme.css` — `--lane-cols`, `.col-grip`, spill caret/tick, chip styles).

- [ ] **Step 1: Write the failing test** — `web/src/components/panels/CueLanes.test.tsx`. Build a fixture project where cue word 0 has `anims_resolved` for a `fade in` (alpha) AND a `sweep` (clip_rect) anim, with one segment ending after the cue end (outward spill). Render `<CueLanes …>` and assert:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CueLanes } from "./CueLanes";
// (build `project` via the existing test fixtures / mirror an existing CueLanes test;
//  ensure layout[0].lines[0].toks[0].anims_resolved = [{name:"fade in",channel:"alpha",
//  segments:[{start_s:1,end_s:1.3,...}]},{name:"sweep",channel:"clip_rect",
//  segments:[{start_s:1,end_s:2.4,...}]}] and words[0]={start:1,end:2})

const noop = () => {};
function setup(project: any) {
  render(<CueLanes project={project} sel={{ scope:"group", gi:0, tok:null }}
    selectedWords={new Set()} collapsed={new Set()} aiHotKey={null}
    onSelectWord={noop} onSelectEvent={noop} onToggleCollapse={noop} onCueOpen={vi.fn()} />);
}

describe("CueLanes redesign", () => {
  it("renders text/start/end/ANIMATION headers — no FADE-IN/FADE-OUT", () => {
    setup(fixture());
    expect(screen.queryByText(/FADE-IN/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/FADE-OUT/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ANIMATION/i)).toBeInTheDocument();
  });
  it("shows a chip per resolved animation (fade in + sweep coexist)", () => {
    setup(fixture());
    expect(screen.getByText(/fade in/i)).toBeInTheDocument();
    expect(screen.getByText(/sweep/i)).toBeInTheDocument();
  });
  it("flags outward spill on the end cell (caret + delta), none on start", () => {
    setup(fixture());
    const endCell = document.querySelector(".lc.end");
    expect(endCell?.className).toContain("spill");
    expect(endCell?.textContent).toMatch(/\+0\.4/);            // afterDelta ~0.40
    expect(document.querySelector(".lc.start")?.className).not.toContain("spill");
  });
});
```

(If the repo has shared CueLanes fixtures, reuse them; otherwise write a local `fixture()` returning a minimal `Project` with one group/line/token as above.)

- [ ] **Step 2: Run → fail.** `npx vitest run src/components/panels/CueLanes.test.tsx`.

- [ ] **Step 3: Rewrite `CueLanes.tsx`.** Replace `FadeCell` + `AnimCell` with: a `start`/`end` cell pair driven by `cueExtent`, and an `AnimChips` cell driven by `cueRows`. Add `onCueOpen(gi,li,ti,wid)` to props and a row `onDoubleClick`. New imports:

```tsx
import { cueExtent } from "../../model/spill";
import { cueRows, type AnimRow } from "../../model/animRows";
```

Channel→color map (mirror kit `CH_COLOR`; align with palette/Icon tokens):
```tsx
const CH_COLOR: Record<string, string> = {
  alpha:"#7fd1ff", primary:"#ff8fcf", outline:"#b08bff", back:"#8b8bff",
  scale_x:"#ffd479", scale_y:"#ffd479", fontsize:"#ffd479",
  rot_x:"#9be59b", rot_y:"#9be59b", rot_z:"#9be59b", shear_x:"#9be59b", shear_y:"#9be59b",
  spacing:"#c0c0c0", border_w:"#c0c0c0", shadow_depth:"#c0c0c0", blur:"#c0c0c0",
  clip_rect:"#ff9e64", karaoke_fill:"#7ee0c0", move:"#ff7a7a",
};
```

`AnimChips` cell:
```tsx
function AnimChips({ project, gi, wid }: { project: Project; gi: number; wid: number }) {
  const rows: AnimRow[] = cueRows(project, gi, wid);
  if (!rows.length) return <span className="lc anim none">· none</span>;
  return (
    <span className="lc anim chips">
      {rows.map((r) => {
        const tint = CH_COLOR[r.channel] ?? "#c0c0c0";
        const cls = "achip " + (r.kind === "own" ? "own" : r.kind === "tombstone" ? "supp" : "inh");
        const tag = r.kind === "inherited" ? (r.src === "global" ? "glob" : "grp") : null;
        return (
          <span key={r.id} className={cls} style={{ "--ch": tint } as React.CSSProperties} title={`${r.name} · ${r.channel}`}>
            {r.name}{tag && <span className="src">{tag}</span>}
          </span>
        );
      })}
    </span>
  );
}
```

Spill-aware start/end cells:
```tsx
function ExtentCells({ project, gi, tok }: { project: Project; gi: number; tok: Token }) {
  const ws = tok.ids.map((id) => project.words[id]).filter(Boolean);
  const ext = cueExtent(ws, tok.anims_resolved ?? []);
  return (
    <>
      <span className={"lc start" + (ext.spillBefore ? " spill" : "")}>
        {ext.spillBefore && <span className="caret">‹</span>}
        <span className="t">{ext.s.toFixed(2)}</span>
        {ext.spillBefore && <span className="delta">−{ext.beforeDelta.toFixed(2)}</span>}
      </span>
      <span className={"lc end" + (ext.spillAfter ? " spill" : "")}>
        <span className="t">{ext.e.toFixed(2)}</span>
        {ext.spillAfter && <span className="delta">+{ext.afterDelta.toFixed(2)}</span>}
        {ext.spillAfter && <span className="caret">›</span>}
      </span>
    </>
  );
}
```

Header → 4 cells, ANIMATION lane label kept:
```tsx
<div className="lane-head">
  <span className="lh layout"><Icon name="layers" size={13} />LAYOUT · cues</span>
  <span className="lh">start</span>
  <span className="lh">end</span>
  <span className="lh"><Icon name="sparkles" size={13} />ANIMATION</span>
</div>
```

Row body: keep `.lc.word` text cell as-is; replace the two `FadeCell` + `AnimCell` with `<ExtentCells…/>` and `<AnimChips…/>`. Add `onDoubleClick={() => onCueOpen(gi, li, ti, wid)}` to the `.lane-row`. Remove the now-unused `wordSchedule`/`animColMarker`/`FadeCell`/`AnimCell` imports & code.

- [ ] **Step 4: CSS** in the lanes CSS file (port from kit `theme.css`):
  - Replace the fixed 4-col grid on `.lane-head`/`.lane-row` with `grid-template-columns: var(--lane-cols, minmax(120px,1fr) 96px 96px minmax(150px,1.4fr));` on `.lanes` container (or on head+row).
  - `.lc.start`, `.lc.end`: neutral; `.spill` adds the cyan register; `.caret` cyan; `.delta` small cyan; outer-edge bleed-tick via a `::after` (start: left edge, end: right edge).
  - `.achip`: pill, `.own` filled with `color-mix(in srgb, var(--ch) 80%, transparent)`; `.inh` grey + `.src` mini-tag; `.supp` dashed + line-through.

- [ ] **Step 5: Run → pass.** `npx vitest run src/components/panels/CueLanes.test.tsx` + the existing `CueLanes.audit.test.tsx`/`CueLanes.anim.audit.test.tsx` (update any assertions that referenced FADE columns — those are stale per the redesign; adjust to the new chips, do not weaken).

- [ ] **Step 6: Commit.**
```bash
git add web/src/components/panels/CueLanes.tsx web/src/components/panels/CueLanes.test.tsx <lanes.css>
git commit -m "feat(web): cue-lanes redesign — LAYOUT(text·start·end)+ANIMATION chips + spill cells

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Resizable cue-table columns

**Files:** `CueLanes.tsx` + lanes CSS.

- [ ] **Step 1: Write the failing test** (append to `CueLanes.test.tsx`): after rendering, the `.lanes` container exposes `--lane-cols`; dragging a `.col-grip` (pointerdown→move→up with mocked deltas) changes the inline `--lane-cols` and writes `localStorage["kss.laneCols"]`; double-clicking a grip resets it.
```tsx
it("column grip drag updates --lane-cols and persists", () => {
  setup(fixture());
  const grip = document.querySelector(".col-grip") as HTMLElement;
  expect(grip).toBeTruthy();
  grip.dispatchEvent(new PointerEvent("pointerdown", { clientX: 200, bubbles: true }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: 260, bubbles: true }));
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  expect(localStorage.getItem("kss.laneCols")).toBeTruthy();
});
```
(Provide PointerEvent in the vitest setup if not present — the repo already polyfills PointerEvent in `vitest.setup.ts`.)

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement.** In `CueLanes`, add state `const [cols, setCols] = useState<[number,number,number]>(() => loadLaneCols())` where `loadLaneCols()` reads `localStorage["kss.laneCols"]` (JSON `[text,start,end]` px) with defaults `[160,96,96]`. Compute `tpl = `${cols[0]}px ${cols[1]}px ${cols[2]}px minmax(150px,1.4fr)`` and set it as `style={{ "--lane-cols": tpl }}` on `.lanes`. Render 3 `.col-grip` handles in the header (after text, start, end labels). `startColDrag(i)` on pointerdown: capture start X + start width, attach window pointermove (clamp `>=64`) / pointerup (persist `localStorage.setItem("kss.laneCols", JSON.stringify(cols))`); `onDoubleClick` resets column `i` to default + persists. Grips `stopPropagation` so they don't trigger row-select/background-deselect. Kit reference: `panels.jsx#CueLanes` (`cols`, `startColDrag`, `grip`, `tpl`).

- [ ] **Step 4: CSS** — `.col-grip` (absolute, narrow hit area, `cursor:col-resize`) from kit.

- [ ] **Step 5: Run → pass.**

- [ ] **Step 6: Commit.**
```bash
git add web/src/components/panels/CueLanes.tsx web/src/components/panels/CueLanes.test.tsx <lanes.css>
git commit -m "feat(web): resizable cue-lane columns (text/start/end), persisted to kss.laneCols

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Distinct timeline selection + recede

**Files:** `web/src/components/stage/WordTrack.tsx` + its CSS; `WordTrack.test.tsx` (or audit).

- [ ] **Step 1: Write the failing test** — with one block selected, the `.track` wrapper has `has-sel` and the selected block keeps `.sel`:
```tsx
it("track gets has-sel when a block is selected", () => {
  // render WordTrack with selId set to word 0 (mirror an existing WordTrack test's setup)
  // assert document.querySelector(".track")?.className contains "has-sel"
  // and the selected block element has class "sel"
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement.** In `WordTrack.tsx`, compute `const hasSel = selId != null || isMulti-any || selectedWords.size > 0;` and add `(hasSel ? " has-sel" : "")` to the track wrapper className (the element with class `track`). Block class already adds `.sel` (keep). No marks to remove (already gone).

- [ ] **Step 4: CSS** (kit `theme.css`): `.block.sel { box-shadow: 0 0 0 1.5px #fff, 0 0 0 3px var(--accent), 0 0 12px var(--accent); transform: translateY(-2px) scale(1.015); z-index: 5; font-weight: 600; }` and `.track.has-sel .block:not(.sel):not(.multi):not(.live){ opacity:.4; filter:saturate(.7); }`.

- [ ] **Step 5: Run → pass** (+ existing WordTrack suites green).

- [ ] **Step 6: Commit.**
```bash
git add web/src/components/stage/WordTrack.tsx web/src/components/stage/WordTrack.test.tsx <track.css>
git commit -m "feat(web): distinct timeline selection ring + recede non-selected blocks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Empty-space deselect

**Files:** `web/src/components/Editor.tsx` (dock-body click) + `WordTrack.tsx` (track bg click) + `CueLanes.tsx` (lanes bg click); `Editor` test.

- [ ] **Step 1: Write the failing test** (Editor test): clicking the `.dock-body` background calls `clearSelection` (selection store resets to `{scope:"global",gi:0,tok:null}` + empty selectedWords); clicking a `.lane-row`/`.block`/`.col-grip`/`.ruler` does NOT. Mirror the existing Editor selection-test setup; assert via the rendered inspector (GLOBAL-only) or an exposed selection probe used by other Editor tests.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement.** Add a guarded background handler used by dock-body/track/lanes:
```tsx
const bgClear = (e: React.MouseEvent) => {
  const t = e.target as HTMLElement;
  if (t.closest(".block,.lane-row,.lane-evt,.col-grip,.ruler,.wave,.tl-toolrow,.playhead,button,input,a")) return;
  clearSelection();
};
```
Attach `onClick={bgClear}` to the `.dock-body` (Editor), the `.track` wrapper (WordTrack — add an `onClearSel` prop wired to `bgClear`), and the `.lanes` container (CueLanes — add `onClearSel` prop). Esc-clear already exists; leave it. Kit reference: `app.jsx#clearSel`, `.dock-body`/`.track`/`.lanes` onClick.

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Commit.**
```bash
git add web/src/components/Editor.tsx web/src/components/stage/WordTrack.tsx web/src/components/panels/CueLanes.tsx web/src/components/Editor.test.tsx
git commit -m "feat(web): empty-space click clears selection (dock-body/track/lanes, with exclusions)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Double-click cue → flip view + reveal

**Files:** `Editor.tsx` (flip handlers + reveal), `WordTrack.tsx` (block `onDoubleClick`→`onOpen`), `CueLanes.tsx` (`onCueOpen` already added in Task 2); `Editor` test.

- [ ] **Step 1: Write the failing test** (Editor test): with a cue selected in the lanes, firing the lane row's double-click switches `dockTab` to `"timeline"` and keeps that cue selected; double-clicking a timeline block switches to `"lanes"`, selects the cue, and auto-expands its group (removes from `collapsed`). (Reveal scroll is environment-dependent — assert tab switch + selection, not scroll pixels.)

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement.**
  - `onCueOpen(gi,li,ti,wid)` (from lanes): `selectCue(...)` then `setDockTab("timeline")` then `revealSelectedCue()`.
  - `onBlockOpen(gi,wid)` (from timeline block dbl-click): select the cue, `setCollapsed(c => { c.delete(gi); … })` (ensure expanded), `setDockTab("lanes")`, then `revealSelectedCue()`.
  - `revealSelectedCue()`: a `requestAnimationFrame` retry-until-painted loop (max ~5 frames) that finds the `.sel` node within the dock scroller and sets the scroller's `scrollTop`/`scrollLeft` to bring it into view — **never `el.scrollIntoView()`**. Kit reference: `app.jsx#revealSelectedCue`.
  - Wire `onCueOpen` into `<CueLanes>` and `onOpen`→block `onDoubleClick` into `<WordTrack>`.

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Commit.**
```bash
git add web/src/components/Editor.tsx web/src/components/stage/WordTrack.tsx web/src/components/panels/CueLanes.tsx web/src/components/Editor.test.tsx
git commit -m "feat(web): double-click cue flips Timeline⇄Cue-lanes, selects + reveals (no scrollIntoView)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Collapsible waterfall tiers; header = collapse only

**Files:** `web/src/components/panels/StyleWaterfall.tsx` + its CSS; `StyleWaterfall` test.

- [ ] **Step 1: Write the failing test** — clicking a tier **header** toggles a collapsed class on that `.tier3` (rows hidden) and persists `localStorage["kss.wfCollapsed"]`; header click does NOT change selection scope (no `onSelectTier` call); NO tier renders the `.sel` ring.
```tsx
it("tier header toggles collapse and persists; no scope change, no .sel ring", () => {
  // render StyleWaterfall (mirror existing StyleWaterfall.test setup)
  // click the GROUP tier header → its .tier3 gains "collapsed", rows hidden
  // localStorage["kss.wfCollapsed"] reflects it
  // assert onSelectTier not called; no element matches ".tier3.sel"
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement.** In `StyleWaterfall.tsx`:
  - Add `const [wfC, setWfC] = useState<Set<string>>(() => loadWfCollapsed())` (keys `"cue"|"group"|"global"`), persist on toggle to `localStorage["kss.wfCollapsed"]` (JSON array).
  - `Tier` header: replace `onClick={onSelect}` with `onClick={() => toggle(scope)}`; add a `.t3-chev` chevron; when collapsed, render header only (hide the prop rows). Remove the `selected`/`.sel` class and the `onSelect`/`onSelectTier` prop threading (delete the now-dead prop from `StyleWaterfall`'s props and its call site in `Editor.tsx` if unused elsewhere — grep `onSelectTier` to confirm).
  - Kit reference: `panels.jsx#Tier`/`StyleWaterfall` (`wfC`), `theme.css` `.t3-chev`/`.tier3.collapsed`/`.t3-h`.

- [ ] **Step 4: CSS** — `.t3-chev` rotate on collapse; `.tier3.collapsed .prow { display:none }`; remove dead `.tier3.sel` rule.

- [ ] **Step 5: Run → pass** (+ existing StyleWaterfall suites; update any that asserted scope-select/`.sel` — those behaviors are intentionally removed).

- [ ] **Step 6: Commit.**
```bash
git add web/src/components/panels/StyleWaterfall.tsx web/src/components/Editor.tsx <waterfall.css> web/src/components/panels/StyleWaterfall.test.tsx
git commit -m "feat(web): collapsible waterfall tiers; header=collapse-only (remove scope-select + ring)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Full verification

- [ ] **Step 1: Typecheck + full web vitest.** From `web/`: `npx tsc --noEmit && npx vitest run`. Expected: typecheck clean; all suites pass (prior count + new spill/cuelanes/waterfall/editor/wordtrack tests; stale FADE-column / scope-select assertions updated, not weakened).
- [ ] **Step 2: Web e2e.** `npx playwright test` (from `web/`). Update `dock.spec.ts`/`inspector.spec.ts` if they referenced FADE columns or tier-scope-select; add a small dock-redesign assertion (chips present, no FADE headers, header-collapse) if cheap.
- [ ] **Step 3: Daemon/Python suites.** Spot-run `tests/test_daemon.py` — must be unchanged (no engine/daemon edits).
- [ ] **Step 4: Electron smoke (regression).** `npm --prefix web run build && xvfb-run -a npm --prefix desktop run smoke` → `KSS_SMOKE_OK` (the rebuilt SPA still loads).
- [ ] **Step 5: Visual check.** `xvfb-run -a npm --prefix desktop start -- --no-sandbox --disable-gpu --shot /tmp/kss-dock.png` and inspect the new dock (2 logical columns + chips + spill). Optional but recommended given this is a visual redesign.
- [ ] **Step 6: Tk suites (batched).** `./run-tk-tests.sh` → 118/118 (unaffected).

## Verification Summary
1. `spill.test.ts` — window + outward-only spill, multi-anim min/max.
2. `CueLanes` — no FADE columns; chips (own/inherited/suppressed); spill caret+delta outward-only; resizable persisted columns; row dbl-click.
3. `WordTrack` — `.sel` ring + `has-sel` recede.
4. `Editor` — empty-space deselect with exclusions; dbl-click view-flip + select.
5. `StyleWaterfall` — header-collapse persisted; no scope-select; no `.sel` ring.
6. Engine/daemon untouched; Electron smoke + Tk green.

## Self-review notes (author)
- Spec coverage: items 1–7 → Tasks 2,(2),3,4,5,6,7; spill resolver → Task 1; verification → Task 8. All mapped.
- Decisions honored: spill web-side (Task 1, no engine), AnimSection untouched (not in file list).
- Name consistency: `cueExtent` (spill.ts ↔ tests ↔ CueLanes), `cueRows`/`AnimRow` (animRows ↔ CueLanes), `onCueOpen`/`onOpen`/`revealSelectedCue`, `kss.laneCols`/`kss.wfCollapsed` (match existing `kss.*`).
- Risk: removing `onSelectTier` — grep before deleting the prop to confirm no other caller; if used, keep the prop but unwire from the header.
