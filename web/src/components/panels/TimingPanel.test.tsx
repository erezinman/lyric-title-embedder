import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimingPanel } from "./TimingPanel";
import type { Project, Token } from "../../types";
const tok: Token = { ids: [0], sep: "", del: false, style: {} };
function proj(): Project { return { words: [{ text: "a", start: 1.0, end: 2.0 }], layout: [], fin_tags: [], fout_tags: [], globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 }, global_style: { font: "x", fontsize: 64, bold: true, primary: "#fff", outline: "#000", back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1 }, placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 0, margin_r: 0, margin_v: 0, pos: null } }; }

describe("TimingPanel", () => {
  it("locked by default: text editable, lock toggle present", async () => {
    const onText = vi.fn(); const onToggle = vi.fn();
    render(<TimingPanel tok={tok} project={proj()} unlocked={false} onToggleLock={onToggle} onSetTime={vi.fn()} onSetText={onText} />);
    const text = screen.getByLabelText(/text/i);
    await userEvent.clear(text); await userEvent.type(text, "Hi{Enter}");
    expect(onText).toHaveBeenCalledWith("Hi");
    await userEvent.click(screen.getByRole("button", { name: /lock|unlock/i }));
    expect(onToggle).toHaveBeenCalled();
  });
  it("unlocked: committing End dispatches onSetTime(start,end)", async () => {
    const onTime = vi.fn();
    render(<TimingPanel tok={tok} project={proj()} unlocked={true} onToggleLock={() => {}} onSetTime={onTime} onSetText={() => {}} />);
    const end = screen.getByLabelText(/^end$/i);
    await userEvent.clear(end); await userEvent.type(end, "2.5{Enter}");
    expect(onTime).toHaveBeenCalledWith(1.0, 2.5);
  });
  it("locked: start/end inputs are disabled", () => {
    render(<TimingPanel tok={tok} project={proj()} unlocked={false} onToggleLock={() => {}} onSetTime={() => {}} onSetText={() => {}} />);
    expect((screen.getByLabelText(/^start$/i) as HTMLInputElement).disabled).toBe(true);
  });
});
