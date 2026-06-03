import { describe, it, expect } from "vitest";
import { PALETTE, colorForIndex } from "./palette";

describe("palette", () => {
  it("has 10 brand colors", () => { expect(PALETTE).toHaveLength(10); });
  it("colorForIndex wraps at 10", () => {
    expect(colorForIndex(0)).toBe(PALETTE[0]);
    expect(colorForIndex(10)).toBe(PALETTE[0]);
    expect(colorForIndex(13)).toBe(PALETTE[3]);
  });
});
