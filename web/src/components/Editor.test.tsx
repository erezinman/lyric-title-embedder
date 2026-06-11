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
    layout: [{ label, win_start: null, win_end: null, linger: null, del: false,
      style: {}, animations: [], suppress: [], lines: [{ toks: [{ ids: [0], sep: "", del: false, style: {} }] }] }],
    anim_tags: [], globals: { linger: 0, animations: [], text_direction: "auto", bidi_marks: true },
    global_style: { font: "x", fontsize: 64, bold: true, italic: false, underline: false, primary: "#fff", outline: "#000",
      back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, pos: null },
    video: null,
  };
}

function projectWithNEvents(n: number): Project {
  const base = projectWithEvent("Verse 1");
  base.layout = Array.from({ length: n }, (_, i) => ({
    label: `Event ${i + 1}`, win_start: null, win_end: null, linger: null, del: false,
    style: {}, animations: [], suppress: [],
    lines: [{ toks: [{ ids: [0], sep: "", del: false, style: {} }] }],
  }));
  return base;
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
    await waitFor(() => expect(screen.getAllByText("Verse 1").length).toBeGreaterThan(0));
  });

  it("play advances the clock and pause stops it", async () => {
    const { container } = render(<Editor projectName="song1" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectWithEvent("Verse 1") }));
    await waitFor(() => expect(screen.getAllByText("Verse 1").length).toBeGreaterThan(0));

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

  it("density toggle: clicking a .seg stop sets density, persists kss.tlDensity, and re-mount reflects it", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
    });
    const { container, unmount } = render(<Editor projectName="song1" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectWithEvent("Verse 1") }));
    await waitFor(() => expect(screen.getAllByText("Verse 1").length).toBeGreaterThan(0));

    const { fireEvent } = await import("@testing-library/react");
    // open the Timeline dock tab where the density .seg lives (first dock-tab)
    const timelineTab = (c: HTMLElement) =>
      Array.from(c.querySelectorAll(".dock-tab")).find((b) => b.textContent?.includes("Timeline")) as HTMLElement;
    fireEvent.click(timelineTab(container));
    // default is Coherent
    const seg = () => container.querySelector(".tl-toolrow .seg") as HTMLElement;
    await waitFor(() => expect(seg()).toBeTruthy());
    // No stored pref + a single-event project (≤6) → locked default is Lanes.
    await waitFor(() =>
      expect(seg().querySelector("button.on")?.getAttribute("data-mode")).toBe("lanes"));

    // explicit click Compact → persists + active stop moves (a stored pref wins later)
    fireEvent.click(seg().querySelector('button[data-mode="compact"]') as HTMLElement);
    expect(store.get("kss.tlDensity")).toBe("compact");
    expect(seg().querySelector("button.on")?.getAttribute("data-mode")).toBe("compact");

    // re-mount: the persisted density is restored
    unmount();
    const r2 = render(<Editor projectName="song1" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectWithEvent("Verse 1") }));
    await waitFor(() => expect(screen.getAllByText("Verse 1").length).toBeGreaterThan(0));
    fireEvent.click(timelineTab(r2.container));
    await waitFor(() =>
      expect(r2.container.querySelector(".tl-toolrow .seg button.on")?.getAttribute("data-mode")).toBe("compact"));
    vi.unstubAllGlobals();
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
    await waitFor(() => expect(screen.getAllByText("Verse 1").length).toBeGreaterThan(0));

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

  it("density default (no stored pref): ≤6 events → lanes", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
    });
    const { container } = render(<Editor projectName="song1" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectWithNEvents(6) }));
    await waitFor(() => expect(screen.getAllByText("Event 1").length).toBeGreaterThan(0));

    const { fireEvent } = await import("@testing-library/react");
    const timelineTab = Array.from(container.querySelectorAll(".dock-tab"))
      .find((b) => b.textContent?.includes("Timeline")) as HTMLElement;
    fireEvent.click(timelineTab);
    await waitFor(() =>
      expect(container.querySelector(".tl-toolrow .seg button.on")?.getAttribute("data-mode")).toBe("lanes"));
    expect(store.get("kss.tlDensity")).toBeUndefined(); // derived default must not persist
    vi.unstubAllGlobals();
  });

  it("density default (no stored pref): >6 events → coherent", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
    });
    const { container } = render(<Editor projectName="song1" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectWithNEvents(7) }));
    await waitFor(() => expect(screen.getAllByText("Event 1").length).toBeGreaterThan(0));

    const { fireEvent } = await import("@testing-library/react");
    const timelineTab = Array.from(container.querySelectorAll(".dock-tab"))
      .find((b) => b.textContent?.includes("Timeline")) as HTMLElement;
    fireEvent.click(timelineTab);
    await waitFor(() =>
      expect(container.querySelector(".tl-toolrow .seg button.on")?.getAttribute("data-mode")).toBe("coherent"));
    vi.unstubAllGlobals();
  });

  it("density default: a stored preference wins over the count-derived default", async () => {
    const store = new Map<string, string>([["kss.tlDensity", "coherent"]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
    });
    const { container } = render(<Editor projectName="song1" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectWithNEvents(2) }));
    await waitFor(() => expect(screen.getAllByText("Event 1").length).toBeGreaterThan(0));

    const { fireEvent } = await import("@testing-library/react");
    const timelineTab = Array.from(container.querySelectorAll(".dock-tab"))
      .find((b) => b.textContent?.includes("Timeline")) as HTMLElement;
    fireEvent.click(timelineTab);
    // ≤6 events would derive "lanes" but the stored "coherent" must win.
    await waitFor(() =>
      expect(container.querySelector(".tl-toolrow .seg button.on")?.getAttribute("data-mode")).toBe("coherent"));
    vi.unstubAllGlobals();
  });

  it("magnet chip names the modifier: shows 'alt' while Alt is held, else on/off", async () => {
    const { container } = render(<Editor projectName="song1" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectWithEvent("Verse 1") }));
    await waitFor(() => expect(screen.getAllByText("Verse 1").length).toBeGreaterThan(0));

    const { fireEvent } = await import("@testing-library/react");
    const timelineTab = Array.from(container.querySelectorAll(".dock-tab"))
      .find((b) => b.textContent?.includes("Timeline")) as HTMLElement;
    fireEvent.click(timelineTab);
    const chip = () => container.querySelector(".snap-toggle .st-state") as HTMLElement;
    await waitFor(() => expect(chip()).toBeTruthy());
    expect(chip().textContent).toBe("on"); // magnet on by default

    act(() => { fireEvent.keyDown(window, { key: "Alt", altKey: true }); });
    await waitFor(() => expect(chip().textContent).toBe("alt"));

    act(() => { fireEvent.keyUp(window, { key: "Alt", altKey: false }); });
    await waitFor(() => expect(chip().textContent).toBe("on"));
  });
});
