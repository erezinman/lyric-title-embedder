// bbox.ts — pure preview-box geometry in canvas (PlayRes) units.
// Mirrors the Tk implementation (app_base.py: _box_from_margins /
// _margins_from_box / _anchor_xy_playres). The vertical band is 18% of the
// canvas height (Tk's 0.18 factor).

export interface Box { l: number; t: number; r: number; b: number }
export interface PlacementState {
  align: number; play_w: number; play_h: number;
  margin_l: number; margin_r: number; margin_v: number;
  pos: [number, number] | null;
  use_pos?: boolean;   // engine renders \pos only when use_pos AND pos are set
}

/** True when the engine would actually render with \pos: use_pos AND a pos
 * coordinate. `use_pos` absent (old payloads/fixtures) falls back to pos-only. */
export const posActive = (p: PlacementState): boolean =>
  p.pos != null && (p.use_pos ?? true);

const BAND = 0.18;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function alignRow(align: number): "bottom" | "middle" | "top" {
  return align <= 3 ? "bottom" : align >= 7 ? "top" : "middle";
}
export function alignCol(align: number): "left" | "center" | "right" {
  const c = (align - 1) % 3;
  return c === 0 ? "left" : c === 1 ? "center" : "right";
}

export function anchorXY(box: Box, align: number): [number, number] {
  const col = alignCol(align), row = alignRow(align);
  const x = col === "left" ? box.l : col === "right" ? box.r : (box.l + box.r) / 2;
  const y = row === "bottom" ? box.b : row === "top" ? box.t : (box.t + box.b) / 2;
  return [Math.round(x), Math.round(y)];
}

export function boxFromState(p: PlacementState): Box {
  const W = p.play_w || 1920, H = p.play_h || 1080;
  const l = p.margin_l, r = W - p.margin_r;
  let t: number, b: number;
  const row = alignRow(p.align);
  if (row === "bottom") { b = H - p.margin_v; t = Math.max(0, b - H * BAND); }
  else if (row === "top") { t = p.margin_v; b = Math.min(H, t + H * BAND); }
  else { t = p.margin_v; b = H - p.margin_v; }
  let box: Box = { l, t, r, b };
  if (p.pos && posActive(p)) {
    const [ax, ay] = anchorXY(box, p.align);
    box = applyMove(box, p.pos[0] - ax, p.pos[1] - ay, W, H);
  }
  return box;
}

export function marginsFromBox(box: Box, p: PlacementState) {
  const W = p.play_w || 1920, H = p.play_h || 1080;
  const row = alignRow(p.align);
  const margin_v = row === "bottom" ? Math.round(H - box.b)
    : row === "top" ? Math.round(box.t)
    : Math.round(Math.min(box.t, H - box.b));
  return { margin_l: Math.max(0, Math.round(box.l)),
           margin_r: Math.max(0, Math.round(W - box.r)),
           margin_v: Math.max(0, margin_v) };
}

export function applyMove(box: Box, dx: number, dy: number, W: number, H: number): Box {
  const w = box.r - box.l, h = box.b - box.t;
  const l = clamp(box.l + dx, 0, W - w), t = clamp(box.t + dy, 0, H - h);
  return { l, t, r: l + w, b: t + h };
}

// ── Q4: placement snap + safe-area guides ──────────────────────────────────
// 2D-on-margins soft snap. The dragged edge/point magnetizes to the canvas
// centre lines and the 5% / 10% safe-area rectangle edges. Unlike the 1D
// timeline magnet (snap.ts, px-space), placement is per-axis canvas-space.

export interface SnapLocks { x: number | null; y: number | null }
export interface SnapBoxResult { box: Box; locks: SnapLocks }
export interface SnapPointResult { x: number; y: number; locks: SnapLocks }
interface SnapOpts { tol?: number; bypass?: boolean }

const DEFAULT_TOL_FRAC = 0.018; // ~1.8% of the stage dimension

/** Candidate snap x-lines: 5%, 10%, centre, 90%, 95% of the canvas width. */
export function snapTargetsX(W: number): number[] {
  return [W * 0.05, W * 0.1, W / 2, W * 0.9, W * 0.95];
}
/** Candidate snap y-lines: 5%, 10%, centre, 90%, 95% of the canvas height.
 *  (centre 50% coincides with no extra line beyond the four safe edges + mid). */
export function snapTargetsY(H: number): number[] {
  return [H * 0.05, H * 0.1, H / 2, H * 0.9, H * 0.95];
}

/** Nearest target to `v` within `tol`, or null. */
function nearestTarget(v: number, targets: number[], tol: number): number | null {
  let hit: number | null = null;
  let best = tol;
  for (const t of targets) {
    const d = Math.abs(t - v);
    if (d <= best) { best = d; hit = t; }
  }
  return hit;
}

