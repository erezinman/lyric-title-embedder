import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { Editor } from "./Editor";
import type { Project } from "../types";

class FakeWS {
  static last: FakeWS | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor() { FakeWS.last = this; setTimeout(() => this.onopen?.(), 0); }
  send() {} close() { this.onclose?.(); }
  emit(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}

function projectWithEvent(label: string): Project {
  return {
    words: [{ text: "Caught", start: 0.3, end: 0.7 }],
    layout: [{ label, accumulate: "words", win_start: null, win_end: null, linger: null, del: false,
      style: {}, fade: {}, lines: [{ toks: [{ ids: [0], sep: "", del: false, style: {} }] }] }],
    fin_tags: [], fout_tags: [], globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 },
    global_style: { font: "x", fontsize: 64, bold: true, primary: "#fff", outline: "#000",
      back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, pos: null },
    video: null,
  };
}

beforeEach(() => {
  (globalThis as any).WebSocket = FakeWS as unknown as typeof WebSocket;
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ result: {} }), { status: 200, headers: { "Content-Type": "application/json" } }) as Response
  );
});

describe("Editor shell", () => {
  it("renders an event label from the pushed project", async () => {
    render(<Editor projectName="song1" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectWithEvent("Verse 1") }));
    await waitFor(() => screen.getByText("Verse 1"));
  });

  it("play advances the clock and pause stops it", async () => {
    const { container } = render(<Editor projectName="song1" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectWithEvent("Verse 1") }));
    await waitFor(() => screen.getByText("Verse 1"));

    const timeLabel = () => (container.querySelector(".time") as HTMLElement).textContent ?? "";
    expect(timeLabel()).toContain("0:00.00");

    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const play = container.querySelector(".tbtn.play") as HTMLElement;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(play);
    act(() => { vi.advanceTimersByTime(500); });   // ~30 rAF frames
    const after = timeLabel();
    expect(after).not.toContain("0:00.00");

    fireEvent.click(play);                          // pause (one in-flight frame may still land)
    act(() => { vi.advanceTimersByTime(100); });
    const settled = timeLabel();
    act(() => { vi.advanceTimersByTime(500); });
    expect(timeLabel()).toBe(settled);              // clock fully stopped
    vi.useRealTimers();
  });

  it("has resizable panes: dragging the rail splitter changes the rail width and persists it", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
    });
    const { container } = render(<Editor projectName="song1" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectWithEvent("Verse 1") }));
    await waitFor(() => screen.getByText("Verse 1"));

    const seps = container.querySelectorAll('[role="separator"]');
    expect(seps).toHaveLength(2);

    const railSplitter = container.querySelector(".splitter.vertical") as HTMLElement;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.pointerDown(railSplitter, { clientX: 320, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 400, clientY: 300 });

    const rail = container.querySelector("aside.rail") as HTMLElement;
    expect(rail.style.width).toBe("400px");
    expect(store.get("kss.railW")).toBe("400");
    vi.unstubAllGlobals();
  });
});
