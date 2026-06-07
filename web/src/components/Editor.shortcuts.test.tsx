/**
 * Editor.shortcuts.test.tsx — Cluster A2, global keyboard undo/redo + press-flash
 * + held-modifier pill. Boots the full Editor over the FakeWS harness so the real
 * keyboard handlers and store.undo/redo dispatch contract are exercised.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { Editor } from "./Editor";
import { setupFakeWS, FakeWS } from "../test-util/fakews";
import { mockApi, emitState, dispatchesOf, clearDispatches } from "../test-util/dispatch";
import { baseProject } from "../test-util/fixtures";

beforeEach(() => {
  FakeWS.last = null;
  setupFakeWS();
  mockApi();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function boot() {
  const utils = render(<Editor projectName="audit" onHome={() => {}} />);
  await waitFor(() => expect(FakeWS.last).toBeTruthy());
  emitState(baseProject());
  await waitFor(() => expect(screen.getAllByText("Verse 1").length).toBeGreaterThan(0));
  clearDispatches();
  return utils;
}

const key = (init: Partial<KeyboardEventInit> & { key: string }) =>
  act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init })); });

// ---------------------------------------------------------------------------
// A2-01  Keyboard dispatch contract
// ---------------------------------------------------------------------------
describe("A2-01 — keyboard undo/redo dispatch", () => {
  it("A2-01a — Ctrl+Z dispatches undo", async () => {
    await boot();
    key({ key: "z", ctrlKey: true });
    await waitFor(() => expect(dispatchesOf("undo").length).toBe(1));
    expect(dispatchesOf("redo").length).toBe(0);
  });

  it("A2-01b — Meta+Z (⌘Z) dispatches undo", async () => {
    await boot();
    key({ key: "z", metaKey: true });
    await waitFor(() => expect(dispatchesOf("undo").length).toBe(1));
  });

  it("A2-01c — Ctrl+Shift+Z dispatches redo", async () => {
    await boot();
    key({ key: "z", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(dispatchesOf("redo").length).toBe(1));
    expect(dispatchesOf("undo").length).toBe(0);
  });

  it("A2-01d — Ctrl+Y dispatches redo", async () => {
    await boot();
    key({ key: "y", ctrlKey: true });
    await waitFor(() => expect(dispatchesOf("redo").length).toBe(1));
  });

  it("A2-01e — plain Z (no modifier) dispatches nothing", async () => {
    await boot();
    key({ key: "z" });
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchesOf("undo").length).toBe(0);
    expect(dispatchesOf("redo").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A2-02  Inert while focus is in an editable element
// ---------------------------------------------------------------------------
describe("A2-02 — input-focus gating", () => {
  it("A2-02a — Ctrl+Z from an <input> target does NOT dispatch undo", async () => {
    await boot();
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchesOf("undo").length).toBe(0);
    document.body.removeChild(input);
  });

  it("A2-02b — Ctrl+Z from a contenteditable does NOT dispatch undo", async () => {
    await boot();
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    // jsdom doesn't compute isContentEditable from the attr; force it for the test.
    Object.defineProperty(div, "isContentEditable", { value: true, configurable: true });
    document.body.appendChild(div);
    act(() => {
      div.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchesOf("undo").length).toBe(0);
    document.body.removeChild(div);
  });
});

// ---------------------------------------------------------------------------
// A2-03  Press-flash (key OR button) appears then clears
// ---------------------------------------------------------------------------
describe("A2-03 — press-flash on undo/redo", () => {
  it("A2-03a — Ctrl+Z flashes the Undo button (.pressed) then clears after ~200ms", async () => {
    await boot();
    const undoBtn = screen.getByTitle("Undo");
    key({ key: "z", ctrlKey: true });
    expect(undoBtn.className).toContain("pressed");
    await waitFor(() => expect(undoBtn.className).not.toContain("pressed"));
  });

  it("A2-03b — clicking the Undo button flashes it too, then clears", async () => {
    await boot();
    const undoBtn = screen.getByTitle("Undo");
    act(() => { fireEvent.click(undoBtn); });
    expect(undoBtn.className).toContain("pressed");
    await waitFor(() => expect(undoBtn.className).not.toContain("pressed"));
  });

  it("A2-03c — Ctrl+Shift+Z flashes the Redo button, not Undo", async () => {
    await boot();
    const redoBtn = screen.getByTitle("Redo");
    const undoBtn = screen.getByTitle("Undo");
    key({ key: "z", ctrlKey: true, shiftKey: true });
    expect(redoBtn.className).toContain("pressed");
    expect(undoBtn.className).not.toContain("pressed");
  });
});

// ---------------------------------------------------------------------------
// A2-04  Held-modifier pill (§2)
// ---------------------------------------------------------------------------
describe("A2-04 — held-modifier pill", () => {
  it("A2-04a — Shift held shows '⇧ Range select'; keyup removes it", async () => {
    const { container } = await boot();
    key({ key: "Shift", shiftKey: true });
    await waitFor(() => {
      const pill = container.querySelector(".mod-cue") as HTMLElement;
      expect(pill?.textContent).toContain("Range select");
      expect(pill.className).toContain("shift");
    });
    act(() => { window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", shiftKey: false })); });
    await waitFor(() => expect(container.querySelector(".mod-cue")).toBeNull());
  });

  it("A2-04b — Ctrl held shows '⌘ Cherry-pick'; blur removes it", async () => {
    const { container } = await boot();
    key({ key: "Control", ctrlKey: true });
    await waitFor(() => {
      const pill = container.querySelector(".mod-cue") as HTMLElement;
      expect(pill?.textContent).toContain("Cherry-pick");
      expect(pill.className).toContain("ctrl");
    });
    act(() => { window.dispatchEvent(new Event("blur")); });
    await waitFor(() => expect(container.querySelector(".mod-cue")).toBeNull());
  });
});
