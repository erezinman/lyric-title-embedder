import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FadeDefaultsPanel } from "./FadeDefaultsPanel";

const globals = { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 };

describe("FadeDefaultsPanel", () => {
  it("renders current values from globals", () => {
    render(<FadeDefaultsPanel globals={globals} onSet={vi.fn()} />);
    const panel = screen.getByText(/Fade defaults/i).closest(".fg-panel") as HTMLElement;
    const fadeInRow = within(panel).getByText("Fade-in").closest(".fd-row") as HTMLElement;
    expect(within(fadeInRow).getByText("250ms")).toBeTruthy();
    const fadeOutRow = within(panel).getByText("Fade-out").closest(".fd-row") as HTMLElement;
    expect(within(fadeOutRow).getByText("1000ms")).toBeTruthy();
    const lingerRow = within(panel).getByText("Linger").closest(".fd-row") as HTMLElement;
    expect(within(lingerRow).getByText("0s")).toBeTruthy();
  });

  it("clicking fade-in + calls onSet('fade_in_ms', 300)", async () => {
    const onSet = vi.fn();
    render(<FadeDefaultsPanel globals={globals} onSet={onSet} />);
    const fadeInRow = screen.getByText("Fade-in").closest(".fd-row") as HTMLElement;
    await userEvent.click(within(fadeInRow).getByText("+"));
    expect(onSet).toHaveBeenCalledWith("fade_in_ms", 300);
  });

  it("clicking linger + calls onSet('linger', 0.1)", async () => {
    const onSet = vi.fn();
    render(<FadeDefaultsPanel globals={globals} onSet={onSet} />);
    const lingerRow = screen.getByText("Linger").closest(".fd-row") as HTMLElement;
    await userEvent.click(within(lingerRow).getByText("+"));
    expect(onSet).toHaveBeenCalledWith("linger", 0.1);
  });

  it("clicking fade-out − calls onSet('fade_out_ms', 950)", async () => {
    const onSet = vi.fn();
    render(<FadeDefaultsPanel globals={globals} onSet={onSet} />);
    const fadeOutRow = screen.getByText("Fade-out").closest(".fd-row") as HTMLElement;
    await userEvent.click(within(fadeOutRow).getByText("−"));
    expect(onSet).toHaveBeenCalledWith("fade_out_ms", 950);
  });
});
