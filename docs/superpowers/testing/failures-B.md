# Cluster B — Placement interaction audit: findings

Writer Agent B. Cluster: PreviewStage, Waveform, ControlsRail, AlignGrid.
Files:
- `web/src/components/stage/PreviewStage.audit.test.tsx` (39 tests)
- `web/src/components/stage/Waveform.audit.test.tsx` (8 tests)
- `web/src/components/panels/ControlsRail.audit.test.tsx` (13 tests)
- `web/src/components/atoms/AlignGrid.audit.test.tsx` (25 tests)

Total: 85 tests. 84 passing, 1 registered failure (`it.fails`).

---

## B-16 — DOUBLE clamped drag-back does NOT net the original margins (asymmetry at the canvas wall)

- **Test:** `PreviewStage.audit.test.tsx` › "B-16 — DOUBLE clamped drag-back SHOULD net the original margins (asymmetry at the wall)" — marked `it.fails`.
- **Setup:** bottom-center box (margins 80/80/60 → box `l:80,r:1840`, width 1760). Body-drag RIGHT by +100 canvas px, server echoes the committed margins, then body-drag LEFT by −100 canvas px from the echoed box.
- **Observed:** First commit `{margin_l:160, margin_r:0, margin_v:60}` — the box's right edge hits the canvas wall (`r` clamped at 1920), so the +100 request only moved the box +80. The echoed box starts at `l:160,r:1920`. The −100 drag-back commits `{margin_l:60, margin_r:100, margin_v:60}`.
- **Expected (per the audit's DOUBLE template — "drag-then-drag-back nets the original committed values"):** `{margin_l:80, margin_r:80, margin_v:60}`.
- **Suspicion:** `applyMove` (model/bbox.ts) clamps the box position to `[0, W-w]` on every move and discards the overshoot. A drag that pushes the box into a wall loses the "excess" delta, so the symmetric reverse drag cannot recover the original offset — the round-trip is lossy whenever either drag saturates an edge. This is inherent to per-commit clamping with no memory of the un-clamped pointer delta. It only manifests at the walls; non-saturating doubles round-trip cleanly (verified by B-15, which uses a ±40 drag that never clamps and **passes**).
- **Not a test bug:** the geometry expectation is computed from the real oracle; the failure reflects product behavior diverging from the template's symmetry contract. Left as `it.fails` per the iron rules (do not fix product code, do not weaken the assertion).

---

## Notes on non-findings (passing, but worth recording)

- **B-15 / B-21 / B-30 (clean doubles):** body-move, `w`-resize, and pin-drag round-trips with non-saturating deltas all net the exact original committed values via the oracle — symmetry holds away from the walls.
- **B-22 (band-height persistence):** an `n`-handle resize on a bottom-anchored box keeps `margin_v` constant and the grown band height survives an identical-margins echo (matches `PreviewStage.cap.test.tsx`).
- **B-50 (AlignGrid gating):** `use_pos:false` + `pos` set ⇒ `posActive` false ⇒ AlignGrid stays **enabled**, confirming the gate keys off `posActive`, not the bare presence of `pos`.
- **B-37 / B-39 (Waveform right edge):** a click at fraction 1 (and any click past the right edge) clamps to exactly `dur`, never overshoots.

## Harness note (not a product issue)

`ControlsRail.audit.test.tsx` B-53 emits a React `act(...)` warning to stderr. It originates from FakeWS's deferred `setTimeout(onopen)` resolving during the multi-echo sequence, not from an unwrapped state update in the assertions (toggle clicks are wrapped in `act`). The test passes; the warning is a shared-harness artifact.
