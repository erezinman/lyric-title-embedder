import { describe, it, expect } from "vitest";
import { layoutBars, BLOCK_H, MAX_VISIBLE, BAR_H, TEXT_H, GAP, TINY_PX } from "./animStrips";
import type { ResolvedAnim } from "../types";

const A = (channel: string, t0: number, t1: number): ResolvedAnim =>
  ({ channel, segments: [{ t0, t1 }] } as unknown as ResolvedAnim);

describe("animStrips layoutBars (constant-height)", () => {
  it("BLOCK_H = TEXT_H + MAX_VISIBLE*BAR_H + (MAX_VISIBLE-1)*GAP + 7 (=55)", () => {
    expect(BLOCK_H).toBe(TEXT_H + MAX_VISIBLE * BAR_H + (MAX_VISIBLE - 1) * GAP + 7);
  });
  it("bars get constant px tops (TEXT_H + i*(BAR_H+GAP)) and height BAR_H", () => {
    const r = layoutBars([A("primary", 0, 0.5), A("alpha", 0, 0.5)], 0, 100);
    expect(r.bars[0].topPx).toBe(TEXT_H);
    expect(r.bars[1].topPx).toBe(TEXT_H + (BAR_H + GAP));
    expect(r.bars[0].heightPx).toBe(BAR_H);
  });
  it("<=3 anims -> overflowCount 0; >3 -> overflowCount = n-3, only 3 bars shown", () => {
    const three = layoutBars([A("primary",0,1),A("alpha",0,1),A("size",0,1)], 0, 100);
    expect(three.overflowCount).toBe(0);
    expect(three.bars.length).toBe(3);
    const five = layoutBars([A("primary",0,1),A("alpha",0,1),A("size",0,1),A("move",0,1),A("glow",0,1)], 0, 100);
    expect(five.overflowCount).toBe(2);
    expect(five.bars.length).toBe(MAX_VISIBLE);
    expect(five.fullCount).toBe(5);
  });
  it("width < TINY_PX -> glyph kind, else bar", () => {
    const narrow = layoutBars([A("primary", 0, 0.1)], 0, 100); // 10px < 18
    expect(narrow.bars[0].widthPx).toBeLessThan(TINY_PX);
    expect(narrow.bars[0].kind).toBe("glyph");
    const wide = layoutBars([A("primary", 0, 1)], 0, 100); // 100px
    expect(wide.bars[0].kind).toBe("bar");
  });
  it("allBars: full layout for the overlay (no MAX_VISIBLE cap)", () => {
    const r = layoutBars([A("primary",0,1),A("alpha",0,1),A("size",0,1),A("move",0,1),A("glow",0,1)], 0, 100, { all: true });
    expect(r.bars.length).toBe(5);
    expect(r.bars[4].topPx).toBe(TEXT_H + 4 * (BAR_H + GAP));
  });
});
