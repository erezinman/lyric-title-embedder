import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ControlsRail } from "./ControlsRail";
import type { Project } from "../../types";

function proj(overrides: Partial<Project["placement"]> = {}, video: string | null = null): Project {
  return {
    words: [], layout: [], fin_tags: [], fout_tags: [],
    globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 },
    global_style: { font: "x", fontsize: 64, bold: true, primary: "#fff", outline: "#000",
      back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 80, margin_r: 80, margin_v: 60, pos: null, ...overrides },
    video,
  };
}

describe("ControlsRail", () => {
  it("shows real lyrics and video names", () => {
    render(<ControlsRail project={proj({}, "/abs/path/clip.mp4")} projectName="mysong" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} />);
    expect(screen.getByText("mysong/lyrics.json")).toBeInTheDocument();
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    expect(screen.queryByText(/bleating/)).not.toBeInTheDocument();
  });

  it("shows an em-dash when there is no video and no group-by row", () => {
    render(<ControlsRail project={proj()} projectName="p" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/group lyrics by/i)).not.toBeInTheDocument();
  });

  it("alignment select dispatches onSetGlobal", () => {
    const onSetGlobal = vi.fn();
    render(<ControlsRail project={proj()} projectName="p" onSetGlobal={onSetGlobal} onTogglePos={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/alignment/i), { target: { value: "8" } });
    expect(onSetGlobal).toHaveBeenCalledWith("align", 8);
  });

  it("pos toggle shows OFF when use_pos is false even though pos is set", () => {
    render(<ControlsRail project={proj({ pos: [960, 540], use_pos: false })} projectName="p" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} />);
    expect(screen.getByRole("switch", { name: /free placement/i })).toHaveAttribute("aria-checked", "false");
  });

  it("pos toggle fires onTogglePos", () => {
    const onTogglePos = vi.fn();
    render(<ControlsRail project={proj()} projectName="p" onSetGlobal={vi.fn()} onTogglePos={onTogglePos} />);
    fireEvent.click(screen.getByRole("switch", { name: /free placement/i }));
    expect(onTogglePos).toHaveBeenCalledWith(true);
  });
});
