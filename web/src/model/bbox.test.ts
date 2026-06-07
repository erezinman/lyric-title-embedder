import { describe, it, expect } from "vitest";
import { boxFromState, marginsFromBox, anchorXY, applyMove, applyResize, posActive,
  snapTargetsX, snapTargetsY, snapPlacement, snapPoint } from "./bbox";
import type { PlacementState } from "./bbox";

const base: PlacementState = { align: 2, play_w: 1920, play_h: 1080,
  margin_l: 80, margin_r: 80, margin_v: 60, pos: null };

describe("bbox geometry", () => {
  it("bottom-aligned box from margins", () => {
    const b = boxFromState(base);
    expect(b.l).toBe(80); expect(b.r).toBe(1840);
    expect(b.b).toBe(1020); expect(b.t).toBeCloseTo(1020 - 0.18 * 1080, 5);
  });

  it("top-aligned box from margins", () => {
    const b = boxFromState({ ...base, align: 8 });
    expect(b.t).toBe(60); expect(b.b).toBeCloseTo(60 + 0.18 * 1080, 5);
  });

  it("margins->box->margins round-trips", () => {
    for (const align of [2, 5, 8]) {
      const p = { ...base, align };
      expect(marginsFromBox(boxFromState(p), p)).toEqual(
        { margin_l: 80, margin_r: 80, margin_v: 60 });
    }
  });

  it("anchor per alignment", () => {
    const b = { l: 100, t: 200, r: 500, b: 400 };
    expect(anchorXY(b, 2)).toEqual([300, 400]);   // bottom-center
    expect(anchorXY(b, 7)).toEqual([100, 200]);   // top-left
    expect(anchorXY(b, 6)).toEqual([500, 300]);   // mid-right
  });

  it("posActive requires use_pos (when present) AND a pos", () => {
    expect(posActive(base)).toBe(false);                                        // no pos
    expect(posActive({ ...base, pos: [1, 2] })).toBe(true);                     // use_pos absent -> pos decides
    expect(posActive({ ...base, pos: [1, 2], use_pos: true })).toBe(true);
    expect(posActive({ ...base, pos: [1, 2], use_pos: false })).toBe(false);    // agent disabled \pos
  });

  it("boxFromState ignores a stale pos when use_pos is false", () => {
    const margins = boxFromState(base);
    const stale = boxFromState({ ...base, pos: [10, 10], use_pos: false });
    expect(stale).toEqual(margins);
  });

  it("pos pins the anchor", () => {
    const p = { ...base, pos: [960, 540] as [number, number] };
    const b = boxFromState(p);
    expect(anchorXY(b, p.align)).toEqual([960, 540]);
  });

  it("move clamps to canvas", () => {
    const b = boxFromState(base);
    const moved = applyMove(b, -10000, 10000, 1920, 1080);
    expect(moved.l).toBe(0); expect(moved.b).toBe(1080);
    expect(moved.r - moved.l).toBeCloseTo(b.r - b.l, 5);
  });

  it("resize respects min size and canvas", () => {
    const b = { l: 100, t: 100, r: 300, b: 300 };
    const r1 = applyResize(b, "e", -10000, 0, 1920, 1080);
    expect(r1.r).toBe(100 + 40);                  // min 40
    const r2 = applyResize(b, "se", 10000, 10000, 1920, 1080);
    expect(r2.r).toBe(1920); expect(r2.b).toBe(1080);
  });
});

