# Timeline density rework — design spec (2026-06-09)

Implements the zip-15 designer decisions for the timeline (`docs/superpowers/zip15-decisions/DECISIONS.md` §1–5;
§6–7 need no code). Source-of-truth prototypes: `zip15-decisions/resources/Timeline-View-Toggle.html`
(integrated), `Track-Packing-Study.html`, `Strips-Refined.html` (Option A).

**Goal:** Replace the lanes-only timeline with a 3-stop **density toggle** (Compact · **Coherent** · Lanes)
backed by **group-coherent row packing**, redesign the cue block into a **constant-height card** (title +
fixed-thickness animation bars), and replace the `+N` overflow sliver with an **expand-to-overlay accordion** —
all inside a new vertically-scrollable timeline that animates between density stops (FLIP) and keeps the
selected cue pinned.

**Tech:** React/TS (`web/src`), a new **pure** packing module (TDD-first per house rule), CSS in `theme.css`,
no engine/daemon changes (pure presentation; drag/retime dispatch contracts unchanged).

---

## 1 · Terminology mapping (load-bearing — read first)

| Prototype term | Our model | Notes |
|---|---|---|
| "cue" (a block) | a **token** (`Tok`) within a group | `TrackWord` in `WordTrack` (wid/gi/li/ti/start/end/anims/subs) |
| "group" (`gi`) | a **layout group / event** (`Project.layout[gi]`) | `TrackEvent {gi,label}` |
| a group's time span | `[min(tok.start), max(tok.end)]` over its toks | used by Coherent packing |
| "row" / "band" | a packed timeline row (0..N) | currently implicit: one row per event |

**Today** (`WordTrack.tsx:122,568-678`) we render exactly one labelled `.wt-lane` per event — that is
**already the "Lanes" stop**. The rework adds Compact + Coherent (which pack events/toks into *fewer* rows),
the density control, the card-shaped block, the overlay, and a scroller.

---

## 2 · Decisions recap (what we build)

- **§1 Density toggle** — 3 stops on one axis, default **Coherent**. Animated FLIP between stops; selected
  cue pinned in the viewport across the change.
- **§2 Group-coherent packing** — Coherent: each group's blocks stay on one row; only groups whose spans
  never overlap share a row. Compact: pack at the token level (a group may scatter). Lanes: one row per
  event + label gutter.
- **§3 Constant-height bars** — 6px tall, never slot-divided; width still encodes real duration.
- **§4 Expand-to-overlay (Option A)** — past `MAX_VISIBLE=3` bars, a `＋N`/`－` disclosure lifts a floating
  full-height **accordion** overlay of that cue (one open; click-away/Esc closes); **row height never
  changes**; a cyan top-edge marker frames the original block (open bottom).
- **§5** keep the refined `tl-anim` strips (pip/underglow alternative explored, not adopted).
- **§6/§7** no code: no cue-visibility ticks on the lane; keep the honest tick ruler (no invented waveform).

---

## 3 · Architecture

### 3.1 New pure module — `web/src/model/trackPack.ts` (TDD-first)

The only piece with real algorithmic content; pure, no React → unit-tested in isolation.

```ts
export type Density = "compact" | "coherent" | "lanes";

export interface PackItem { gi: number; s: number; e: number; }      // a token's span + its group
export interface PackRow { items: PackItem[]; }                      // items assigned to this row (any group)
export interface PackResult { rows: PackRow[]; rowOf: Map<string,number>; } // key = `${gi}:${tokKey}`

// Overlap: strict, epsilon-guarded (touching endpoints do NOT overlap)
const OV = (a:Span,b:Span) => a.s < b.e - 1e-6 && b.s < a.e - 1e-6;

export function packTimeline(items: PackItem[], density: Density): PackResult;
```

Algorithms (verbatim from the prototype, see study report):

- **lanes** — one row per `gi`, rows ordered by ascending `gi` (or by group first-start — match current
  event order). No sharing.
- **coherent** — group items by `gi`; each group's span = `[min s, max e]`. Order groups by first-start
  ascending. For each group, place ALL its items on the **first row where no item overlaps any item already
  on that row** (group is the placement unit → never split); else a new row. Non-overlapping groups merge.
- **compact** — order individual items by start; greedy first-fit: item → first row whose last end
  `≤ item.s - 1e-6`; bump that row's last-end to `item.e + 0.04` (anti-touch pad). Groups may scatter.

Returns rows in top→bottom order + a lookup from token → row index (the component positions blocks by row).

### 3.2 Constant-height block geometry — extend `web/src/model/animStrips.ts`

Replace the slot-divided band (`BAND/slots/slotH`, `animStrips.ts:105-118`) and the `+N` sliver
(`122-135`) with constant bars + an overlay descriptor. New constants (match prototype):

