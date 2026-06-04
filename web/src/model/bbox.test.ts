import { describe, it, expect } from "vitest";
import { boxFromState, marginsFromBox, anchorXY, applyMove, applyResize, posActive } from "./bbox";
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
