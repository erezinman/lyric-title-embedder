import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { WordTrack } from "./WordTrack";
import type { Project } from "../../types";

const words = [
  { wid: 0, text: "a", s: 1, e: 1.5, gi: 0, li: 0, ti: 0 },
  { wid: 1, text: "b", s: 2, e: 2.5, gi: 0, li: 0, ti: 1 },
];
const events = [{ gi: 0, label: "V" }];
function proj(): Project {
  return {
    words: [{ text: "a", start: 1, end: 1.5 }, { text: "b", start: 2, end: 2.5 }],
    layout: [{ label: "V", win_start: null, win_end: null, linger: null, del: false, style: {}, animations: [], suppress: [],
      lines: [{ toks: [{ ids: [0], sep: "", del: false, style: {} }, { ids: [1], sep: "", del: false, style: {} }] }] }],
    anim_tags: [], globals: { linger: 0, animations: [], text_direction: "auto", bidi_marks: true },
    global_style: { font: "x", fontsize: 64, bold: true, italic: false, underline: false, primary: "#fff", outline: "#000", back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 0, margin_r: 0, margin_v: 0, pos: null }, video: null,
  };
}
beforeEach(() => {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({ x: 0, left: 0, width: 1000, top: 0, right: 1000, bottom: 30, height: 30, y: 0, toJSON: () => {} } as DOMRect));
});

function renderWT(selId: number | null) {
  return render(<WordTrack words={words as never} events={events} project={proj()} dur={10} time={0}
    liveId={null} selId={selId} selectedWords={selId == null ? new Set<number>() : new Set([selId])}
    unlocked={false} onRetime={() => {}} onSelect={() => {}} />);
}

describe("WordTrack selection styling (zip 11)", () => {
  it("the track wrapper gains has-sel when a block is selected, and the selected block has .sel", () => {
    const { container } = renderWT(0);
    expect(container.querySelector(".wt")?.classList.contains("has-sel")).toBe(true);
    const blocks = container.querySelectorAll(".block");
    expect(blocks[0].classList.contains("sel")).toBe(true);
    expect(blocks[1].classList.contains("sel")).toBe(false);
  });

  it("no has-sel when nothing is selected", () => {
    const { container } = renderWT(null);
    expect(container.querySelector(".wt")?.classList.contains("has-sel")).toBe(false);
  });
});
