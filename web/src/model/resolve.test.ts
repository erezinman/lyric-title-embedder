import { describe, it, expect } from "vitest";
import { resolveStyle, resolveFade, eventWindow, wordSchedule } from "./resolve";
import type { Project } from "../types";

function demo(): Project {
  return {
    words: [
      { text: "Caught", start: 0.3, end: 0.7 }, { text: "in", start: 0.8, end: 1.0 },
      { text: "a", start: 1.05, end: 1.2 }, { text: "bleat", start: 1.4, end: 2.0 },
      { text: "Tangled", start: 3.7, end: 4.2 }, { text: "up", start: 4.25, end: 4.45 },
    ],
    layout: [
      { label: "V1", accumulate: "words", win_start: null, win_end: null, linger: null, del: false,
        style: { fontsize: 72 }, fade: {},
        lines: [{ toks: [
          { ids: [0], sep: "", del: false, style: {} },
          { ids: [1], sep: "", del: false, style: {} },
          { ids: [2], sep: "", del: false, style: {} },
          { ids: [3], sep: "", del: false, style: { primary: "#FF3DA6" } },
        ] }] },
      { label: "C", accumulate: "lines", win_start: null, win_end: null, linger: 0.4, del: false,
        style: {}, fade: { fade_in_ms: 400 },
        lines: [{ toks: [
          { ids: [4], sep: "", del: false, style: {} },
          { ids: [5], sep: "", del: false, style: {} },
        ] }] },
    ],
    fin_tags: [{ ids: [0,1,2], trigger: null }],
    fout_tags: [{ ids: [3], trigger: 15.4 }],
    globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0.0 },
    global_style: { font: "Space Grotesk", fontsize: 64, bold: true, primary: "#FFFFFF",
      outline: "#000000", back: "#000000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, pos: null },
    video: null,
  };
}

describe("resolveStyle (cue -> group -> global)", () => {
  it("cue override wins", () => {
    const p = demo();
    const tok = p.layout[0].lines[0].toks[3];
    expect(resolveStyle(p, 0, tok).primary.value).toBe("#FF3DA6");
    expect(resolveStyle(p, 0, tok).primary.src).toBe("cue");
  });
  it("group override beats global", () => {
    const p = demo();
    const r = resolveStyle(p, 0, p.layout[0].lines[0].toks[0]);
    expect(r.fontsize).toEqual({ value: 72, src: "group" });
  });
  it("falls back to global", () => {
    const p = demo();
    const r = resolveStyle(p, 0, p.layout[0].lines[0].toks[0]);
    expect(r.font).toEqual({ value: "Space Grotesk", src: "global" });
  });
  it("border_style is group->global only (never cue)", () => {
    const p = demo();
    const tok = { ...p.layout[0].lines[0].toks[0], style: { border_style: 3 } as any };
    expect(resolveStyle(p, 0, tok).border_style.src).not.toBe("cue");
  });
});

describe("resolveFade (group -> global)", () => {
  it("group override wins", () => {
    const p = demo();
    expect(resolveFade(p, 1)).toEqual({ fade_in_ms: 400, fade_out_ms: 1000 });
  });
  it("falls back to global when no override", () => {
    const p = demo();
    expect(resolveFade(p, 0)).toEqual({ fade_in_ms: 250, fade_out_ms: 1000 });
  });
});

describe("eventWindow", () => {
  it("auto start/end from member words + linger", () => {
    const p = demo();
    const [s, e] = eventWindow(p, 1);
    expect(s).toBeCloseTo(3.7);
    expect(e).toBeCloseTo(4.45 + 0.4);
  });
});

describe("wordSchedule", () => {
  it("accumulate=words: appearance = word start; fin tag with no trigger uses first member start", () => {
    const p = demo();
    const s = wordSchedule(p, 0, 0);
    expect(s.start_s).toBeCloseTo(0.3);
    expect(s.inFin).toBe(true);
    expect(s.fin_ms).toBe(250);
  });
  it("group fade override flows into fin_ms", () => {
    const p = demo();
    const s = wordSchedule(p, 1, 4);
    expect(s.fin_ms).toBe(400);
  });
  it("fout opt-in: word 3 has fout_at from its tag trigger", () => {
    const p = demo();
    const s = wordSchedule(p, 0, 3);
    expect(s.inFout).toBe(true);
    expect(s.fout_at).toBeCloseTo(15.4);
    expect(s.fout_ms).toBe(1000);
  });
});
