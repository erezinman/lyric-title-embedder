import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CueLanes } from "./CueLanes";
import type { Project } from "../../types";

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
        accumulate: "words",
        win_start: null, win_end: null, linger: null, del: false,
        style: { fontsize: 72 },
        fade: {},
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
    fin_tags: [{ ids: [0], trigger: null }],
    fout_tags: [{ ids: [3], trigger: 15.4 }],
    globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0.0 },
    global_style: {
      font: "Space Grotesk", fontsize: 64, bold: true, primary: "#FFFFFF",
      outline: "#000000", back: "#000000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1,
    },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, pos: null },
    video: null,
  };
}

describe("CueLanes", () => {
  it("renders event label, merged-token joined text, and a fade-out trigger", () => {
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
    expect(screen.getByText(/15\.40/)).toBeTruthy();
  });
});
