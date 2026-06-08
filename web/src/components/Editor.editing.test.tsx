import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "./Editor";
import type { Project } from "../types";

// ---------------------------------------------------------------------------
// FakeWS — mirrors the harness in Editor.selection.test.tsx
// ---------------------------------------------------------------------------
class FakeWS {
  static last: FakeWS | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor() { FakeWS.last = this; setTimeout(() => this.onopen?.(), 0); }
  send() {} close() { this.onclose?.(); }
  emit(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}

// ---------------------------------------------------------------------------
// projectTwoCues — words a:1-1.5, b:2-2.5, c:3-3.4 as single-word toks in
// one event "V", matching Editor.selection.test.tsx exactly.
// ---------------------------------------------------------------------------
function projectTwoCues(): Project {
  return {
    words: [
      { text: "a", start: 1.0, end: 1.5 },
      { text: "b", start: 2.0, end: 2.5 },
      { text: "c", start: 3.0, end: 3.4 },
    ],
    layout: [
      {
        label: "V",
        win_start: null,
        win_end: null,
        linger: null,
        del: false,
        style: {},
        animations: [], suppress: [],
        lines: [
          {
            toks: [
              { ids: [0], sep: "", del: false, style: {} },
              { ids: [1], sep: "", del: false, style: {} },
              { ids: [2], sep: "", del: false, style: {} },
            ],
          },
        ],
      },
    ],
    anim_tags: [],
    globals: { linger: 0, animations: [] },
    global_style: {
      font: "x", fontsize: 64, bold: true, italic: false, underline: false, primary: "#fff", outline: "#000",
      back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2,
    },
    placement: {
      align: 2, play_w: 1920, play_h: 1080,
      margin_l: 60, margin_r: 60, margin_v: 60, pos: null,
    },
    video: null,
  };
}

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------
beforeEach(() => {
  FakeWS.last = null;
  (globalThis as any).WebSocket = FakeWS as unknown as typeof WebSocket;
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ result: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }) as Response,
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("editing flow", () => {
  it("unlock → edit End → set_word_times; edit Text → set_word_text", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="s" onHome={() => {}} />);

    // Wait for WS to connect
    await waitFor(() => expect(FakeWS.last).toBeTruthy());

    // Push project state
    act(() => FakeWS.last!.emit({ type: "state", state: projectTwoCues() }));

    // Dock defaults to "lanes" — select cue "a" from the lane row
    const allA = await screen.findAllByText("a");
    const laneRowA = allA.find((el) => el.closest(".lane-row"));
    await user.click(laneRowA ?? allA[0]);

    // Switch rail to Inspector tab so TimingPanel appears
    const inspectorBtn = screen.getByRole("button", { name: /inspector/i });
    await user.click(inspectorBtn);

    // The TimingPanel should now be visible with "locked" pill
    const lockBtn = await screen.findByRole("button", { name: /lock|unlock/i });
    // It should currently show "locked"
    expect(lockBtn.textContent).toMatch(/locked/i);

    // Click to UNLOCK
    await user.click(lockBtn);
    // Pill text should now show "unlocked"
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /lock|unlock/i }).textContent).toMatch(/unlocked/i),
    );

    // Edit the End field — aria-label="End" from NumField (rendered as a textbox, not spinbutton)
    const endField = screen.getByLabelText(/^end$/i) as HTMLInputElement;
    await user.clear(endField);
    await user.type(endField, "1.9");
    await user.keyboard("{Enter}");

    // Edit the Text field — aria-label="text" from TimingPanel
    const textField = screen.getByLabelText(/^text$/i) as HTMLInputElement;
    await user.clear(textField);
    await user.type(textField, "Hey");
    await user.keyboard("{Enter}");

    // Collect all fetch calls and parse their bodies
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const calls = fetchMock.mock.calls
      .map((c: any) => {
        try { return JSON.parse(c[1]?.body); } catch { return null; }
      })
      .filter(Boolean);

    // Assert set_word_times was called with an update whose end ≈ 1.9
    expect(
      calls.some(
        (c: any) =>
          c.tool === "set_word_times" &&
          Array.isArray(c.args?.updates) &&
          c.args.updates.some((u: any) => Math.abs(u.end - 1.9) < 1e-9),
      ),
    ).toBe(true);

    // Assert set_word_text was called with text "Hey"
    expect(
      calls.some((c: any) => c.tool === "set_word_text" && c.args?.text === "Hey"),
    ).toBe(true);
  });
});
