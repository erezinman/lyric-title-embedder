import { describe, it, expect } from "vitest";
import { cueSpan, computeMove, computeResize, dragMode } from "./edit";
import type { Project, Token } from "../types";

const W = [
  { text: "a", start: 1.0, end: 1.5 },
  { text: "b", start: 2.0, end: 2.5 },
  { text: "c", start: 3.0, end: 3.4 },
];
const tok = (ids: number[]): Token => ({ ids, sep: " ", del: false, style: {} });
function proj(): Project {
  return {
    words: W.map((w) => ({ ...w })),
    layout: [], fin_tags: [], fout_tags: [],
    globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 },
    global_style: { font: "x", fontsize: 64, bold: true, primary: "#fff", outline: "#000", back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 0, margin_r: 0, margin_v: 0, pos: null },
    video: null,
  };
}

describe("cueSpan", () => {
  it("min start / max end across member words", () => {
    expect(cueSpan(proj(), tok([0, 1]))).toEqual({ start: 1.0, end: 2.5 });
  });
});
describe("computeMove", () => {
  it("shifts all words by the same delta (diffs preserved)", () => {
    const u = computeMove(proj(), [tok([0]), tok([2])], 0.5);
    expect(u).toEqual([{ wid: 0, start: 1.5, end: 2.0 }, { wid: 2, start: 3.5, end: 3.9 }]);
  });
  it("clamps so the earliest start cannot go below 0", () => {
    const u = computeMove(proj(), [tok([0]), tok([1])], -5);
    expect(u[0]).toEqual({ wid: 0, start: 0, end: 0.5 });
    expect(u[1]).toEqual({ wid: 1, start: 1.0, end: 1.5 });
  });
});
describe("computeResize", () => {
  it("resize end moves the latest word's end", () => {
    expect(computeResize(proj(), tok([0]), "end", 0.3)).toEqual([{ wid: 0, start: 1.0, end: 1.8 }]);
  });
  it("resize start clamps below word end minus minSpan", () => {
    const u = computeResize(proj(), tok([0]), "start", 5, 0.05);
    expect(u[0].wid).toBe(0);
    expect(u[0].end).toBe(1.5);
    expect(u[0].start).toBeCloseTo(1.45);
  });
});
describe("dragMode", () => {
  it("classifies edges vs body, narrow → move", () => {
    expect(dragMode(2, 100)).toBe("resize-start");
    expect(dragMode(96, 100)).toBe("resize-end");
    expect(dragMode(50, 100)).toBe("move");
    expect(dragMode(2, 18)).toBe("move");
  });
});
