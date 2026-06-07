# Editor-iteration — where your iteration meets the shipped build

**Status:** engineering response to `ui_kits/desktop-app/CHANGELOG_editor-iteration.md`. Most of your
iteration is welcome and several pieces are net-new wins we'll port near-verbatim (range/pick anchor
ref, group-move, cross-line merge, unmerge, keyboard undo/redo, the magnet snap engine, the MCP-connect
popover). This doc is the **honest delta**: it flags the places where the prototype layer has drifted
from `feat/editor-iteration` as it actually ships today — code that already exists, behaviors you'd be
*removing*, and premises in the changelog that predate work that landed since you forked.

The big one is **§9 placement** — a ground-up redesign that reverses interaction decisions *you yourself
made* in `HANDOFF_finish-ui-answers.md` and would delete a passing audit cluster. It needs a designer
decision before we touch it. Everything else is mechanical.

Diffs below are trimmed to the load-bearing lines. `ours` = shipped on this branch; `kit` = your prototype.

---

## 1. Verdict map

| Changelog § | Status | Note |
|---|---|---|
| §1 Timeline drag/resize/**magnet** | **DIVERGE → ADOPT (the magnet)** | drag-retime + group-move SHIPPED (AT cluster). Magnet/near-line/zoom-to-playhead are **net-new** — we port `tl-anim.js` snap engine verbatim. |
| §2 Selection model (range/pick + anchorRef) | **SHIPPED-ALREADY** | We have shift=range, ctrl=pick, `anchorRef`. **UI delta:** range is **time-ordered**, not token-ordered (locked, §5). Held-modifier pill = ADOPT. |
| §2 highlight (violet + left bar) | **DIVERGE** | We ship `.sel`/`.multi`; happy to take the violet+bar treatment as pure CSS. See §2 below. |
| §3 Break/Join **toggle** | **SHIPPED-ALREADY** | D-70. Our `breakLine()`/`breakLineOn()` is exactly your contextual toggle. |
| §3 multi-select line semantics, **cross-line merge**, **unmerge** | **ADOPT** | We have single-line merge + break toggle; cross-line span-drop, span>1-line→join, and unmerge are net-new. WP-1. |
| §3 merged-cue per-word segments | **SHIPPED-ALREADY** | WordTrack already renders `subs`/`subTexts` segments with divider ticks. |
| §4 continuous playhead + scrub | **SHIPPED-ALREADY** | one playhead through the ruler; scrub on the ruler. Drag-the-playhead-to-scrub + snap = ADOPT. |
| §5 History — keyboard undo/redo | **ADOPT** | net-new; `hRef`/`actRef` global handler ported as-is. |
| §5 press-flash | **ADOPT** | net-new `.btn.pressed` flash. |
| §5 de-dupe undo/redo to TopBar only | **CONFLICT-NEEDS-DESIGNER** | we ship undo/redo in **both** TopBar and OpsToolbar on purpose. See §2 below. |
| §6 Font **picker** | **ADOPT** | our row is display-only today; we build the real `<select>`. The combo→stepper bug you fixed **never existed in our code** (see §3). |
| §6 clearStyle "X" word-tier bug | **STALE** | prototype-only; our C-cluster proves cue-tier clear works. |
| §6 remove "Coming soon" stub | **CONFLICT-NEEDS-DESIGNER** | the engine **has animations now**; the stub must become / defer to the shipped AnimSection, not just vanish. See §3 + §4. |
| §7 resizable panels + unselectable | **ADOPT** | net-new. |
| §8 preview sizing (16:9, cqw, fixed-width toggle) | **ADOPT** | cosmetic; welcome. |
| §8 **Waveform removed** | **STALE** | already done — we converted it to an honest ruler (commit `27c5ce1`). See §4. |
| §9 Placement **redesign** | **CONFLICT-NEEDS-DESIGNER** | the headline conflict. Reverses your own finish-ui answers + kills the B-cluster. See §2 (main). |
| §10 MCP connect popover | **ADOPT** | net-new and great. **STALE values:** token is optional, CORS is real & narrower. See §4. |
| §11 timeline-anim strips | **DIVERGE → ADOPT (magnet only)** | AT cluster SHIPPED (strips, cap-3/overflow/glyph, 2-click focus, drag-retime). Magnet/zoom/source-linking = net-new. See §4. |
| Dev-notes "engine model unchanged", set_*-only, `HANDOFF_real-model.md` | **STALE** | animations shipped. See §4 ledger. |

---

## 2. §9 Placement redesign — the main conflict

Your §9 is a coherent, well-reasoned model. The problem is not its quality — it's that it **reverses a
chain of decisions you already shipped us**, and it would delete a green audit cluster (B-09…B-32) plus
the band-height drag we built specifically to make margin editing feel direct. We need you to confirm the
reversal consciously, because four of these were your calls in `HANDOFF_finish-ui-answers.md`.

### 2a. Body drag — you specified it; §9 removes it

```
ours — PreviewStage.tsx:349-360 + 194-215
<div className={"bbox live" + ...} style={boxStyle}
     onPointerDown={(e) => start(e, "move")}>          // body = move
  {["nw","n","ne","e","se","s","sw","w"].map((h) =>     // 8 handles
    <i key={h} className={h+" mh"}
       onPointerDown={(e)=>{e.stopPropagation(); start(e,h);}} />)}
// start("move") → applyMove(box, dx, dy) → marginsFromBox  (bbox.ts:64)
```
```
kit — stage.jsx:187-195
<div className={"bbox"+...} style={boxStyle}>
  <i className="w mh" onPointerDown={(e)=>begin(e,"w")} />   // edges ONLY
  <i className="e mh" onPointerDown={(e)=>begin(e,"e")} />
  {vpos==="bottom" && <i className="s mh" .../>}             // top OR bottom
  {vpos==="top"    && <i className="n mh" .../>}             // none for middle
// body is NOT draggable; no onPointerDown on the box element
```
**Takeaway:** §9 deletes body-drag and the 8-point handle set. Your `HANDOFF_finish-ui-answers.md` §1b
explicitly specced *"the dashed rectangle with **8 handles**"* and §1 confirmed *"body = `grab`/`grabbing`"*.
This is a direct reversal. **Question 1: confirm body-drag removal and the drop from 8 handles to 3-4 edge bars?**

### 2b. Symmetric-by-default — opposite default from what we shipped

```
ours — PreviewStage.tsx applyResize via bbox.ts:70-77
if (handle.includes("w")) l = clamp(l+dx, 0, r-min);   // each handle = ONE side
if (handle.includes("e")) r = clamp(r+dx, l+min, W);   // free, asymmetric
```
```
kit — stage.jsx:140-148
if (e.shiftKey) { /* one side */ }
else {                       // symmetric DEFAULT — shared delta, center fixed
  let d = m==="w" ? nm-o.margin_l : nm-o.margin_r;
  n.margin_l = o.margin_l + d; n.margin_r = o.margin_r + d;
}
```
**Takeaway:** we resize one margin per handle; you invert it (symmetric default, Shift = one side, with a
"stop at min width without sliding the center" rule). That's a behavior change to every resize gesture and to
B-18/B-19 ("'e' handle only changes margin_r"). Adoptable, but it's a relearn for existing users. **Question 2:
symmetric-by-default confirmed, including Shift-for-one-side?**

### 2c. The band-height (middle-row) drag we shipped has no home in §9

```
ours — PreviewStage.tsx:121-135  (+ B-22 audit)
// Visual band height (canvas px), session-local. The model only persists the
// anchored margin; without this, resizing the non-anchored edge would snap
// back to the default 18% band ...
const applyBandH = (b, pl, bh) => { ... if (row==="bottom") return {...b, t: b.b-bh}; ... }
setBandH(final.b - final.t);   // remembered across the commit/re-derive
```
§9's box *"hugs the measured caption height (no fake fixed rectangle)"* and is **read-only in the vertical for
middle alignment** (no `n`/`s` handle when `vpos==="middle"`). That removes the user's ability to set band
height at all. **Question 3: is losing manual band-height intentional (caption-hug replaces it everywhere)?**
B-22 dies either way.

### 2d. Always-on safe-area guides + snapping — you deferred these in finish-ui §3

```
kit — stage.jsx:166-169, 124-126
<div className="ph-guides"><span className="g-cv"/><span className="g-ch"/>
  <span className="g-safe s10"/><span className="g-safe s5"/></div>   // ALWAYS shown
