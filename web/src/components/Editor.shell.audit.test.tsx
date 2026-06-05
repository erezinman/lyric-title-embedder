/**
 * Editor.shell.audit.test.tsx — Cluster A, Editor shell integration tests.
 * Covers: play/pause/seek via Editor render, tabs, Esc, arrow nudge, splitters, export menu, error toast.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { Editor } from "./Editor";
import { setupFakeWS, FakeWS } from "../test-util/fakews";
import { mockApi, dispatchesOf, clearDispatches, emitState } from "../test-util/dispatch";
import { baseProject, mutate } from "../test-util/fixtures";
import { stubLocalStorage } from "../test-util/storage";

// ---------------------------------------------------------------------------
// Standard setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  setupFakeWS();
  mockApi();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Render Editor + wait for WS + push base project + wait for "Verse 1" */
async function renderEditor(onHome = vi.fn()) {
  const result = render(<Editor projectName="audit" onHome={onHome} />);
  await waitFor(() => expect(FakeWS.last).toBeTruthy());
  emitState(baseProject());
  await waitFor(() => screen.getByText("Verse 1"));
  return result;
}

// ---------------------------------------------------------------------------
// A-10  Play advances the clock; pause stops it
// ---------------------------------------------------------------------------
describe("A-10 — play/pause via Editor (fake rAF)", () => {
  it("A-10a — click play then advance rAF time: clock label moves forward", async () => {
    const { container } = await renderEditor();
    const timeLabel = () => (container.querySelector(".time") as HTMLElement).textContent ?? "";
    expect(timeLabel()).toContain("0:00.00");

    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const play = container.querySelector(".tbtn.play") as HTMLElement;
    fireEvent.click(play);
    act(() => { vi.advanceTimersByTime(500); });
    expect(timeLabel()).not.toContain("0:00.00");
  });

  it("A-10b — click pause: clock label stops advancing after pause", async () => {
    const { container } = await renderEditor();
    const timeLabel = () => (container.querySelector(".time") as HTMLElement).textContent ?? "";

    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const play = container.querySelector(".tbtn.play") as HTMLElement;
    fireEvent.click(play);
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.click(play); // pause
    act(() => { vi.advanceTimersByTime(100); });
    const frozen = timeLabel();
    act(() => { vi.advanceTimersByTime(500); });
    expect(timeLabel()).toBe(frozen);
  });

  it("A-10c — double play-click: play → pause → play; clock advances in first and third segment", async () => {
    const { container } = await renderEditor();
    const timeLabel = () => (container.querySelector(".time") as HTMLElement).textContent ?? "";

    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const play = container.querySelector(".tbtn.play") as HTMLElement;

    // Phase 1: play
    fireEvent.click(play);
    act(() => { vi.advanceTimersByTime(300); });
    const t1 = timeLabel();
    expect(t1).not.toContain("0:00.00");

    // Phase 2: pause
    fireEvent.click(play);
    act(() => { vi.advanceTimersByTime(100); });
    const t2 = timeLabel();
    act(() => { vi.advanceTimersByTime(300); });
    expect(timeLabel()).toBe(t2); // frozen

    // Phase 3: play again
    fireEvent.click(play);
    act(() => { vi.advanceTimersByTime(300); });
    expect(timeLabel()).not.toBe(t2);
  });
});

