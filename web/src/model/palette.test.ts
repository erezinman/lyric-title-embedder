import { describe, it, expect } from "vitest";
import { PALETTE, colorForIndex, eventColor } from "./palette";

describe("palette", () => {
  it("has 10 brand colors", () => { expect(PALETTE).toHaveLength(10); });
  it("colorForIndex wraps at 10", () => {
    expect(colorForIndex(0)).toBe(PALETTE[0]);
    expect(colorForIndex(10)).toBe(PALETTE[0]);
    expect(colorForIndex(13)).toBe(PALETTE[3]);
  });
  it("eventColor: stored color wins, else index default", () => {
    expect(eventColor({ color: "#abcdef" }, 3)).toBe("#abcdef");
    expect(eventColor({}, 3)).toBe(colorForIndex(3));
    expect(eventColor(undefined, 0)).toBe(colorForIndex(0));
  });
});
