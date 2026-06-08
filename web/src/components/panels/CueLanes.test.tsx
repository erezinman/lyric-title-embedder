import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CueLanes } from "./CueLanes";
import type { Project } from "../../types";
import { fadeInAnim, fadeOutAnim } from "../../model/animPresets";

function proj(): Project {
  return {
    words: [
      { text: "Caught", start: 0.3, end: 0.7 },   // 0
      { text: "in",     start: 0.8, end: 1.0 },   // 1
      { text: "a",      start: 1.05, end: 1.2 },  // 2
      { text: "bleat",  start: 1.4,  end: 2.0 },  // 3
      { text: "up",     start: 3.7,  end: 4.0 },  // 4
      { text: "in",     start: 4.05, end: 4.45 }, // 5
    ],
    layout: [
      {
        label: "V1",
        win_start: null, win_end: null, linger: null, del: false,
        style: { fontsize: 72 },
        animations: [], suppress: [],
        lines: [{
          toks: [
            { ids: [0], sep: "", del: false, style: {} },
            { ids: [1], sep: "", del: false, style: {} },
            { ids: [2], sep: "", del: false, style: {} },
            { ids: [3], sep: "", del: false, style: {} },
            { ids: [4, 5], sep: " ", del: false, style: {} }, // merged: "up in"
          ],
        }],
      },
    ],
    // animations model: fade-in on word 0, fade-out on word 3 (anim_tags)
    anim_tags: [
      { ids: [0], anims: [fadeInAnim("a1")], suppress: [] },
      { ids: [3], anims: [fadeOutAnim("a2")], suppress: [] },
    ],
    globals: { linger: 0.0, animations: [], text_direction: "auto", bidi_marks: true },
    global_style: {
      font: "Space Grotesk", fontsize: 64, bold: true, italic: false, underline: false, primary: "#FFFFFF",
      outline: "#000000", back: "#000000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2,
    },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, pos: null },
    video: null,
  };
}

describe("CueLanes", () => {
  it("renders event label, merged-token joined text, and a fade-out cell anchored to cue_end", () => {
    const p = proj();
    render(
      <CueLanes
        project={p}
        sel={{ scope: "group", gi: 0, tok: null }}
        selectedWords={new Set<number>()}
        collapsed={new Set<number>()}
        aiHotKey={null}
        onSelectWord={() => {}}
        onSelectEvent={() => {}}
        onToggleCollapse={() => {}}
      />,
    );
    expect(screen.getByText("V1")).toBeTruthy();
    expect(screen.getByText(/up in/)).toBeTruthy();
    // fade-out cell anchors to cue_end (word 3 end = 2.0) → "@2.00"
    expect(screen.getByText(/@2\.00/)).toBeTruthy();
  });
});
