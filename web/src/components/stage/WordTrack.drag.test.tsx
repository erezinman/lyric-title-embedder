import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { WordTrack } from "./WordTrack";
import type { Project } from "../../types";

const words = [ { wid: 0, text: "a", s: 1, e: 1.5, gi: 0, li: 0, ti: 0 }, { wid: 1, text: "b", s: 2, e: 2.5, gi: 0, li: 0, ti: 1 } ];
const events = [{ gi: 0, label: "V" }];
function proj(): Project {
  return { words: [{ text: "a", start: 1, end: 1.5 }, { text: "b", start: 2, end: 2.5 }],
    layout: [{ label: "V", accumulate: "words", win_start: null, win_end: null, linger: null, del: false, style: {}, fade: {},
      lines: [{ toks: [{ ids: [0], sep: "", del: false, style: {} }, { ids: [1], sep: "", del: false, style: {} }] }] }],
    fin_tags: [], fout_tags: [], globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 },
    global_style: { font: "x", fontsize: 64, bold: true, primary: "#fff", outline: "#000", back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 0, margin_r: 0, margin_v: 0, pos: null }, video: null };
}
beforeEach(() => { Element.prototype.getBoundingClientRect = vi.fn(() => ({ x: 0, left: 0, width: 1000, top: 0, right: 1000, bottom: 30, height: 30, y: 0, toJSON: () => {} } as DOMRect)); });
function setup(unlocked: boolean) {
  const onRetime = vi.fn();
  const utils = render(<WordTrack words={words as any} events={events} project={proj()} dur={10} time={0}
    liveId={null} selId={0} selectedWords={new Set([0])} unlocked={unlocked} onRetime={onRetime} onSelect={() => {}} />);
  return { ...utils, onRetime };
}
describe("WordTrack drag", () => {
  it("locked: pointer-drag fires no onRetime", () => {
    const { container, onRetime } = setup(false);
    const block = container.querySelector(".block")!;
    fireEvent.pointerDown(block, { clientX: 150 }); fireEvent.pointerMove(window, { clientX: 300 }); fireEvent.pointerUp(window, { clientX: 300 });
    expect(onRetime).not.toHaveBeenCalled();
  });
  it("unlocked: body-drag of +100px (=+1.0s over 1000px/10s) commits one move", () => {
    const { container, onRetime } = setup(true);
    const block = container.querySelectorAll(".block")[0]!;
    fireEvent.pointerDown(block, { clientX: 150 });   // mid-body of word0 (which spans ~100..150px)
    fireEvent.pointerMove(window, { clientX: 250 });
    fireEvent.pointerUp(window, { clientX: 250 });
    expect(onRetime).toHaveBeenCalledTimes(1);
    expect(onRetime.mock.calls[0][0]).toContainEqual({ wid: 0, start: 2, end: 2.5 });
  });
  it("unlocked: Esc during drag cancels", () => {
    const { container, onRetime } = setup(true);
    const block = container.querySelectorAll(".block")[0]!;
    fireEvent.pointerDown(block, { clientX: 150 }); fireEvent.pointerMove(window, { clientX: 250 });
    fireEvent.keyDown(window, { key: "Escape" }); fireEvent.pointerUp(window, { clientX: 260 });
    expect(onRetime).not.toHaveBeenCalled();
  });
});