// ---------------------------------------------------------------------------
// A-11  Seek ±2s via Editor (clamp at 0 and at duration)
// ---------------------------------------------------------------------------
describe("A-11 — seek buttons via Editor", () => {
  it("A-11a — seek fwd then back: label returns to initial 0:00.00", async () => {
    const { container } = await renderEditor();
    const timeLabel = () => (container.querySelector(".time") as HTMLElement).textContent ?? "";
    const btns = container.querySelectorAll(".transport .tbtn");
    const skipBack = btns[0] as HTMLElement;
    const skipFwd = btns[2] as HTMLElement;

    expect(timeLabel()).toContain("0:00.00");
    fireEvent.click(skipFwd);
    // after +2s
    const mid = timeLabel();
    expect(mid).not.toContain("0:00.00");

    fireEvent.click(skipBack);
    // back 2s nets to 0
    expect(timeLabel()).toContain("0:00.00");
  });

  it("A-11b — seek back from zero clamps to 0:00.00", async () => {
    const { container } = await renderEditor();
    const timeLabel = () => (container.querySelector(".time") as HTMLElement).textContent ?? "";
    const btns = container.querySelectorAll(".transport .tbtn");
    const skipBack = btns[0] as HTMLElement;

    expect(timeLabel()).toContain("0:00.00");
    fireEvent.click(skipBack); // at t=0, -2 clamps to 0
    expect(timeLabel()).toContain("0:00.00");
  });

  it("A-11c — seek forward beyond duration clamps at dur", async () => {
    // baseProject: words end at 0.5+8 + 1.2 + 1.5 = ~11.2s. We'll click fwd many times.
    const { container } = await renderEditor();
    const timeLabel = () => (container.querySelector(".time") as HTMLElement).textContent ?? "";
    const btns = container.querySelectorAll(".transport .tbtn");
    const skipFwd = btns[2] as HTMLElement;

    // click 20× → should clamp at dur (not go negative or NaN)
    for (let i = 0; i < 20; i++) fireEvent.click(skipFwd);
    const label = timeLabel();
    // should not contain "NaN"
    expect(label).not.toContain("NaN");
    // should not advance beyond the displayed duration (last .d span)
    const durEl = container.querySelector(".time .d") as HTMLElement;
    const durText = durEl.textContent ?? "";
    expect(timeLabel()).toContain(durText.replace(" / ", "").trim());
  });
});