/**
 * Snap a placement box during a drag. `mode` is "move" or an 8-handle code.
 * - move: shift the whole box so the nearest of {l, centre-x, r} / {t, centre-y, b}
 *   locks (per axis, independent), preserving size.
 * - resize handle: only the dragged edge(s) snap (w→l, e→r, n→t, s→b).
 * Returns the (possibly snapped) box and the locked canvas lines for guide render.
 */
export function snapPlacement(box: Box, mode: string, W: number, H: number, opts: SnapOpts = {}): SnapBoxResult {
  const locks: SnapLocks = { x: null, y: null };
  if (opts.bypass) return { box, locks };
  const tolX = opts.tol ?? W * DEFAULT_TOL_FRAC;
  const tolY = opts.tol ?? H * DEFAULT_TOL_FRAC;
  const tx = snapTargetsX(W), ty = snapTargetsY(H);
  let { l, t, r, b } = box;

  if (mode === "move") {
    // pick the single best reference per axis (whichever lands closest)
    const refsX: [number, "l" | "c" | "r"][] = [[l, "l"], [(l + r) / 2, "c"], [r, "r"]];
    let bestX: { shift: number; line: number } | null = null;
    for (const [v] of refsX) {
      const hit = nearestTarget(v, tx, tolX);
      if (hit != null) {
        const shift = hit - v;
        if (!bestX || Math.abs(shift) < Math.abs(bestX.shift)) bestX = { shift, line: hit };
      }
    }
    if (bestX) { l += bestX.shift; r += bestX.shift; locks.x = bestX.line; }

    const refsY: [number, "t" | "c" | "b"][] = [[t, "t"], [(t + b) / 2, "c"], [b, "b"]];
    let bestY: { shift: number; line: number } | null = null;
    for (const [v] of refsY) {
      const hit = nearestTarget(v, ty, tolY);
      if (hit != null) {
        const shift = hit - v;
        if (!bestY || Math.abs(shift) < Math.abs(bestY.shift)) bestY = { shift, line: hit };
      }
    }
    if (bestY) { t += bestY.shift; b += bestY.shift; locks.y = bestY.line; }
    return { box: { l, t, r, b }, locks };
  }

  // resize: snap only the dragged edge(s)
  if (mode.includes("w")) { const h = nearestTarget(l, tx, tolX); if (h != null) { l = h; locks.x = h; } }
  if (mode.includes("e")) { const h = nearestTarget(r, tx, tolX); if (h != null) { r = h; locks.x = h; } }
  if (mode.includes("n")) { const h = nearestTarget(t, ty, tolY); if (h != null) { t = h; locks.y = h; } }
  if (mode.includes("s")) { const h = nearestTarget(b, ty, tolY); if (h != null) { b = h; locks.y = h; } }
  return { box: { l, t, r, b }, locks };
}

/** Snap a pin anchor point to the centre / safe-area lines (per axis). */
export function snapPoint(x: number, y: number, W: number, H: number, opts: SnapOpts = {}): SnapPointResult {
  const locks: SnapLocks = { x: null, y: null };
  if (opts.bypass) return { x, y, locks };
  const hx = nearestTarget(x, snapTargetsX(W), opts.tol ?? W * DEFAULT_TOL_FRAC);
  const hy = nearestTarget(y, snapTargetsY(H), opts.tol ?? H * DEFAULT_TOL_FRAC);
  if (hx != null) { x = hx; locks.x = hx; }
  if (hy != null) { y = hy; locks.y = hy; }
  return { x, y, locks };
}

export function applyResize(box: Box, handle: string, dx: number, dy: number,
                            W: number, H: number, min = 40, symmetric = false): Box {
  // Q2 — symmetric (Shift): apply one shared delta to BOTH opposing margins,
  // keeping the center fixed; clamp the half-extent at min/2 so collapsing past
  // the minimum width stops without sliding the center.
  if (symmetric) {
    let { l, t, r, b } = box;
    if (handle.includes("w") || handle.includes("e")) {
      const cx = (l + r) / 2;
      // signed outward movement of the dragged edge from the center
      const half = handle.includes("e") ? (r + dx) - cx : cx - (l + dx);
      const h = Math.max(min / 2, half);
      l = cx - h; r = cx + h;
    }
    if (handle.includes("n") || handle.includes("s")) {
      const cy = (t + b) / 2;
      const half = handle.includes("s") ? (b + dy) - cy : cy - (t + dy);
      const h = Math.max(min / 2, half);
      t = cy - h; b = cy + h;
    }
    return { l, t, r, b };
  }
  let { l, t, r, b } = box;
  if (handle.includes("w")) l = clamp(l + dx, 0, r - min);
  if (handle.includes("e")) r = clamp(r + dx, l + min, W);
  if (handle.includes("n")) t = clamp(t + dy, 0, b - min);
  if (handle.includes("s")) b = clamp(b + dy, t + min, H);
  return { l, t, r, b };
}
