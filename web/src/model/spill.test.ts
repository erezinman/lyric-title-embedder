import { describe, it, expect } from "vitest";
import { cueExtent } from "./spill";
import type { ResolvedAnim } from "../types";

const seg = (start_s: number, end_s: number) => ({ start_s, end_s, from: 0, to: 1, accel: 1 });
const anim = (segs: { start_s: number; end_s: number }[]): ResolvedAnim =>
  ({ id: "a", name: "x", channel: "alpha", segments: segs as ResolvedAnim["segments"] });
const words = [{ text: "a", start: 1.0, end: 2.0 }];

describe("cueExtent", () => {
  it("no anims → no spill, window = word atoms", () => {
    const r = cueExtent(words, []);
    expect([r.s, r.e]).toEqual([1.0, 2.0]);
    expect(r.spillBefore).toBe(false);
    expect(r.spillAfter).toBe(false);
  });
  it("anim ending after cue end → spillAfter with positive delta", () => {
    const r = cueExtent(words, [anim([seg(1.8, 2.3)])]);
    expect(r.spillAfter).toBe(true);
    expect(r.afterDelta).toBeCloseTo(0.3, 5);
    expect(r.spillBefore).toBe(false);
  });
  it("anim starting before cue start → spillBefore", () => {
    const r = cueExtent(words, [anim([seg(0.85, 1.5)])]);
    expect(r.spillBefore).toBe(true);
    expect(r.beforeDelta).toBeCloseTo(0.15, 5);
    expect(r.spillAfter).toBe(false);
  });
  it("in-window anim (fade-in) → no spill either side", () => {
    const r = cueExtent(words, [anim([seg(1.0, 1.4)])]);
    expect(r.spillBefore).toBe(false);
    expect(r.spillAfter).toBe(false);
  });
  it("min/max across multiple anims & segments", () => {
    const r = cueExtent(words, [anim([seg(0.9, 1.2)]), anim([seg(1.5, 2.5)])]);
    expect(r.spillBefore).toBe(true);
    expect(r.spillAfter).toBe(true);
  });
  it("multi-word cue uses min start / max end of atoms", () => {
    const r = cueExtent([{ start: 1, end: 1.5 }, { start: 1.5, end: 3 }], []);
    expect([r.s, r.e]).toEqual([1, 3]);
  });
});