// Q2 — symmetric resize (Shift modifier): one shared delta to BOTH opposing
// margins, keeping the center fixed; stop at min width without sliding center.
describe("bbox symmetric resize (Q2)", () => {
  const cx = (b: { l: number; r: number }) => (b.l + b.r) / 2;
  const cy = (b: { t: number; b: number }) => (b.t + b.b) / 2;

  it("'e' handle symmetric: dragged edge +dx, opposite edge -dx, center fixed", () => {
    const b = { l: 100, t: 100, r: 300, b: 300 };
    const r = applyResize(b, "e", 40, 0, 1920, 1080, 40, true);
    expect(r.r).toBe(340);                 // dragged edge +40
    expect(r.l).toBe(60);                  // opposite edge mirrored -40
    expect(cx(r)).toBeCloseTo(cx(b), 5);   // center fixed
    expect(r.t).toBe(100); expect(r.b).toBe(300); // vertical untouched
  });

  it("'w' handle symmetric: dragged edge +dx, opposite edge -dx, center fixed", () => {
    const b = { l: 100, t: 100, r: 300, b: 300 };
    const r = applyResize(b, "w", -40, 0, 1920, 1080, 40, true);
    expect(r.l).toBe(60);                  // dragged left edge -40
    expect(r.r).toBe(340);                 // opposite edge mirrored +40
    expect(cx(r)).toBeCloseTo(cx(b), 5);
  });

  it("'n' handle symmetric: vertical shared delta, center fixed", () => {
    const b = { l: 100, t: 100, r: 300, b: 300 };
    const r = applyResize(b, "n", 0, -50, 1920, 1080, 40, true);
    expect(r.t).toBe(50);                  // dragged top edge -50
    expect(r.b).toBe(350);                 // opposite edge mirrored +50
    expect(cy(r)).toBeCloseTo(cy(b), 5);
  });

  it("symmetric stops at min width WITHOUT sliding the center", () => {
    const b = { l: 100, t: 100, r: 300, b: 300 }; // center x = 200, width 200
    // collapse 'e' inward hugely; min width 40 → half-width 20 → l=180, r=220
    const r = applyResize(b, "e", -10000, 0, 1920, 1080, 40, true);
    expect(r.r - r.l).toBeGreaterThanOrEqual(40);
    expect(r.r - r.l).toBeCloseTo(40, 5);
    expect(cx(r)).toBeCloseTo(200, 5);     // center did NOT slide
    expect(r.l).toBe(180); expect(r.r).toBe(220);
  });

  it("symmetric corner 'se' applies shared delta on both axes, center fixed", () => {
    const b = { l: 100, t: 100, r: 300, b: 300 };
    const r = applyResize(b, "se", 30, 20, 1920, 1080, 40, true);
    expect(r.r).toBe(330); expect(r.l).toBe(70);  // x mirrored
    expect(r.b).toBe(320); expect(r.t).toBe(80);  // y mirrored
    expect(cx(r)).toBeCloseTo(cx(b), 5);
    expect(cy(r)).toBeCloseTo(cy(b), 5);
  });

  it("default (symmetric=false) is unchanged from per-side behavior", () => {
    const b = { l: 100, t: 100, r: 300, b: 300 };
    expect(applyResize(b, "e", 40, 0, 1920, 1080)).toEqual(applyResize(b, "e", 40, 0, 1920, 1080, 40, false));
    expect(applyResize(b, "e", 40, 0, 1920, 1080, 40, false)).toEqual({ l: 100, t: 100, r: 340, b: 300 });
  });
});

// Q4 — placement snap + safe-area guide targets (2D, on margins).
describe("bbox snap targets (Q4)", () => {
  it("snapTargetsX = center + 5%/10%/90%/95% of width", () => {
    expect(snapTargetsX(1920)).toEqual([96, 192, 960, 1728, 1824]);
  });
  it("snapTargetsY = 5%/10%/center/90%/95% of height", () => {
    expect(snapTargetsY(1080)).toEqual([54, 108, 540, 972, 1026]);
  });
});

describe("bbox snapPlacement (Q4)", () => {
  const W = 1920, H = 1080;
  const tol = 0.018 * W; // ~34.56 px in canvas space

  it("resize 'e': dragged right edge locks to the nearest target within tolerance", () => {
    // right edge at 1700 → nearest target 1728 (90%), within tol ~34.56
    const box = { l: 80, t: 800, r: 1700, b: 1020 };
    const { box: snapped, locks } = snapPlacement(box, "e", W, H, { tol });
    expect(snapped.r).toBe(1728);
    expect(snapped.l).toBe(80);       // only the dragged edge moved
    expect(locks.x).toBe(1728);
    expect(locks.y).toBeNull();
  });

  it("resize 'e': no lock when the edge is outside tolerance", () => {
    const box = { l: 80, t: 800, r: 1500, b: 1020 }; // 1500 far from any target
    const { box: snapped, locks } = snapPlacement(box, "e", W, H, { tol });
    expect(snapped.r).toBe(1500);
    expect(locks.x).toBeNull();
  });

  it("Alt bypass: no snap even when within tolerance", () => {
    const box = { l: 80, t: 800, r: 1700, b: 1020 };
    const { box: snapped, locks } = snapPlacement(box, "e", W, H, { tol, bypass: true });
    expect(snapped.r).toBe(1700);
    expect(locks.x).toBeNull();
    expect(locks.y).toBeNull();
  });

  it("move: whole box shifts so the nearest reference snaps; both axes can lock", () => {
    // center-x at 950 (→ snaps to 960, +10 shift); top at 100 (→ snaps to 108, +8 shift)
    const box = { l: 150, t: 100, r: 1750, b: 900 }; // cx = 950
    const { box: snapped, locks } = snapPlacement(box, "move", W, H, { tol });
    expect((snapped.l + snapped.r) / 2).toBe(960); // center-x locked
    expect(locks.x).toBe(960);
    // width preserved
    expect(snapped.r - snapped.l).toBe(1600);
    // top edge near 108 (10%) → locks y
    expect(snapped.t).toBe(108);
    expect(locks.y).toBe(108);
  });

  it("pin: snapPoint locks the anchor to center/ safe targets within tol", () => {
    const { x, y, locks } = snapPoint(955, 50, W, H, { tol });
    expect(x).toBe(960);              // center-x
    expect(y).toBe(54);               // 5% top
    expect(locks.x).toBe(960);
    expect(locks.y).toBe(54);
  });

  it("pin: Alt bypass leaves the point untouched", () => {
    const { x, y, locks } = snapPoint(955, 50, W, H, { tol, bypass: true });
    expect(x).toBe(955); expect(y).toBe(50);
    expect(locks.x).toBeNull(); expect(locks.y).toBeNull();
  });
});
