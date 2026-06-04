import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FadeGroupPanel } from "./FadeGroupPanel";
import type { Project } from "../../types";

function proj(): Project {
  return {
    words: [{ text: "Hello", start: 0.0, end: 0.5 }],
    layout: [
      {
        label: "V1",
        accumulate: "words",
        win_start: null, win_end: null, linger: null, del: false,
        style: {},
        fade: {},
        lines: [{ toks: [{ ids: [0], sep: "", del: false, style: {} }] }],
      },
    ],
    fin_tags: [],
    fout_tags: [],
    globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 },
    global_style: {
      font: "Space Grotesk", fontsize: 64, bold: true, primary: "#FFFFFF",
      outline: "#000000", back: "#000000", back_alpha: "80",
      outline_w: 3, shadow: 0, border_style: 1, align: 2,
    },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, pos: null },
    video: null,
  };
}

const finTag = { ids: [0], trigger: null };
const foutTag = { ids: [0], trigger: null };

describe("FadeGroupPanel", () => {
  it("returns null when there are no fade tags", () => {
    const { container } = render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={null}
        foutTag={null}
        onSet={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(container.querySelector(".fg-panel")).toBeNull();
  });

  it("renders fade rows when tags exist", () => {
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag}
        foutTag={foutTag}
        onSet={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText(/Fade group/i)).toBeTruthy();
    expect(screen.getByText("Fade-in")).toBeTruthy();
    expect(screen.getByText("Fade-out")).toBeTruthy();
  });
});
