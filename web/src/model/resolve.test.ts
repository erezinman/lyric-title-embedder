import { describe, it, expect } from "vitest";
import { resolveStyle, eventWindow, wordSchedule } from "./resolve";
import type { Project } from "../types";
import { fadeInAnim, fadeOutAnim } from "./animPresets";

function demo(): Project {
  return {
    words: [
      { text: "Caught", start: 0.3, end: 0.7 }, { text: "in", start: 0.8, end: 1.0 },
      { text: "a", start: 1.05, end: 1.2 }, { text: "bleat", start: 1.4, end: 2.0 },
      { text: "Tangled", start: 3.7, end: 4.2 }, { text: "up", start: 4.25, end: 4.45 },
    ],
    layout: [
      { label: "V1", win_start: null, win_end: null, linger: null, del: false,
        style: { fontsize: 72 }, animations: [], suppress: [],
        lines: [{ toks: [
          { ids: [0], sep: "", del: false, style: {} },
          { ids: [1], sep: "", del: false, style: {} },
          { ids: [2], sep: "", del: false, style: {} },
          { ids: [3], sep: "", del: false, style: { primary: "#FF3DA6" } },
        ] }] },
      { label: "C", win_start: null, win_end: null, linger: 0.4, del: false,
        style: {}, animations: [], suppress: [],
        lines: [{ toks: [
          { ids: [4], sep: "", del: false, style: {} },
          { ids: [5], sep: "", del: false, style: {} },
        ] }] },
    ],
    // animations model: fade-in on words 0-2, fade-out on word 3
    anim_tags: [
      { ids: [0, 1, 2], anims: [fadeInAnim("a1")], suppress: [] },
      { ids: [3], anims: [fadeOutAnim("a2")], suppress: [] },
    ],
    globals: { linger: 0.0, animations: [] },
    global_style: { font: "Space Grotesk", fontsize: 64, bold: true, primary: "#FFFFFF",
      outline: "#000000", back: "#000000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2 },
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

describe("eventWindow", () => {
  it("auto start/end from member words + linger", () => {
    const p = demo();
    const [s, e] = eventWindow(p, 1);
    expect(s).toBeCloseTo(3.7);
    expect(e).toBeCloseTo(4.45 + 0.4);
  });
});

describe("wordSchedule (animations model)", () => {
  it("appearance = word start (per-cue, accumulate is gone)", () => {
    const p = demo();
    expect(wordSchedule(p, 0, 0).start_s).toBeCloseTo(0.3);
  });
  it("fade-in membership derived from an anim_tag carrying a fade_in alpha anim", () => {
    const p = demo();
    expect(wordSchedule(p, 0, 0).inFin).toBe(true);
    expect(wordSchedule(p, 0, 3).inFin).toBe(false);
  });
  it("fade-out opt-in: word 3 has fout_at anchored at its cue_end (word end)", () => {
    const p = demo();
    const s = wordSchedule(p, 0, 3);
    expect(s.inFout).toBe(true);
    expect(s.fout_at).toBeCloseTo(2.0);
  });
  it("no fade-out anim → inFout false, fout_at null", () => {
    const p = demo();
    const s = wordSchedule(p, 0, 0);
    expect(s.inFout).toBe(false);
    expect(s.fout_at).toBeNull();
  });
});
