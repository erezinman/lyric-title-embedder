# Writer G — Playwright e2e tier findings

Tier: real daemon (port 8799, temp projects dir, seeded "audit") + real vite (5199)
+ chromium. Specs assert BOTH `/api/state` (daemon truth) AND rendered UI/CSS/geometry,
with revert symmetry. 44 tests total; 38 pass green, 6 are genuine findings annotated
`test.fail()` (Playwright reports them as expected-failures, suite is all-green).

Run: `cd web && npx playwright test`

---

## G-01 — placement.spec.ts — alignment change via UI is not undoable

- **Interaction:** Project rail → 3×3 align grid → pick Top-Center (8). Then `apiCall("undo")`.
- **Observed:** Forward step works — `state.placement.align` goes 2 → 8 and the live
  caption jumps to the top of the stage. After `undo`, **`state.placement.align` stays 8**
  (never returns to 2). State diff after undo: `{align: 8}` (expected `{align: 2}`).
- **Expected:** Undo should restore `align` to its pre-edit value (2).
- **Suspicion:** `Editor` dispatches alignment via `dispatch("set_globals", {partial})`.
  `set_globals` writes straight into `HeadlessContext._g` (`mcp_server/context.py`
  `set_globals`) and fires a state broadcast, but it never goes through
  `ctx.session.do(...)` / the undo stack the way cue/word ops do. So no placement /
  globals mutation is captured in history. Confirmed in isolation:
  `set_globals({align:8})` → `undo` leaves align at 8 both via UI and side-channel.

## G-03 — placement.spec.ts — box-body drag writes margins + moves caption, but revert (undo) doesn't restore margins

- **Interaction:** Drag the `.bbox` body up-and-left; assert margins + caption geometry;
  then revert via `apiCall("undo")`.
- **Observed:** Forward is correct — dragging up-left drives `margin_l` down (clamps to 0),
  `margin_v` up (221 from 60), and the `.cap` boundingBox moves up (y 328→279) and left
  (x 367→327). But the revert fails: after `undo`, margins stay at the dragged values.
  State diff after undo: `{margin_l:0, margin_r:160, margin_v:221}` (expected the seeded
  `{margin_l:80, margin_r:80, margin_v:60}`).
- **Expected:** Undo should restore the pre-drag margins.
- **Suspicion:** Same root cause as G-01 — the stage commits the drag via
  `onPlacement → dispatch("set_globals", {partial: margins})`, which bypasses the undo
  stack. Verified directly: `set_globals({margin_l:200, margin_v:200})` → `undo` leaves
  200/200.

## G-22 — inspector.spec.ts — CUE bold toggle does not round-trip to inherited

- **Interaction:** Select a word, Inspector → CUE tier → click the Bold toggle twice.
- **Observed:** Global bold is `true`. First click writes an explicit override
  `tok.style.bold = false`; second click writes explicit `true`. The override is **never
  cleared** — `tok.style.bold` is `true` after two toggles (expected `undefined`/inherited).
- **Expected:** Toggling an inherited boolean twice should leave the cue back in the
  inherited state (`bold` absent), symmetric with the start.
- **Suspicion:** `PropRow` toggle handler is `onSet(pkey, !val)` (StyleWaterfall.tsx) — it
  always writes a concrete boolean and has no "clear when it equals the inherited value"
  path. Unlike steppers/colors it offers no clear affordance for the inherited case, so an
  inherited boolean can only ever become a sticky override. (Other prop kinds expose a
  `.pclear` button; the toggle's only clear path would be the same button, which appears
  only once an override exists — but the value never reverts on its own.)

## G-35 — shell.spec.ts — stage is not rendered 16:9 (squash bug)

- **Interaction:** Open editor; measure `.stage` boundingBox (also after a dock-splitter
  drag).
- **Observed:** `.stage` declares `aspect-ratio: 16 / 9` in computed CSS, but the rendered
  box is **~2.85:1** (e.g. 954 × 335). The element is stretched to fill its center column
  width/height instead of being constrained/letterboxed to 16:9. Drag changes the size but
  the ratio stays far from 1.77–1.79.
- **Expected:** The preview stage should keep a 16:9 ratio (1.77–1.79) so the libass/CSS
  preview matches the export canvas; otherwise on-screen geometry (caption placement, box
  drags) is distorted relative to the real 1920×1080 render.
- **Suspicion:** `aspect-ratio` is being overridden by an explicit height (the flex column /
  `.center` layout forces `.stage` to fill available height), so `aspect-ratio` is ignored.
  Needs `max-width`/`max-height` letterboxing or a wrapper that honors the ratio. This is the
  "squash" class flagged in the brief.

## G-50 — external-sync.spec.ts — side-channel set_globals(align) lands in UI but is not undoable

- **Interaction:** `apiCall("set_globals", {partial:{align:8}})` (no UI), assert UI reflects
  it (Project rail align label "Top-Center"), then `apiCall("undo")`.
- **Observed:** Forward works (align→8, label updates, `.toast.ai` shows). After undo,
  `state.placement.align` stays 8 (expected 2).
- **Expected:** Undo reverts align to 2.
- **Suspicion:** Same root cause as G-01/G-03 — `set_globals` is outside the undo history.

## G-51 — external-sync.spec.ts — side-channel set_globals(use_pos+pos) lands but is not undoable

- **Interaction:** `apiCall("set_globals", {partial:{use_pos:true, pos:[960,540]}})`,
  assert the `.pinbox` replaces `.bbox`, then `apiCall("undo")`.
- **Observed:** Forward works (use_pos→true, pin appears). After undo,
  `state.placement.use_pos` stays `true` and `pos` stays `[960,540]` (expected
  `use_pos:false`/falsy, `pos:null`), and the bbox does not return.
- **Expected:** Undo clears `use_pos`/`pos` and restores the margin bbox.
- **Suspicion:** Same root cause — placement/globals mutations bypass the undo stack.

---

## Notes / non-findings

- **Common root cause:** G-01, G-03, G-50, G-51 are one underlying bug — every
  `set_globals` mutation (align, margins, use_pos/pos, and by extension fontsize/colors at
  the *global* tier) is applied directly to `HeadlessContext._g` and is **not recorded in
  the session undo history**. Cue/word/group/layout/fade ops (which go through
  `ctx.session.do`) DO undo correctly (verified green in G-20…G-49). A single fix (route
  `set_globals` through the undo stack) closes all four.
- **Daemon-restart resilience** (export.spec battery / brief item 5): **skipped** — the
  global-setup spawns the daemon once for the whole run and teardown kills it; there is no
  deterministic per-spec restart hook, and killing/respawning the shared daemon mid-run
  would break workers:1 serial state. Not deterministic in this harness → not attempted.
- **Burn without video** (export.spec): not asserted as a forced error — the seeded "audit"
  project has no real video and the brief says not to actually burn. G-60/G-61 assert the
  Export form only; G-62 asserts a real `.ass` browser download (filename `audit.ass`,
  non-empty, contains `[Script Info]`) which passes.
- Helpers/global-setup were NOT modified (no blocking bug found).