const SAFEX=[0.05*CW,0.10*CW]; ... snap(...) // hard-ish snap @ 1.8% tol, Alt bypass
```
```
ours — PreviewStage.tsx (free drag, no guides, no snap)
return d.mode==="move" ? applyMove(...) : applyResize(...);   // raw delta, no snap targets
```
**Takeaway:** `HANDOFF_finish-ui-answers.md` §3 said *"Confirmed for v1: free dragging, no snap"* and called
soft guides *"the on-brand upgrade … Not built in v1."* §9 now ships the upgrade (and makes guides
*always* visible, not just during drag). Fine to adopt — but it's the deferred-path becoming v1. **Question 4:
promote snap+guides to v1, and keep the 5%/10% rects always-on (vs only-while-dragging)?**

### 2e. Drag-readout chip — kept on both sides (good), confirm it stays

```
ours — PreviewStage.tsx:362-366 (B-31/B-32)        kit — stage.jsx:209
<div className="drag-readout" style={{left:x+16,    <div className="drag-readout"
  top:y+16}}>{readoutText}</div>                       style={{left:x+16,top:y+16}}>{readoutText}</div>
// "L 80 · R 80 · V 60" / "pos 960, 540"            // identical chip + offsets
```
**Takeaway:** identical — this is the one §9 interaction that *survives* unchanged (it was your finish-ui §2
addition). **Question 5: confirm the chip stays** (it's the only readout once per-edge labels are gone, so it
becomes load-bearing).

### 2f. Esc-cancel — present both sides, keep it

```
ours — PreviewStage.tsx:246-257 (B-23/B-29)
if (e2.key==="Escape") { e2.stopImmediatePropagation(); d.cancelled=true; ...restore... }
```
```
kit — stage.jsx:155
const onKey=(e)=>{ if(e.key==="Escape"){ setLocal(null); setDrag(null);... } };
```
**Takeaway:** equivalent (we additionally `stopImmediatePropagation` so Esc-during-drag doesn't also clear the
cue selection — keep that). **Question 6: confirm Esc-cancel stays.**

### What dies if we adopt §9 wholesale

- **B-09…B-16** body-drag margin commits (drag L/R/U/D, clamps, double-drag round-trip) — no body to drag.
- **B-17.{nw,n,ne,se,sw} / B-18 / B-19** the 5 corner/extra handles + per-side isolation — gone with edge-only + symmetric.
- **B-22** band-height persistence — no manual band in §9.
- **drag-readout** survives (B-31/B-32) — the one keeper.
- **`bbox.ts` `applyMove`** loses its only caller in margin mode (still used by pin mode).
- Your **own** `HANDOFF_finish-ui-answers.md` items **§1 (body=grab), §1b (8 handles), §2/§2a (chip — survives), §3 (no-snap v1)** — items 1, 1b, 3 are reversed.

**Net for §9:** we're glad to build it, but it's a rewrite of a shipped, tested surface and a reversal of your
earlier spec — not an incremental tweak. We need explicit answers to Q1–Q6 before WP-2 starts.

---

## 3. §2/§5/§6 UI deltas on already-shipped features

### Selection highlight (§2)
```
ours — theme.css .sel / .multi (subtle fill + accent ring)     kit — violet fill + left bar
```
Pure CSS, no behavior. **ADOPT the violet+left-bar** — it reads better for multi-select. No questions.

### Undo/redo placement (§5) — CONFLICT
```
ours — OpsToolbar.tsx:81-87 (dock copies KEPT)      TopBar.tsx (also has undo/redo)
<button className="minibtn" onClick={onUndo}...>Undo</button>
<button className="minibtn" onClick={onRedo}...>Redo</button>
```
```
kit — panels.jsx OpsToolbar (undo/redo REMOVED from dock; TopBar only)
```
We deliberately keep **both** TopBar and OpsToolbar undo/redo (the dock is where layout-ops happen, so undo is
in-reach there) plus we're mid-flight on toggled `aria-pressed`/`.on` states for the dock buttons. Your §5
de-dupe removes the dock copy. **Keyboard undo/redo and press-flash are net-new and ADOPTED regardless.**
**Question 7: drop the dock undo/redo (TopBar-only), or keep both?**

### Break/Join + merge/unmerge (§3)
- Break/Join toggle: **SHIPPED-ALREADY** (`breakLine()` + `breakLineOn()`), 1:1 with your contextual toggle.
- Cross-line merge (drop `\N` inside the run, keep outside), span>1-line→join, **unmerge**: **ADOPT** (WP-1). Our
  `mergeWords()` currently rejects cross-line (`"merge needs adjacent words on one line"`); we relax that and add
  `unmerge_word` dispatch + selection-preservation per your spec.

### Font picker (§6) — the bug you fixed isn't in our tree
```
kit changelog §6: 'font kind:"combo" had no PropRow case → fell through to numeric stepper'
ours — panels parity: our StyleWaterfall row for `font` is DISPLAY-ONLY today (no editable control yet)
```
**STALE-as-a-bug, ADOPT-as-a-feature:** our code never had the combo→stepper fall-through (no stepper path for
font), so there's nothing to "fix" — but we DO want the real `<select>` picker you built. We'll port the
`combo` control (the `FONTS` list + styled `<select>`). No corruption risk existed here.

### clearStyle "X" cue-tier bug (§6) — STALE
Prototype-only. In our build the cue tier clear works (C-cluster audit covers cue-tier override-clear). Your
fix is correct *for the prototype*; nothing to port.

### "Coming soon" stub removal (§6) — CONFLICT, not a plain delete
```
ours — ControlsRail.tsx:61-72  (STILL shows the disabled stub)
<div className="sec-t spacer disabled-sec">Animation preset <span className="soon">Coming soon</span></div>
... "Per-word entrance animations aren't in the render engine yet — disabled until then."
```
```
ours — Editor.tsx:20,742  (AnimSection is ALREADY wired in the Inspector!)
import { AnimSection } from "./panels/AnimSection";   ...   <AnimSection .../>
```
**Takeaway:** the engine has animations now (`engine/anim.py`, `engine/anim_migrate.py`, the four MCP tools),
and the **real `AnimSection` inspector already ships** alongside this dead stub. So §6 "remove the stub" is
**right to remove, wrong to leave a hole** — the ControlsRail stub must be deleted *and the rail should point at
/ make room for the live AnimSection*, not just drop the chips. We'll do this in WP-2. (This stub is itself stale
in our tree — a cleanup we owe regardless of your changelog.)

---

## 3b. Prototype / `theme.css` deltas

The interaction changes above ride on top of `theme.css` rewrites. Most are clean additions we port as-is;
two are **redefinitions of shipped classes** that would visually break the current build until the matching JSX
lands — worth calling out so we sequence the CSS+JSX together rather than half-applying your stylesheet.

### `.bbox` is redefined from "draggable 8-handle box" to "pointer-through edge bars"
```
ours — theme.css:172-183 + 570-577
.bbox { ... cursor: grab; z-index: 2; }                 // body grabbable
.bbox.live { pointer-events: auto; cursor: grab; }      // box itself takes the move
.bbox i.mh { width:9px; height:9px; ... }               // 9px POINT handles
.bbox .nw{...} .n{...} ... .w{...}                       // all 8 positioned
```
```
kit — theme.css:146-170
.bbox { ... cursor: default; pointer-events: none; }    // box is NON-interactive
.bbox i.mh { background:transparent; border:0; width:auto; height:auto; }  // resets the point look
.bbox .mh.w,.mh.e { top:0; bottom:0; width:14px; }      // FULL-LENGTH edge bars
.bbox .mh.n,.mh.s { left:0; right:0; height:14px; }
.bbox i.mh { pointer-events: auto; }                    // only the bars hit-test
.bbox i.mh::after { ... }                               // the visible 3px accent rail
.bbox.ro { border-style: dotted; opacity:.4; }          // NEW — read-only box (pinned mode)
```
**Takeaway:** these two `.bbox` blocks are mutually exclusive — your `pointer-events:none` + bar geometry
overrides our `cursor:grab` + point handles. If we take your CSS without the §9 JSX (which stops rendering body
`onPointerDown` and the corner handles), the box goes dead — body drag silently stops working with no visual
cue. **Couple them.** Note `.bbox.ro` is net-new and only makes sense once pinned mode renders the read-only box
(`stage.jsx:196`).

### Net-new CSS we adopt cleanly (no shipped-class collision)
| Selector(s) | Purpose | Where used |
|---|---|---|
| `.ph-guides .g-cv/.g-ch/.g-safe.s5/.s10` (theme:172-176) | always-on center cross + 5%/10% safe rects | §9 guides — gated on Q4 |
| `.snap-vline/.snap-hline` (177-178) | the brightened line on a placement snap | §9 snapping — Q4 |
| `.btn.pressed` (50) | undo/redo press-flash | §5 ADOPT |
| `.pv-select-wrap/.pv-select` (209-214) | the real font `<select>` chrome | §6 font picker ADOPT |
| `.snap-toggle` + `.on/.alt` (263-270) | timeline magnet toggle, amber while Alt | §1/WP-3 magnet |
| `.snap-guide` + `.k-playhead/.near/.sg-tag` (275-279) | on-track snap + near-line preview | §1/WP-3 magnet |
| `.app{user-select:none}` (61) + `body.tl-drag *{...!important}` (254) | no text-selection during drags | §7 ADOPT |

### Deltas that are no-ops for us (already identical or already handled)
- `.toggle`/`.toggle.on/.off/.knob` (kit 106-109 vs ours 102-105) — **byte-identical**; nothing to do.
- `.drag-readout` (kit 192 vs ours 198) — identical chip; keeper (see §2e).
- `.pinbox`/`.pinbox.dragging` (kit 179-186 vs ours 185-192) — identical.
- `.minibtn.on`/`.primary.on` — **ours already has the toggled-state styling** (theme:351-356) that backs the
  `aria-pressed` work in §2; the kit OpsToolbar doesn't render undo/redo so there's no `.minibtn` undo collision.
- `.lane-row.multi` (ours 337: accent fill + inset left bar) is already the "violet + left bar" treatment your §2
  asks for, just keyed to `--accent` — adopting your violet is a one-token swap, not a structural change.
- `.ruler`/`.wave`/`.wave-wrap` (ours 236-238) still exist for the **kept-for-later** Waveform component, but the
  live timeline uses `.ruler-row`/`.ruler-track`/`.tk` (ours 261-266) — the honest ruler. Your §8 "waveform
  removed" CSS cleanup is already reflected by us routing through the ruler classes (the wave classes are dead
  but harmless). See §4 ledger.

**Sequencing note:** the only CSS that *must* ship lockstep with JSX is `.bbox`/`.mh` (§9). Everything else is
additive and can land per-WP.

---

## 4. Staleness ledger — changelog premises that are behind reality

The changelog header says *"the engine model (`model.jsx`) shape is unchanged"* and the dev-notes lean on
`HANDOFF_real-model.md` + `set_*` tools. That snapshot predates the **animations feature**, which merged into
this branch's history. One-line corrections:

| Changelog premise | Reality | Pointer |
|---|---|---|
| "engine model unchanged" | Animations shipped: anim **carriers** (`globals.animations`, per-group `animations`+`suppress`), **`anim_tags`**, accumulate removed, fade fields **migrated then dropped**. | `engine/anim.py:238-253`, `engine/anim_migrate.py` |
| migration not mentioned | **Migration-on-open** runs every load: legacy `fade`/`accumulate` → animation carriers. | `daemon/library.py:116` → `engine.migrate_project`; `engine/anim_migrate.py:40,73-90` |
| `set_*`-only tooling | `add_animation / remove_animation / restore_animation / set_animation_props` all exist (tombstone on inherited remove). | `mcp_server/tools.py:214-229` |
| legacy fade tools assumed live | Old `set_fade`/`add_fade`/fin/fout-tag tools are **deleted outright** (no back-compat). | `mcp_server/tools.py` (no fade defs; only tolerance for migrated payload shape at :97-115) |
| `HANDOFF_real-model.md` is the schema | Superseded for animations by `HANDOFF_animations-questions.md` Part 1 (anchor+offset timing, 8 anchors, presets→channels). | `HANDOFF_animations-reconciliation.md` |
| §8 "Waveform removed (deferred)" | Already done — **converted to an honest ruler**, not deferred: *"the engine has no audio source, so there is no real waveform to draw. This is a plain scrubbable time axis."* | `Waveform.tsx:9-10`, commit `27c5ce1` |
| §11 "strips concept" framed as new | AT cluster **SHIPPED**: strips, fill-by-type, **cap-3 / +N overflow / glyph chips**, **2-click focus**, **drag-retime**. Only **magnet / zoom-to-playhead / source-linking** are net-new. | `web/src/model/animStrips.ts`, `WordTrack.anim.audit.test.tsx`, `AnimSection.tsx` |
| §10 popover values | **Token is OPTIONAL** (`token=os.environ.get("KSS_MCP_TOKEN")`, default `None`; auth middleware only attached `if token`). **CORS is real and narrow:** `127.0.0.1:5173` + `localhost:5173`, methods/headers `*`. Bind is loopback-only on the chosen `--port` (your hard-coded `8137` is a default, not contractual). | `daemon/app.py:17,49-52`; `daemon/__main__.py:17-18` |

§10 specifics to correct in the popover copy: show the `Bearer` row as **conditional** ("if `KSS_MCP_TOKEN` is
set" — otherwise no auth header), and the CORS note should read `127.0.0.1:5173` **and** `localhost:5173`. The
host/port line is right in spirit (loopback bind) but `8137` should read as the default port, not fixed.

---

## 5. Locked engineering decisions (FYI — no action needed)

- **Shift-range stays TIME-ordered, not token-ordered.** Your `app.jsx` ranges by `toks` index (`ia`/`ib`); we
  range by `c.start` (`Editor.tsx:176-184`). Rationale: cues can be retimed and merged out of document order, so
  "select everything between these two **moments**" is what users mean on a timeline-anchored editor. The held-
  modifier pill and anchor-ref mechanics are otherwise identical and adopted.
- **Prototype-code reuse promise stands.** We port your `tl-anim.js` snap engine (`SNAP_PX`, `REVEAL_PX`,
  `snapEdge`, `nearLines`), the magnet toggle + Alt-invert, and the MCP-connect popover near-verbatim. Credit
  where it's due — the snap engine is clean and we're not rewriting it.
- **Three work packages** we'll build from this changelog:
  1. **WP-1 layout-ops:** cross-line merge, span→join, unmerge, selection-preservation, merged-segment polish.
  2. **WP-2 shell-UX:** keyboard undo/redo + press-flash, resizable panels, font picker, MCP popover, **kill the
     ControlsRail "Coming soon" stub → defer to AnimSection**.
  3. **WP-3 magnet system:** port the snap engine to the cue timeline + anim strips (zoom-to-playhead,
     source-linking, draggable playhead).
  **§9 placement is intentionally NOT in a WP yet** — it's blocked on the Q1–Q6 designer decisions.

---

## Designer questions (please answer before WP-2/§9 starts)

1. Confirm **body-drag removal** and the drop from **8 handles → 3-4 edge bars**? (reverses finish-ui §1/§1b)
2. **Symmetric resize by default** + Shift-for-one-side — confirmed? (inverts our per-side resize)
3. Is losing **manual band-height** intentional (caption-hug replaces it for all rows, incl. middle)?
4. Promote **snap + safe-area guides to v1**, and keep the 5%/10% rects **always-on** vs only-while-dragging?
   (reverses finish-ui §3 "free drag, no snap in v1")
5. Confirm the **drag-readout chip stays** (it becomes the only readout once per-edge labels are gone).
6. Confirm **Esc-cancel stays** (we keep `stopImmediatePropagation` so it doesn't also clear selection).
7. Undo/redo: **TopBar-only** (your §5 de-dupe) or **keep the OpsToolbar dock copies** too?

---

## Orchestrator notes — where the brief mischaracterized a conflict

- **§5 undo/redo is NOT cleanly "we have both + adopt keyboard."** It's a real **conflict**: your §5 *removes* the
  dock copies, and we deliberately keep them (Q7). The keyboard handler + press-flash are the cleanly-adopted
  parts; the de-dupe is the contested part. I split it accordingly.
- **Font picker "combo bug never existed in our code" is true but for a different reason than implied:** ours isn't
  a fixed-stepper-fallthrough that happens to work — our font row is **display-only** (no editable control at all
  yet). So it's STALE-as-bug *and* a genuine ADOPT for the feature. Flagged both.
- **"Coming soon stub → defer to AnimSection" undersells it:** AnimSection is **already wired into the Editor**
  (`Editor.tsx:742`) and shipping. The stub in ControlsRail is dead code we owe a cleanup *independent* of the
  changelog — so this is less "build the real entry" and more "delete our own stale stub." Recharacterized as a
  CONFLICT/cleanup rather than a plain STALE.
- **§10 token:** the brief said "optional `KSS_MCP_TOKEN`" — confirmed, but worth stressing the popover currently
  shows `Bearer` unconditionally; with no token set there is **no auth at all**, so the popover would mislead.
  That's a correctness note, not just a value tweak.
- Everything else in the brief checked out against the code (B-cluster scope, band-height rationale, time-ordered
  range, waveform commit `27c5ce1`, the four animation tools, migration-on-open).