```ts
export const TEXT_H = 22, BAR_H = 6, GAP = 4, PAD_B = 7, MAX_VISIBLE = 3, TINY_PX = 18;
export const BLOCK_H = TEXT_H + MAX_VISIBLE*BAR_H + (MAX_VISIBLE-1)*GAP + PAD_B; // 55
export const fullBlockH = (n:number) => TEXT_H + n*BAR_H + (n-1)*GAP + PAD_B;    // overlay height
```

`layoutStrips(anims, cueStartS, pxPerSec, { mode })` returns:
- bars: first `MAX_VISIBLE` anims, each `top = TEXT_H + i*(BAR_H+GAP)` **px** (not %), `height = BAR_H`,
  `left/width` from time (`width<TINY_PX → glyph` chip, 15px, height 9px), `stripStyle` fill unchanged.
- `overflowCount = max(0, anims.length - MAX_VISIBLE)` (drives the `＋N` disc; **no sliver bar**).
- no `cueHeight` growth — block is always `BLOCK_H`; expansion is the overlay (component-level), not a
  taller block.

`typeForChannel`/`typeColor`/`typeGlyph`/`stripStyle`/`animColMarker` keep their signatures (other callers
unaffected). Bar fill uses the group-tinted gradients from the prototype (`stripBg`) — port the per-type
gradient table (color/alpha/size(+triangle clip)/type/move/glow).

### 3.3 WordTrack rework — `web/src/components/stage/WordTrack.tsx`

- **Scroller**: wrap the rows in a `.wt-scroller` (`overflow:auto`, bounded height) so tall stacks (Lanes,
  many events) scroll; the ruler stays sticky on top, the playhead/guides span the scroll content. This is
  new — today there is no vertical scroll.
- **Rows from the packer**: compute `packTimeline(items, density)` and render one `.wt-row` per `PackRow`;
  each block positioned `left%/width%` by time (reuse current math) and `top` centered in the row. Block
  color = its group color. Lanes mode adds the `.wt-label` gutter per row (one group per row); Compact/
  Coherent collapse the gutter (no labels).
- **Card block**: each block renders a `.wt-block` card — a `.blk-title` (22px, cue text; merged cues keep
  the `.blk-seg` treatment inside the title area) + the constant-height bars below. Block height `BLOCK_H`.
- **Density state**: `density: Density` lifted to Editor (persisted `kss.tlDensity`, default `"coherent"`),
  passed in with a 3-stop segmented control in the timeline toolbar (`.seg` with Compact/Coherent/Lanes,
  glyphs ☷/☲/☰, `.on` = accent). Default Coherent.
- **FLIP** on density change: capture `[data-flip]` rects (blocks + ruler + playhead) before re-layout,
  invert→play `transform .38s var(--ease-out)` (translate only — heights are constant). Respect
  `prefers-reduced-motion` (skip the animation).
- **Selected-cue pinning**: before FLIP, capture the selected block's top offset within the scroller; after
  re-layout, adjust `scrollTop` so it stays at the same viewport Y (`captureV`/`restoreV` from the proto).
- **Overflow accordion**: the `＋N` disc (when `overflowCount>0`) toggles an `expandedCue` (single value,
  accordion). When open, render a floating `.wt-block.overlay` copy at the same left/width, height
  `fullBlockH(n)`, `z-index:25`, with ALL bars and the cyan top-edge marker (`::after`, `border-bottom:none`,
  height = `BLOCK_H`). Lane/scroller ancestors `overflow:visible` where the overlay lives (or render the
  overlay in a portal layer above the scroller to avoid clipping — decide in plan). Click-away / Esc close.
  Replaces the current upstream `expandedCues:Set` inline-expand contract with a single `expandedCue`.
- **Preserve**: drag/retime (`handleBlockPointerDown`/`startDrag`, the `unlocked` gate), strip-handle retime
  (`startAnimDrag`, `MIN_ANIM_MS=50`, dispatch payloads), snap guides, source-linking, the px↔seconds
  mapping (`pxPerSec` measured from a stable full-width row element, not "first lane").

### 3.4 Editor wiring — `web/src/components/Editor.tsx`

- Own `density` state + persistence (mirror `magnet`, `Editor.tsx:82-91`); pass to WordTrack.
- Replace `expandedCues:Set` + `onExpandOverflow/onCollapseOverflow` with `expandedCue:number|null` +
  `onToggleOverflow(wid)` (accordion). Keep `animFocus`, retime, selection contracts.

---

## 4 · Params (authoritative, from prototypes)