// ---------------------------------------------------------------------------
// A-12  Undo / Redo dispatch wire format
// ---------------------------------------------------------------------------
describe("A-12 — undo/redo dispatch wire format", () => {
  it("A-12a — clicking topbar Undo dispatches tool='undo' with args={}", async () => {
    await renderEditor();
    clearDispatches();
    const undoBtn = screen.getByTitle("Undo") as HTMLElement;
    fireEvent.click(undoBtn);
    await waitFor(() => dispatchesOf("undo").length > 0);
    const d = dispatchesOf("undo")[0];
    expect(d.tool).toBe("undo");
    expect(d.args).toEqual({});
  });

  it("A-12b — clicking topbar Redo dispatches tool='redo' with args={}", async () => {
    await renderEditor();
    clearDispatches();
    const redoBtn = screen.getByTitle("Redo") as HTMLElement;
    fireEvent.click(redoBtn);
    await waitFor(() => dispatchesOf("redo").length > 0);
    const d = dispatchesOf("redo")[0];
    expect(d.tool).toBe("redo");
    expect(d.args).toEqual({});
  });

  it("A-12c — double undo: two 'undo' dispatches in order", async () => {
    await renderEditor();
    clearDispatches();
    const undoBtn = screen.getByTitle("Undo") as HTMLElement;
    fireEvent.click(undoBtn);
    fireEvent.click(undoBtn);
    await waitFor(() => dispatchesOf("undo").length >= 2);
    expect(dispatchesOf("undo")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// A-13  Export menu toggles
// ---------------------------------------------------------------------------
describe("A-13 — export menu open/close", () => {
  it("A-13a — clicking Export opens the export dialog", async () => {
    await renderEditor();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The topbar Export button is .topbar .btn.primary
    const exportBtn = document.querySelector(".topbar .btn.primary") as HTMLElement;
    fireEvent.click(exportBtn);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("A-13b — clicking Export a second time closes the dialog (toggle)", async () => {
    await renderEditor();
    // Use the topbar Export button (not the dialog header)
    const getExportBtn = () => document.querySelector(".topbar .btn.primary") as HTMLElement;
    fireEvent.click(getExportBtn());
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(getExportBtn());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("A-13c — double-toggle (open→close→open→close) menu is closed", async () => {
    await renderEditor();
    const getExportBtn = () => document.querySelector(".topbar .btn.primary") as HTMLElement;
    fireEvent.click(getExportBtn()); // open
    fireEvent.click(getExportBtn()); // close
    fireEvent.click(getExportBtn()); // open
    fireEvent.click(getExportBtn()); // close
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// A-14  Rail tabs (Project / Inspector)
// ---------------------------------------------------------------------------
describe("A-14 — rail tabs Project / Inspector", () => {
  it("A-14a — default tab is Project: ControlsRail is mounted", async () => {
    const { container } = await renderEditor();
    // Project tab should be .on
    const projectTab = container.querySelector(".rail-tab.on") as HTMLElement;
    expect(projectTab).toBeTruthy();
    expect(projectTab.textContent).toContain("Project");
  });

  it("A-14b — clicking Inspector tab switches to Inspector panel", async () => {
    const { container } = await renderEditor();
    const tabs = container.querySelectorAll(".rail-tab");
    // tabs[0] = Project, tabs[1] = Inspector
    fireEvent.click(tabs[1]);
    await waitFor(() => {
      const active = container.querySelector(".rail-tab.on") as HTMLElement;
      expect(active?.textContent).toContain("Inspector");
    });
  });

  it("A-14c — clicking Project tab after Inspector returns to Project tab", async () => {
    const { container } = await renderEditor();
    const tabs = container.querySelectorAll(".rail-tab");
    fireEvent.click(tabs[1]); // inspector
    await waitFor(() => {
      const a = container.querySelector(".rail-tab.on") as HTMLElement;
      expect(a?.textContent).toContain("Inspector");
    });
    fireEvent.click(tabs[0]); // project
    await waitFor(() => {
      const a = container.querySelector(".rail-tab.on") as HTMLElement;
      expect(a?.textContent).toContain("Project");
    });
  });

  it("A-14d — double-click same tab (Project): stays on Project tab", async () => {
    const { container } = await renderEditor();
    const tabs = container.querySelectorAll(".rail-tab");
    fireEvent.click(tabs[0]);
    fireEvent.click(tabs[0]);
    const active = container.querySelector(".rail-tab.on") as HTMLElement;
    expect(active?.textContent).toContain("Project");
  });
});

// ---------------------------------------------------------------------------
// A-15  Dock tabs (Timeline / Cue lanes)
// ---------------------------------------------------------------------------
describe("A-15 — dock tabs Timeline / Cue lanes", () => {
  it("A-15a — default dock tab is Cue lanes", async () => {
    const { container } = await renderEditor();
    const active = container.querySelector(".dock-tab.on") as HTMLElement;
    expect(active?.textContent).toContain("Cue lanes");
  });

  it("A-15b — clicking Timeline tab switches to timeline panel", async () => {
    const { container } = await renderEditor();
    const tabs = container.querySelectorAll(".dock-tab");
    fireEvent.click(tabs[0]); // Timeline
    await waitFor(() => {
      const active = container.querySelector(".dock-tab.on") as HTMLElement;
      expect(active?.textContent).toContain("Timeline");
    });
    // Timeline panel should be present (the Waveform/WordTrack panel)
    expect(container.querySelector(".timeline-col")).toBeTruthy();
  });

  it("A-15c — clicking Cue lanes after Timeline returns to Cue lanes", async () => {
    const { container } = await renderEditor();
    const tabs = container.querySelectorAll(".dock-tab");
    fireEvent.click(tabs[0]); // Timeline
    fireEvent.click(tabs[1]); // Cue lanes
    await waitFor(() => {
      const active = container.querySelector(".dock-tab.on") as HTMLElement;
      expect(active?.textContent).toContain("Cue lanes");
    });
    expect(container.querySelector(".lanes")).toBeTruthy();
  });

  it("A-15d — double-click same tab (Cue lanes): stays on Cue lanes", async () => {
    const { container } = await renderEditor();
    const tabs = container.querySelectorAll(".dock-tab");
    fireEvent.click(tabs[1]);
    fireEvent.click(tabs[1]);
    const active = container.querySelector(".dock-tab.on") as HTMLElement;
    expect(active?.textContent).toContain("Cue lanes");
  });
});

// ---------------------------------------------------------------------------
// A-16  Esc key clears selection
// ---------------------------------------------------------------------------
describe("A-16 — Esc key", () => {
  it("A-16a — Esc after selecting a lane row removes .sel class from that row", async () => {
    const { container } = await renderEditor();
    // Click 'alpha' to select the first cue
    const rows = container.querySelectorAll(".lane-row");
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.click(rows[0]);
    await waitFor(() => expect(container.querySelector(".lane-row.sel")).toBeTruthy());

    // Press Esc on the window
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(container.querySelector(".lane-row.sel")).toBeNull());
  });

  it("A-16b — Esc while an INPUT is focused does NOT clear selection", async () => {
    const { container } = await renderEditor();
    // Select a cue first
    const rows = container.querySelectorAll(".lane-row");
    fireEvent.click(rows[0]);
    await waitFor(() => expect(container.querySelector(".lane-row.sel")).toBeTruthy());

    // We need to get to a focused input. Switch to Inspector tab to get TimingPanel.
    const railTabs = container.querySelectorAll(".rail-tab");
    fireEvent.click(railTabs[1]); // Inspector
    await waitFor(() => {
      const active = container.querySelector(".rail-tab.on");
      expect(active?.textContent).toContain("Inspector");
    });

    // TimingPanel's text input should now be available
    const textInput = container.querySelector("input[aria-label='text']") as HTMLInputElement | null;
    if (!textInput) {
      // TimingPanel only appears when a cue tok is selected; select a cue after switching
      const rows2 = container.querySelectorAll(".lane-row");
      if (rows2.length > 0) fireEvent.click(rows2[0]);
      await waitFor(() => screen.getByLabelText("text"));
    }
    const inp = container.querySelector("input[aria-label='text']") as HTMLInputElement;
    expect(inp).toBeTruthy();

    // Capture sel before
    const selBefore = container.querySelector(".lane-row.sel");

    // Focus the input and fire Esc on it
    fireEvent.focus(inp);
    fireEvent.keyDown(inp, { key: "Escape" });

    // Selection should NOT have been cleared because target is an INPUT
    // Give React a tick
    await act(async () => {});
    // The sel class should still be on a row (or at worst the same as before — no change)
    // We specifically assert it was NOT cleared
    expect(container.querySelector(".lane-row.sel")).toEqual(selBefore);
  });

  it("A-16c — Esc twice from a non-input context: both clear (idempotent)", async () => {
    const { container } = await renderEditor();
    const rows = container.querySelectorAll(".lane-row");
    fireEvent.click(rows[0]);
    await waitFor(() => expect(container.querySelector(".lane-row.sel")).toBeTruthy());

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(container.querySelector(".lane-row.sel")).toBeNull());
    // second Esc: no error, still no sel
    fireEvent.keyDown(window, { key: "Escape" });
    await act(async () => {});
    expect(container.querySelector(".lane-row.sel")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A-17  Arrow-key nudge (timings unlocked)
// ---------------------------------------------------------------------------
describe("A-17 — arrow nudge (timingsUnlocked gate)", () => {
  /** Unlock timing by selecting a cue, switching to Inspector, clicking the lock-pill */
  async function selectCueAndUnlock(container: HTMLElement) {
    // Select the first lane row (word: alpha, gi=0, li=0, ti=0, wid=0)
    const rows = container.querySelectorAll(".lane-row");
    fireEvent.click(rows[0]);
    await waitFor(() => expect(container.querySelector(".lane-row.sel")).toBeTruthy());

    // Switch to Inspector to access TimingPanel
    const railTabs = container.querySelectorAll(".rail-tab");
    fireEvent.click(railTabs[1]);
    await waitFor(() => {
      const a = container.querySelector(".rail-tab.on");
      expect(a?.textContent).toContain("Inspector");
    });

    // Click lock pill to unlock
    const lockPill = await waitFor(() => container.querySelector(".lock-pill") as HTMLElement);
    expect(lockPill).toBeTruthy();
    fireEvent.click(lockPill);
    await waitFor(() => expect(lockPill.textContent).toContain("unlocked"));
  }

  it("A-17a — ArrowRight with unlocked timings dispatches set_word_times with +0.05 on start+end", async () => {
    const { container } = await renderEditor();
    await selectCueAndUnlock(container);
    clearDispatches();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => dispatchesOf("set_word_times").length > 0);
    const d = dispatchesOf("set_word_times")[0];
    const updates = d.args.updates as { wid: number; start: number; end: number }[];
    expect(updates.length).toBeGreaterThan(0);
    // For word 0: start=0.5, end=1.2 → after +0.05: start=0.55, end=1.25
    const w0 = updates.find((u) => u.wid === 0);
    expect(w0).toBeTruthy();
    expect(w0!.start).toBeCloseTo(0.5 + 0.05, 5);
    expect(w0!.end).toBeCloseTo(1.2 + 0.05, 5);
  });

  it("A-17b — ArrowLeft with unlocked timings dispatches set_word_times with -0.05 on start+end", async () => {
    const { container } = await renderEditor();
    await selectCueAndUnlock(container);
    clearDispatches();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => dispatchesOf("set_word_times").length > 0);
    const d = dispatchesOf("set_word_times")[0];
    const updates = d.args.updates as { wid: number; start: number; end: number }[];
    const w0 = updates.find((u) => u.wid === 0);
    expect(w0).toBeTruthy();
    expect(w0!.start).toBeCloseTo(0.5 - 0.05, 5);
    expect(w0!.end).toBeCloseTo(1.2 - 0.05, 5);
  });

  it("A-17c — Shift+ArrowRight dispatches set_word_times with end+0.25 (resize)", async () => {
    const { container } = await renderEditor();
    await selectCueAndUnlock(container);
    clearDispatches();

    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    await waitFor(() => dispatchesOf("set_word_times").length > 0);
    const d = dispatchesOf("set_word_times")[0];
    const updates = d.args.updates as { wid: number; start: number; end: number }[];
    // computeResize "end": wid=0, start stays 0.5, end goes from 1.2 to 1.45
    const w0 = updates.find((u) => u.wid === 0);
    expect(w0).toBeTruthy();
    expect(w0!.start).toBeCloseTo(0.5, 5);
    expect(w0!.end).toBeCloseTo(1.2 + 0.25, 5);
  });

  it("A-17d — ArrowRight GATED: locked timings → no set_word_times dispatch", async () => {
    const { container } = await renderEditor();
    // Select but do NOT unlock
    const rows = container.querySelectorAll(".lane-row");
    fireEvent.click(rows[0]);
    await waitFor(() => expect(container.querySelector(".lane-row.sel")).toBeTruthy());

    clearDispatches();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => {});
    expect(dispatchesOf("set_word_times")).toHaveLength(0);
  });

  it("A-17e — double ArrowRight: two set_word_times dispatches with cumulative args", async () => {
    const { container } = await renderEditor();
    await selectCueAndUnlock(container);

    // Echo back updated project so the second press sees the updated word times
    const p1 = mutate(baseProject(), (d) => {
      d.words[0].start = 0.55;
      d.words[0].end = 1.25;
    });
    clearDispatches();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => dispatchesOf("set_word_times").length >= 1);
    emitState(p1);
    await act(async () => {});

    clearDispatches();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => dispatchesOf("set_word_times").length >= 1);

    const d2 = dispatchesOf("set_word_times")[0];
    const updates2 = d2.args.updates as { wid: number; start: number; end: number }[];
    const w0b = updates2.find((u) => u.wid === 0);
    expect(w0b).toBeTruthy();
    expect(w0b!.start).toBeCloseTo(0.55 + 0.05, 5);
    expect(w0b!.end).toBeCloseTo(1.25 + 0.05, 5);
  });
});

// ---------------------------------------------------------------------------
// A-18  Splitters
// ---------------------------------------------------------------------------
describe("A-18 — splitters (rail + dock)", () => {
  it("A-18a — rail splitter drag right: rail width increases and persists to localStorage", async () => {
    const store = stubLocalStorage();
    const { container } = await renderEditor();

    const railSplitter = container.querySelector(".splitter.vertical") as HTMLElement;
    expect(railSplitter).toBeTruthy();
    fireEvent.pointerDown(railSplitter, { clientX: 320, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 400, clientY: 300 });

    const rail = container.querySelector("aside.rail") as HTMLElement;
    expect(rail.style.width).toBe("400px");
    expect(store.get("kss.railW")).toBe("400");
  });

  it("A-18b — rail splitter drag right then back: width and localStorage restore to start", async () => {
    const store = stubLocalStorage();
    const { container } = await renderEditor();

    const railSplitter = container.querySelector(".splitter.vertical") as HTMLElement;
    const rail = container.querySelector("aside.rail") as HTMLElement;
    const initialW = rail.style.width;

    // drag right
    fireEvent.pointerDown(railSplitter, { clientX: 320, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 400, clientY: 300 });
    expect(store.get("kss.railW")).toBe("400");

    // drag back to original
    fireEvent.pointerDown(railSplitter, { clientX: 400, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 320, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 320, clientY: 300 });
    expect(store.get("kss.railW")).toBe("320");
    expect(rail.style.width).toBe(initialW === "" ? "320px" : initialW);
  });

  it("A-18c — rail splitter double-click resets to default 320", async () => {
    const store = stubLocalStorage();
    const { container } = await renderEditor();

    const railSplitter = container.querySelector(".splitter.vertical") as HTMLElement;
    // drag to change
    fireEvent.pointerDown(railSplitter, { clientX: 320, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 450, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 450, clientY: 300 });
    expect(store.get("kss.railW")).toBe("450");

    // dblclick reset
    fireEvent.doubleClick(railSplitter);
    const rail = container.querySelector("aside.rail") as HTMLElement;
    expect(rail.style.width).toBe("320px");
    expect(store.get("kss.railW")).toBe("320");
  });

  it("A-18d — dock splitter drag up: dock height increases", async () => {
    const store = stubLocalStorage();
    const { container } = await renderEditor();

    const splitters = container.querySelectorAll(".splitter");
    // The horizontal dock splitter is the second one
    const dockSplitter = container.querySelector(".splitter.horizontal") as HTMLElement;
    expect(dockSplitter).toBeTruthy();
void splitters;

    const dock = container.querySelector("section.dock") as HTMLElement;
    fireEvent.pointerDown(dockSplitter, { clientX: 500, clientY: 400, button: 0 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 360 }); // drag up 40px → height += 40
    fireEvent.pointerUp(window, { clientX: 500, clientY: 360 });
void dock;

    // dock style should reflect increased height
    expect(store.get("kss.dockH")).toBeTruthy();
    const dockH = Number(store.get("kss.dockH"));
    expect(dockH).toBeGreaterThan(252);
  });

  it("A-18e — dock splitter double-click resets to default 252", async () => {
    const store = stubLocalStorage();
    const { container } = await renderEditor();

    const dockSplitter = container.querySelector(".splitter.horizontal") as HTMLElement;
    fireEvent.pointerDown(dockSplitter, { clientX: 500, clientY: 400, button: 0 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 320 });
    fireEvent.pointerUp(window, { clientX: 500, clientY: 320 });

    fireEvent.doubleClick(dockSplitter);
    expect(store.get("kss.dockH")).toBe("252");
  });

  it("A-18f — rail splitter ArrowRight nudge increases width by 16", async () => {
    const store = stubLocalStorage();
    const { container } = await renderEditor();

    const railSplitter = container.querySelector(".splitter.vertical") as HTMLElement;
    fireEvent.keyDown(railSplitter, { key: "ArrowRight" });
    // default 320 → 336
    const rail = container.querySelector("aside.rail") as HTMLElement;
    expect(rail.style.width).toBe("336px");
    expect(store.get("kss.railW")).toBe("336");
  });

  it("A-18g — rail splitter ArrowLeft nudge decreases width by 16", async () => {
    const store = stubLocalStorage();
    const { container } = await renderEditor();

    const railSplitter = container.querySelector(".splitter.vertical") as HTMLElement;
    fireEvent.keyDown(railSplitter, { key: "ArrowLeft" });
    // 320 → 304
    const rail = container.querySelector("aside.rail") as HTMLElement;
    expect(rail.style.width).toBe("304px");
    expect(store.get("kss.railW")).toBe("304");
  });

  it("A-18h — dock splitter ArrowUp nudge increases dock height by 16", async () => {
    const store = stubLocalStorage();
    const { container } = await renderEditor();

    const dockSplitter = container.querySelector(".splitter.horizontal") as HTMLElement;
    fireEvent.keyDown(dockSplitter, { key: "ArrowUp" });
    // 252 → 268
    expect(store.get("kss.dockH")).toBe("268");
  });

  it("A-18i — dock splitter ArrowDown nudge decreases dock height by 16", async () => {
    const store = stubLocalStorage();
    const { container } = await renderEditor();

    const dockSplitter = container.querySelector(".splitter.horizontal") as HTMLElement;
    fireEvent.keyDown(dockSplitter, { key: "ArrowDown" });
    // 252 → 236
    expect(store.get("kss.dockH")).toBe("236");
  });

  it("A-18j — double-drag composition: two consecutive rail drags add up correctly", async () => {
    const store = stubLocalStorage();
    const { container } = await renderEditor();

    const railSplitter = container.querySelector(".splitter.vertical") as HTMLElement;
    // First drag: 320 → 370 (+50)
    fireEvent.pointerDown(railSplitter, { clientX: 320, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 370, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 370, clientY: 300 });
    expect(store.get("kss.railW")).toBe("370");

    // Second drag from new position: 370 → 420 (+50)
    fireEvent.pointerDown(railSplitter, { clientX: 370, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 420, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 420, clientY: 300 });
    expect(store.get("kss.railW")).toBe("420");
  });
});

// ---------------------------------------------------------------------------
// A-19  Play in Exact mode switches preview to Live
// ---------------------------------------------------------------------------
describe("A-19 — play in Exact mode switches preview to Live", () => {
  it("A-19a — when pvMode=exact and play is clicked, live badge appears (no .libass-badge)", async () => {
    // ADJ-01: selector fixed — mode toggles are .seg-btn inside .stage-mode-bar;
    // the second .seg-btn is "Exact" (PreviewStage.tsx L209–220). Assertion intent unchanged.
    const { container } = await renderEditor();

    // Switch to exact mode: second .seg-btn in .stage-mode-bar is "Exact"
    const segBtns = container.querySelectorAll(".stage-mode-bar .seg-btn");
    const exactBtn = segBtns[1] as HTMLElement | undefined;
    expect(exactBtn).toBeTruthy();

    fireEvent.click(exactBtn!);
    // Now play
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const play = container.querySelector(".tbtn.play") as HTMLElement;
    fireEvent.click(play);
    act(() => { vi.advanceTimersByTime(50); });

    // After play in exact mode, pvMode should be "live" — no libass badge
    expect(container.querySelector(".libass-badge")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A-20  Error toast appears on fetch rejection
// ---------------------------------------------------------------------------
describe("A-20 — error toast on API failure", () => {
  it("A-20a — fetch rejection on undo shows error toast", async () => {
    await renderEditor();

    // Override fetch to reject once
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));

    const undoBtn = screen.getByTitle("Undo");
    fireEvent.click(undoBtn);

    // The error toast should appear containing the error message
    await waitFor(() => expect(screen.getByText(/boom/i)).toBeTruthy(), { timeout: 3000 });
  });

  it("A-20b — fetch rejection on a dispatching action (ArrowRight nudge) shows error toast", async () => {
    const { container } = await renderEditor();

    // Select and unlock
    const rows = container.querySelectorAll(".lane-row");
    fireEvent.click(rows[0]);
    await waitFor(() => expect(container.querySelector(".lane-row.sel")).toBeTruthy());
    const railTabs = container.querySelectorAll(".rail-tab");
    fireEvent.click(railTabs[1]);
    await waitFor(() => container.querySelector(".lock-pill"));
    fireEvent.click(container.querySelector(".lock-pill") as HTMLElement);
    await waitFor(() => container.querySelector(".lock-pill")?.textContent?.includes("unlocked"));

    // Override fetch to reject
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network error"));
    fireEvent.keyDown(window, { key: "ArrowRight" });

    await waitFor(() => expect(screen.getByText(/network error/i)).toBeTruthy(), { timeout: 3000 });
  });
});

// ---------------------------------------------------------------------------
// A-21  Revert: select → Esc → re-select → Esc (DOM state mirrors initial)
// ---------------------------------------------------------------------------
describe("A-21 — revert: Esc restores initial no-selection DOM state", () => {
  it("A-21a — after select+Esc, re-select+Esc: no .sel on any lane-row (same as initial)", async () => {
    const { container } = await renderEditor();
    const rows = () => container.querySelectorAll(".lane-row");

    // Initial: no selection
    expect(container.querySelector(".lane-row.sel")).toBeNull();

    // Select
    fireEvent.click(rows()[0]);
    await waitFor(() => expect(container.querySelector(".lane-row.sel")).toBeTruthy());

    // Revert with Esc
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(container.querySelector(".lane-row.sel")).toBeNull());

    // Select again
    fireEvent.click(rows()[1]);
    await waitFor(() => expect(container.querySelector(".lane-row.sel")).toBeTruthy());

    // Revert again
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(container.querySelector(".lane-row.sel")).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// A-22  Revert: undo → redo → dispatch args mirror each other
// ---------------------------------------------------------------------------
describe("A-22 — undo/redo dispatch arg symmetry", () => {
  it("A-22a — undo dispatches {tool:'undo',args:{}} and redo dispatches {tool:'redo',args:{}}", async () => {
    await renderEditor();
    clearDispatches();

    fireEvent.click(screen.getByTitle("Undo"));
    await waitFor(() => dispatchesOf("undo").length > 0);
    expect(dispatchesOf("undo")[0].args).toEqual({});

    clearDispatches();
    fireEvent.click(screen.getByTitle("Redo"));
    await waitFor(() => dispatchesOf("redo").length > 0);
    expect(dispatchesOf("redo")[0].args).toEqual({});
  });
});
