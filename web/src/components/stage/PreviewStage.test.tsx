import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreviewStage } from "./PreviewStage";
import type { PlacementState } from "../../model/bbox";

const caps = [{ wid: 0, li: 0, text: "Caught", live: true, pending: false, sel: false, fill: "#FF3DA6", scale: 1, bold: null, italic: null, underline: null }];
const pl: PlacementState = { align: 2, play_w: 1920, play_h: 1080,
  margin_l: 80, margin_r: 80, margin_v: 60, pos: null };

describe("PreviewStage", () => {
  it("Live mode renders caption words; Exact mode renders an <img> frame", async () => {
    const { container, rerender } = render(
      <PreviewStage capWords={caps} time={1.6} mode="live" onMode={() => {}} onRenderExact={() => {}} onSelectWord={() => {}} placement={pl} onPlacement={vi.fn()} />
    );
    expect(screen.getByText("Caught")).toBeTruthy();
    rerender(<PreviewStage capWords={caps} time={1.6} mode="exact" onMode={() => {}} onRenderExact={() => {}} onSelectWord={() => {}} placement={pl} onPlacement={vi.fn()} />);
    expect(container.querySelector("img")?.getAttribute("src")).toContain("/api/frame?t=");
  });
  it("toggle fires onMode", async () => {
    const onMode = vi.fn();
    render(<PreviewStage capWords={caps} time={1.6} mode="live" onMode={onMode} onRenderExact={() => {}} onSelectWord={() => {}} placement={pl} onPlacement={vi.fn()} />);
    await userEvent.click(screen.getByText(/exact/i));
    expect(onMode).toHaveBeenCalledWith("exact");
  });
});
