import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreviewStage } from "./PreviewStage";

const caps = [{ wid: 0, text: "Caught", live: true, pending: false, sel: false, fill: "#FF3DA6" }];

describe("PreviewStage", () => {
  it("Live mode renders caption words; Exact mode renders an <img> frame", async () => {
    const { container, rerender } = render(
      <PreviewStage capWords={caps} time={1.6} mode="live" onMode={() => {}} onRenderExact={() => {}} onSelectWord={() => {}} />
    );
    expect(screen.getByText("Caught")).toBeTruthy();
    rerender(<PreviewStage capWords={caps} time={1.6} mode="exact" onMode={() => {}} onRenderExact={() => {}} onSelectWord={() => {}} />);
    expect(container.querySelector("img")?.getAttribute("src")).toContain("/api/frame?t=");
  });
  it("toggle fires onMode", async () => {
    const onMode = vi.fn();
    render(<PreviewStage capWords={caps} time={1.6} mode="live" onMode={onMode} onRenderExact={() => {}} onSelectWord={() => {}} />);
    await userEvent.click(screen.getByText(/exact/i));
    expect(onMode).toHaveBeenCalledWith("exact");
  });
});
