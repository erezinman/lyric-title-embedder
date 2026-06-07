/**
 * TopBar.audit.test.tsx — Cluster A, TopBar unit tests.
 * Tests here render <TopBar> directly (no WebSocket) or <Editor> where integration is required.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
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
    aiConnected: false,
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

// ---------------------------------------------------------------------------
// A-07  Press-flash class (flash prop drives .pressed on undo/redo)
// ---------------------------------------------------------------------------
describe("A-07 — undo/redo press-flash class", () => {
  it("A-07a — flash='undo' adds .pressed to the Undo button only", () => {
    const { getByTitle } = render(<TopBar {...mkProps({ flash: "undo" })} />);
    expect((getByTitle("Undo") as HTMLElement).className).toContain("pressed");
    expect((getByTitle("Redo") as HTMLElement).className).not.toContain("pressed");
  });

  it("A-07b — flash='redo' adds .pressed to the Redo button only", () => {
    const { getByTitle } = render(<TopBar {...mkProps({ flash: "redo" })} />);
    expect((getByTitle("Redo") as HTMLElement).className).toContain("pressed");
    expect((getByTitle("Undo") as HTMLElement).className).not.toContain("pressed");
  });

  it("A-07c — flash=null leaves neither button pressed", () => {
    const { getByTitle } = render(<TopBar {...mkProps({ flash: null })} />);
    expect((getByTitle("Undo") as HTMLElement).className).not.toContain("pressed");
    expect((getByTitle("Redo") as HTMLElement).className).not.toContain("pressed");
  });
});

// ---------------------------------------------------------------------------
// A-08  AI presence pill + MCP-connect popover
// ---------------------------------------------------------------------------
function mockConnect(body: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((url: RequestInfo | URL) => {
    if (String(url).includes("/api/connect")) {
      return Promise.resolve(new Response(JSON.stringify(body), {
        status: 200, headers: { "Content-Type": "application/json" },
      }) as Response);
    }
    return Promise.resolve(new Response("{}", { status: 200 }) as Response);
  });
}
const CONNECT_NO_TOKEN = {
  host: "127.0.0.1", port: 8770, api_url: "http://127.0.0.1:8770/api/call",
  ws_url: "ws://127.0.0.1:8770/ws", mcp_url: "http://127.0.0.1:8770/mcp", token_required: false,
};
const CONNECT_TOKEN = { ...CONNECT_NO_TOKEN, token_required: true };

describe("A-08 — AI pill + MCP connect popover", () => {
  let clip: { writeText: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    clip = { writeText: vi.fn() };
    Object.defineProperty(navigator, "clipboard", { value: clip, configurable: true });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("A-08a — pill absent when aiConnected=false, present when true", () => {
    const { container, rerender } = render(<TopBar {...mkProps({ aiConnected: false })} />);
    expect(container.querySelector(".ai-pill")).toBeNull();
    rerender(<TopBar {...mkProps({ aiConnected: true })} />);
    expect(container.querySelector(".ai-pill")).toBeTruthy();
  });

  it("A-08b — hovering the pill fetches /api/connect once and renders rows (no auth row without token)", async () => {
    const fetchSpy = mockConnect(CONNECT_NO_TOKEN);
    const { container } = render(<TopBar {...mkProps({ aiConnected: true })} />);
    fireEvent.mouseEnter(container.querySelector(".ai-pill-wrap") as HTMLElement);
    await waitFor(() => expect(container.querySelectorAll(".ai-pop-row").length).toBeGreaterThan(0));
    const labels = [...container.querySelectorAll(".ai-pop-row > span")].map((s) => s.textContent);
    expect(labels).toContain("MCP");
    expect(labels).toContain("WebSocket");
    expect(labels).not.toContain("Auth");
    const connectCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/api/connect"));
    expect(connectCalls.length).toBe(1);
    // hovering again must not refetch (cached)
    fireEvent.mouseEnter(container.querySelector(".ai-pill-wrap") as HTMLElement);
    expect(fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/api/connect")).length).toBe(1);
  });

  it("A-08c — auth row appears only when token_required=true", async () => {
    mockConnect(CONNECT_TOKEN);
    const { container } = render(<TopBar {...mkProps({ aiConnected: true })} />);
    fireEvent.mouseEnter(container.querySelector(".ai-pill-wrap") as HTMLElement);
    await waitFor(() => {
      const labels = [...container.querySelectorAll(".ai-pop-row > span")].map((s) => s.textContent);
      expect(labels).toContain("Auth");
    });
  });

  it("A-08d — clicking a row copies its value and shows 'Copied ✓'", async () => {
    mockConnect(CONNECT_NO_TOKEN);
    const { container } = render(<TopBar {...mkProps({ aiConnected: true })} />);
    fireEvent.mouseEnter(container.querySelector(".ai-pill-wrap") as HTMLElement);
    await waitFor(() => expect(container.querySelectorAll(".ai-pop-row").length).toBeGreaterThan(0));
    const mcpRow = [...container.querySelectorAll(".ai-pop-row")].find(
      (r) => r.querySelector("span")?.textContent === "MCP",
    ) as HTMLElement;
    fireEvent.click(mcpRow);
    expect(clip.writeText).toHaveBeenCalledWith("http://127.0.0.1:8770/mcp");
    expect(mcpRow.textContent).toContain("Copied ✓");
  });

  it("A-08e — 'Copy agent config (JSON)' copies an mcpServers block", async () => {
    mockConnect(CONNECT_NO_TOKEN);
    const { container } = render(<TopBar {...mkProps({ aiConnected: true })} />);
    fireEvent.mouseEnter(container.querySelector(".ai-pill-wrap") as HTMLElement);
    await waitFor(() => expect(container.querySelector(".ai-pop-copy")).toBeTruthy());
    fireEvent.click(container.querySelector(".ai-pop-copy") as HTMLElement);
    expect(clip.writeText).toHaveBeenCalledTimes(1);
    const payload = clip.writeText.mock.calls[0][0] as string;
    const parsed = JSON.parse(payload);
    expect(parsed.mcpServers["karaoke-subtitle-studio"].url).toBe("http://127.0.0.1:8770/mcp");
    // no token → no Authorization header in the config
    expect(parsed.mcpServers["karaoke-subtitle-studio"].headers).toBeUndefined();
  });

  it("A-08f — config includes an Authorization header when token_required", async () => {
    mockConnect(CONNECT_TOKEN);
    const { container } = render(<TopBar {...mkProps({ aiConnected: true })} />);
    fireEvent.mouseEnter(container.querySelector(".ai-pill-wrap") as HTMLElement);
    await waitFor(() => expect(container.querySelector(".ai-pop-copy")).toBeTruthy());
    fireEvent.click(container.querySelector(".ai-pop-copy") as HTMLElement);
    const parsed = JSON.parse(clip.writeText.mock.calls[0][0] as string);
    expect(parsed.mcpServers["karaoke-subtitle-studio"].headers.Authorization).toContain("Bearer");
  });
});
