/**
 * TopBar.audit.test.tsx — Cluster A, TopBar unit tests.
 * Tests here render <TopBar> directly (no WebSocket) or <Editor> where integration is required.
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { TopBar } from "./TopBar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mkProps(overrides: Partial<Parameters<typeof TopBar>[0]> = {}): Parameters<typeof TopBar>[0] {
  return {
    project: "test-song",
    time: 0,
    dur: 60,
    playing: false,
    onPlay: vi.fn(),
    onSeekRel: vi.fn(),
    onHome: vi.fn(),
    onExport: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: true,
    canRedo: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A-01  Brand / home click
// ---------------------------------------------------------------------------
describe("A-01 — brand/home click fires onHome", () => {
  it("A-01a — clicking the brand div calls onHome once", () => {
    const onHome = vi.fn();
    const { container } = render(<TopBar {...mkProps({ onHome })} />);
    const brand = container.querySelector(".brand") as HTMLElement;
    expect(brand).toBeTruthy();
    fireEvent.click(brand);
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it("A-01b — clicking the brand again calls onHome a second time (no toggle behaviour)", () => {
    const onHome = vi.fn();
    const { container } = render(<TopBar {...mkProps({ onHome })} />);
    const brand = container.querySelector(".brand") as HTMLElement;
    fireEvent.click(brand);
    fireEvent.click(brand);
    expect(onHome).toHaveBeenCalledTimes(2);
  });

  it("A-01c — brand renders project name in crumb", () => {
    render(<TopBar {...mkProps({ project: "my-karaoke-song" })} />);
    expect(screen.getByText("my-karaoke-song")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// A-02  Play / Pause button label (icon-name driven via playing prop)
// ---------------------------------------------------------------------------
describe("A-02 — play/pause button visual state", () => {
  it("A-02a — when playing=false the play button has class tbtn.play", () => {
    const { container } = render(<TopBar {...mkProps({ playing: false })} />);
    const btn = container.querySelector(".tbtn.play") as HTMLElement;
    expect(btn).toBeTruthy();
  });

  it("A-02b — clicking the play button calls onPlay", () => {
    const onPlay = vi.fn();
    const { container } = render(<TopBar {...mkProps({ onPlay })} />);
    const btn = container.querySelector(".tbtn.play") as HTMLElement;
    fireEvent.click(btn);
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("A-02c — clicking twice calls onPlay twice", () => {
    const onPlay = vi.fn();
    const { container } = render(<TopBar {...mkProps({ onPlay })} />);
    const btn = container.querySelector(".tbtn.play") as HTMLElement;
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onPlay).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// A-03  Seek ±2s buttons
// ---------------------------------------------------------------------------
describe("A-03 — seek buttons", () => {
  it("A-03a — skip-back button calls onSeekRel(-2)", () => {
    const onSeekRel = vi.fn();
    const { container } = render(<TopBar {...mkProps({ onSeekRel })} />);
    const btns = container.querySelectorAll(".transport .tbtn");
    // order: skipBack, play, skipFwd
    fireEvent.click(btns[0]);
    expect(onSeekRel).toHaveBeenCalledWith(-2);
  });

  it("A-03b — skip-fwd button calls onSeekRel(+2)", () => {
    const onSeekRel = vi.fn();
    const { container } = render(<TopBar {...mkProps({ onSeekRel })} />);
    const btns = container.querySelectorAll(".transport .tbtn");
    fireEvent.click(btns[2]);
    expect(onSeekRel).toHaveBeenCalledWith(2);
  });

  it("A-03c — time label shows formatted time", () => {
    const { container } = render(<TopBar {...mkProps({ time: 65.5 })} />);
    const timeEl = container.querySelector(".time") as HTMLElement;
    // 65.5s → 1:05.50
    expect(timeEl.textContent).toContain("1:05.50");
  });

  it("A-03d — skip-back then skip-fwd: two onSeekRel calls with -2 then +2", () => {
    const onSeekRel = vi.fn();
    const { container } = render(<TopBar {...mkProps({ onSeekRel })} />);
    const btns = container.querySelectorAll(".transport .tbtn");
    fireEvent.click(btns[0]);
    fireEvent.click(btns[2]);
    expect(onSeekRel).toHaveBeenNthCalledWith(1, -2);
    expect(onSeekRel).toHaveBeenNthCalledWith(2, 2);
  });
});

// ---------------------------------------------------------------------------
// A-04  Undo / Redo buttons
// ---------------------------------------------------------------------------
describe("A-04 — undo/redo buttons", () => {
  it("A-04a — undo button is enabled when canUndo=true", () => {
    const { getByTitle } = render(<TopBar {...mkProps({ canUndo: true })} />);
    const btn = getByTitle("Undo") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("A-04b — undo button is disabled when canUndo=false (gating: click produces no call)", () => {
    const onUndo = vi.fn();
    const { getByTitle } = render(<TopBar {...mkProps({ canUndo: false, onUndo })} />);
    const btn = getByTitle("Undo") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    // The button is disabled so the onClick should NOT fire
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("A-04c — clicking undo fires onUndo", () => {
    const onUndo = vi.fn();
    const { getByTitle } = render(<TopBar {...mkProps({ canUndo: true, onUndo })} />);
    fireEvent.click(getByTitle("Undo"));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("A-04d — redo button is enabled when canRedo=true", () => {
    const { getByTitle } = render(<TopBar {...mkProps({ canRedo: true })} />);
    const btn = getByTitle("Redo") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("A-04e — redo button is disabled when canRedo=false (gating: click produces no call)", () => {
    const onRedo = vi.fn();
    const { getByTitle } = render(<TopBar {...mkProps({ canRedo: false, onRedo })} />);
    const btn = getByTitle("Redo") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onRedo).not.toHaveBeenCalled();
  });

  it("A-04f — clicking redo fires onRedo", () => {
    const onRedo = vi.fn();
    const { getByTitle } = render(<TopBar {...mkProps({ canRedo: true, onRedo })} />);
    fireEvent.click(getByTitle("Redo"));
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it("A-04g — double-click undo calls onUndo twice", () => {
    const onUndo = vi.fn();
    const { getByTitle } = render(<TopBar {...mkProps({ canUndo: true, onUndo })} />);
    const btn = getByTitle("Undo");
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onUndo).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// A-05  Export button
// ---------------------------------------------------------------------------
describe("A-05 — export button", () => {
  it("A-05a — clicking Export button calls onExport", () => {
    const onExport = vi.fn();
    const { getByText } = render(<TopBar {...mkProps({ onExport })} />);
    fireEvent.click(getByText("Export"));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("A-05b — double-click Export calls onExport twice", () => {
    const onExport = vi.fn();
    const { getByText } = render(<TopBar {...mkProps({ onExport })} />);
    fireEvent.click(getByText("Export"));
    fireEvent.click(getByText("Export"));
    expect(onExport).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// A-06  Time/duration format
// ---------------------------------------------------------------------------
describe("A-06 — time formatting", () => {
  it("A-06a — time=0 renders 0:00.00", () => {
    const { container } = render(<TopBar {...mkProps({ time: 0, dur: 120 })} />);
    const el = container.querySelector(".time") as HTMLElement;
    expect(el.textContent).toContain("0:00.00");
  });

  it("A-06b — dur is shown after the slash separator", () => {
    const { container } = render(<TopBar {...mkProps({ time: 0, dur: 90 })} />);
    const el = container.querySelector(".time") as HTMLElement;
    expect(el.textContent).toContain("1:30.00");
  });
});
