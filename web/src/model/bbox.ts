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

export function applyResize(box: Box, handle: string, dx: number, dy: number,
                            W: number, H: number, min = 40): Box {
  let { l, t, r, b } = box;
  if (handle.includes("w")) l = clamp(l + dx, 0, r - min);
  if (handle.includes("e")) r = clamp(r + dx, l + min, W);
  if (handle.includes("n")) t = clamp(t + dy, 0, b - min);
  if (handle.includes("s")) b = clamp(b + dy, t + min, H);
  return { l, t, r, b };
}
