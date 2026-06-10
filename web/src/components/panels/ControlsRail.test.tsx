import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ControlsRail } from "./ControlsRail";
import type { Project } from "../../types";

function proj(overrides: Partial<Project["placement"]> = {}, video: Project["video"] = null): Project {
  return {
    words: [], layout: [], anim_tags: [],
    globals: { linger: 0, animations: [], text_direction: "auto", bidi_marks: true },
    global_style: { font: "x", fontsize: 64, bold: true, italic: false, underline: false, primary: "#fff", outline: "#000",
      back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 80, margin_r: 80, margin_v: 60, pos: null, ...overrides },
    video,
  };
}

// Default video-control props for renders not exercising attach/clear.
const VID_PROPS = { onUploadVideo: async () => {}, onClearVideo: async () => {} };

describe("ControlsRail", () => {
  it("shows real lyrics and the attached video basename", () => {
    render(<ControlsRail project={proj({}, { path: "/abs/path/clip.mp4", w: 1920, h: 1080, duration_s: 10 })}
      projectName="mysong" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} {...VID_PROPS} />);
    expect(screen.getByText("mysong/lyrics.json")).toBeInTheDocument();
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    expect(screen.queryByText(/bleating/)).not.toBeInTheDocument();
  });

  it("shows the Empty dropwell when there is no video and no group-by row", () => {
    render(<ControlsRail project={proj()} projectName="p" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} {...VID_PROPS} />);
    expect(screen.getByRole("button", { name: /attach video/i })).toBeInTheDocument();
    expect(screen.queryByText(/group lyrics by/i)).not.toBeInTheDocument();
  });

  it("alignment grid dispatches onSetGlobal when a cell is clicked", () => {
    const onSetGlobal = vi.fn();
    render(<ControlsRail project={proj()} projectName="p" onSetGlobal={onSetGlobal} onTogglePos={vi.fn()} {...VID_PROPS} />);
    // Open the grid via the trigger button
    fireEvent.click(screen.getByLabelText(/alignment/i));
    // Click Top-Center (8)
    fireEvent.click(screen.getByRole("button", { name: "Top-Center (8)" }));
    expect(onSetGlobal).toHaveBeenCalledWith("align", 8);
  });

  it("shows the current-value alignment caption (named + numpad)", () => {
    const { container } = render(<ControlsRail project={proj({ align: 8 })} projectName="p" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} {...VID_PROPS} />);
    const cap = container.querySelector(".ctl-cap") as HTMLElement;
    expect(cap.textContent).toBe("Top-Center (8)");
  });

  it("alignment grid is enabled with no disabled-reason title when \\pos is off", () => {
    render(<ControlsRail project={proj()} projectName="p" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} {...VID_PROPS} />);
    const btn = screen.getByLabelText(/alignment/i);
    expect(btn).not.toBeDisabled();
    expect(btn).not.toHaveAttribute("title");
  });

  it("alignment grid is disabled with the \\pos-override title when free placement is active", () => {
    render(<ControlsRail project={proj({ pos: [960, 540], use_pos: true })} projectName="p" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} {...VID_PROPS} />);
    const btn = screen.getByLabelText(/alignment/i);
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Disabled — free placement (\\pos) overrides alignment");
  });

  it("pos toggle shows OFF when use_pos is false even though pos is set", () => {
    render(<ControlsRail project={proj({ pos: [960, 540], use_pos: false })} projectName="p" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} {...VID_PROPS} />);
    expect(screen.getByRole("switch", { name: /free placement/i })).toHaveAttribute("aria-checked", "false");
  });

  it("pos toggle fires onTogglePos", () => {
    const onTogglePos = vi.fn();
    render(<ControlsRail project={proj()} projectName="p" onSetGlobal={vi.fn()} onTogglePos={onTogglePos} {...VID_PROPS} />);
    fireEvent.click(screen.getByRole("switch", { name: /free placement/i }));
    expect(onTogglePos).toHaveBeenCalledWith(true);
  });

  it("note text reflects pin mode when pos is active", () => {
    render(<ControlsRail project={proj({ pos: [960, 540], use_pos: true })} projectName="p" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} {...VID_PROPS} />);
    expect(screen.getByText("Pin coordinate comes from dragging the preview box.")).toBeInTheDocument();
  });

  it("note text reflects margin mode when pos is off", () => {
    render(<ControlsRail project={proj()} projectName="p" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} {...VID_PROPS} />);
    expect(screen.getByText("Margins come from dragging the preview box edges.")).toBeInTheDocument();
  });

  it("text-direction segmented reflects the current globals value (auto by default)", () => {
    render(<ControlsRail project={proj()} projectName="p" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} {...VID_PROPS} />);
    const grp = screen.getByRole("group", { name: /text direction/i });
    expect(within(grp).getByRole("button", { name: /^auto$/i })).toHaveAttribute("aria-pressed", "true");
    expect(within(grp).getByRole("button", { name: /^rtl$/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("text-direction reflects an explicit rtl value", () => {
    const p = proj();
    p.globals.text_direction = "rtl";
    render(<ControlsRail project={p} projectName="p" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} {...VID_PROPS} />);
    const grp = screen.getByRole("group", { name: /text direction/i });
    expect(within(grp).getByRole("button", { name: /^rtl$/i })).toHaveAttribute("aria-pressed", "true");
    expect(within(grp).getByRole("button", { name: /^auto$/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking RTL dispatches onSetGlobal('text_direction','rtl')", () => {
    const onSetGlobal = vi.fn();
    render(<ControlsRail project={proj()} projectName="p" onSetGlobal={onSetGlobal} onTogglePos={vi.fn()} {...VID_PROPS} />);
    const grp = screen.getByRole("group", { name: /text direction/i });
    fireEvent.click(within(grp).getByRole("button", { name: /^rtl$/i }));
    expect(onSetGlobal).toHaveBeenCalledWith("text_direction", "rtl");
  });

  it("clicking LTR dispatches onSetGlobal('text_direction','ltr')", () => {
    const onSetGlobal = vi.fn();
    render(<ControlsRail project={proj()} projectName="p" onSetGlobal={onSetGlobal} onTogglePos={vi.fn()} {...VID_PROPS} />);
    const grp = screen.getByRole("group", { name: /text direction/i });
    fireEvent.click(within(grp).getByRole("button", { name: /^ltr$/i }));
    expect(onSetGlobal).toHaveBeenCalledWith("text_direction", "ltr");
  });

  it("bidi-marks toggle reflects globals.bidi_marks (on by default) and dispatches the inverse", () => {
    const onSetGlobal = vi.fn();
    render(<ControlsRail project={proj()} projectName="p" onSetGlobal={onSetGlobal} onTogglePos={vi.fn()} {...VID_PROPS} />);
    const sw = screen.getByRole("switch", { name: /bidi marks/i });
    expect(sw).toHaveAttribute("aria-checked", "true");
    fireEvent.click(sw);
    expect(onSetGlobal).toHaveBeenCalledWith("bidi_marks", false);
  });

  it("bidi-marks toggle reflects an off value and dispatches true when clicked", () => {
    const onSetGlobal = vi.fn();
    const p = proj();
    p.globals.bidi_marks = false;
    render(<ControlsRail project={p} projectName="p" onSetGlobal={onSetGlobal} onTogglePos={vi.fn()} {...VID_PROPS} />);
    const sw = screen.getByRole("switch", { name: /bidi marks/i });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(onSetGlobal).toHaveBeenCalledWith("bidi_marks", true);
  });

  it("Animations pointer row fires onOpenInspector (rail-tab switch is Editor-owned)", () => {
    const onOpenInspector = vi.fn();
    render(<ControlsRail project={proj()} projectName="p" onSetGlobal={vi.fn()} onTogglePos={vi.fn()} onOpenInspector={onOpenInspector} {...VID_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: /animations/i }));
    expect(onOpenInspector).toHaveBeenCalledTimes(1);
  });
});