| Const | Value | | Const | Value |
|---|---|---|---|---|
| `TEXT_H` | 22px | | `MAX_VISIBLE` | 3 |
| `BAR_H` | 6px | | `TINY_PX` (→glyph) | 18px |
| `GAP` | 4px | | `BLOCK_H` | 55px |
| `PAD_B` | 7px | | row/band height | ≈ `BLOCK_H+10` |
| FLIP duration | 0.38s `cubic-bezier(.2,.7,.3,1)` | | FLIP cleanup | 460ms |
| Compact anti-touch pad | +0.04s | | overlap epsilon | 1e-6 |
| overlay z-index | 25 | | cyan marker | `1px color-mix(cyan 28%)`, no bottom border, radius `8 8 0 0` |
| glyph chip | 15px wide, 9px tall | | disc pill | `top:4px right:6px h:16px`, accent/cyan on open |

Channel→color/label/glyph and the per-type bar-fill gradients: port the prototype's `typeColor`/`TYPES`/
`typeGlyph`/`stripBg` tables verbatim (already largely present in `animStrips.ts`).

---

## 5 · Build order (informs the plan; each phase ships + tests green)

1. **`trackPack.ts` + unit tests** (pure; TDD-first). Compact/Coherent/Lanes row assignment, overlap edge
   cases, group-coherent vs collision divergence, ordering. No UI.
2. **Constant-height strips** in `animStrips.ts` + update its consumers/tests (AT-03/04/05/07 change:
   no `+N` sliver, no `cueHeight` growth, bars at fixed px tops, glyph at 18px).
3. **Card block + rows + scroller** in WordTrack (still Lanes-equivalent default → Coherent): render rows
   from the packer, the 55px card, the sticky ruler + scroller. Update WordTrack unit/audit/snap tests and
   the e2e `dock.spec` G-14b "shared row" expectation (now density-dependent).
4. **Density toggle + FLIP + pinning**: the segmented control, Editor state + persistence, FLIP transition,
   selected-cue scroll pin. New tests for mode switching + persistence.
5. **Expand-to-overlay accordion**: the `＋N` disc, floating overlay, cyan marker, click-away/Esc, accordion.
   Replace the `expandedCues` contract; update AT-05/AT-06 + add overlay tests + an e2e.

---

## 6 · Testing strategy

- **Pure** (`trackPack.test.ts`, new): the packing algorithms — deterministic row assignments for crafted
  overlap scenarios; Coherent never splits a group; non-overlapping groups merge; Compact may scatter;
  Lanes = one row per gi. This is the core correctness surface.
- **animStrips**: add a focused `animStrips.test.ts` (today only covered via AT-*); assert constant bar
  tops/heights, glyph threshold, overflowCount, no sliver.
- **WordTrack vitest** (update): card markup, rows-from-packer, density prop, accordion overlay, FLIP is
  best-effort (jsdom has no layout — assert state/markup transitions, not pixels).
- **e2e** (`dock.spec`, update + add): density toggle changes row count; selected cue stays put across a
  toggle; overflow disc opens the overlay; Esc/click-away closes. G-14b "cues share a row" becomes a
  Coherent/Compact assertion.
- Existing drag/retime/snap and jassub specs must stay green (dispatch contracts unchanged).

---

## 7 · Assumptions & out-of-scope (confirm in review)

- **Block becomes a 55px card in all density modes.** This materially increases timeline height and adds a
  vertical scroller — it is the integrated prototype's design. (If you want the thin 26px bar retained for
  some mode, say so — that changes §3.3 substantially.)
- **H/V zoom sliders from the prototype are OUT of scope** — not a zip-15 decision; keep the existing
  `pxPerSecOverride` as-is. Revisit separately.
- **Density persists** per-session in localStorage (default Coherent), like magnet/pane sizes.
- **Lanes self-overlapping group** (true simultaneous words in one group): render on one row (blocks may
  visually overlap, as today) — not auto-split. (Flagged open in the packing study; this is the simplest
  consistent choice.)
- No engine/daemon/MCP changes. Drag/retime/anim dispatch payloads unchanged.
- The rest of Track B (align-in-waterfall, EventStrip placement, RTL, VideoControl, default-tab, etc.) is
  **not** in this spec — separate, still-open items.

---

## 8 · Key file anchors
- New: `web/src/model/trackPack.ts` (+ `.test.ts`)
- Edit: `web/src/model/animStrips.ts` (`MIN_PX`/`MAX_BARS`→constant-height; overflow descriptor)
- Edit: `web/src/components/stage/WordTrack.tsx` (rows, card block, scroller, density, FLIP, pin, overlay)
- Edit: `web/src/components/Editor.tsx` (density state+persist; overflow contract)
- Edit: `web/src/theme.css` (`.wt-scroller/.wt-row/.wt-block(.overlay)/.blk-title/.seg` density control)
- Tests: `trackPack.test.ts`, `animStrips.test.ts` (new); update WordTrack `*.test.tsx`, `dock.spec.ts`,
  `animations.spec.ts`
