import { describe, it, expect } from "vitest";
import { STYLE_KEYS, CUE_STYLE_KEYS } from "../../types";
import { render, screen } from "@testing-library/react";
import { StyleWaterfall } from "./StyleWaterfall";
import type { Project } from "../../types";

function proj(): Project {
  return {
    words: [{ text: "hi", start: 0, end: 1 }],
    layout: [{ label: "G", win_start: null, win_end: null, linger: null,
      del: false, style: { align: 8 }, animations: [], suppress: [],
      lines: [{ toks: [{ ids: [0], sep: "", del: false, style: {} }] }] }],
    anim_tags: [],
    globals: { linger: 0, animations: [] },
    global_style: { font: "x", fontsize: 64, bold: true, italic: false, underline: false, primary: "#fff", outline: "#000",
      back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 80, margin_r: 80, margin_v: 60, pos: null },
    video: null,
  };
}

describe("group-level alignment (global < group, no cue)", () => {
  it("align is a STYLE_KEY but not a CUE_STYLE_KEY", () => {
    expect(STYLE_KEYS).toContain("align");
    expect(CUE_STYLE_KEYS).not.toContain("align");
  });

  it("renders an Alignment row at the group tier showing the override", () => {
    render(
      <StyleWaterfall
        project={proj()}
        sel={{ scope: "group", gi: 0, tok: null }}
        aiTier={null}
        onSelectTier={() => {}}
        onSetStyle={() => {}}
        onClearStyle={() => {}}
      />
    );
    expect(screen.getAllByText(/alignment/i).length).toBeGreaterThan(0);
  });
});
