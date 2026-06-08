import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    globals: { linger: 0, animations: [], text_direction: "auto", bidi_marks: true },
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

beforeEach(() => {
  FakeWS.last = null;
  (globalThis as any).WebSocket = FakeWS as unknown as typeof WebSocket;
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ result: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }) as Response
  );
});

describe("selection", () => {
  it("ctrl-click toggles into a multi-selection", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="s" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectTwoCues() }));
    // find word elements inside lane rows
    const wordA = await screen.findAllByText("a");
    const laneRowA = wordA.find((el) => el.closest(".lane-row"));
    await user.click(laneRowA ?? wordA[0]);
    // ctrl-click "b"
    const wordB = screen.getAllByText("b");
    const laneRowB = wordB.find((el) => el.closest(".lane-row"));
    await user.keyboard("{Control>}");
    await user.click(laneRowB ?? wordB[0]);
    await user.keyboard("{/Control}");
    expect(screen.getByText(/2 selected/i)).toBeTruthy();
  });

  it("shift-click range-selects all cues in time order", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="s" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectTwoCues() }));
    const wordA = await screen.findAllByText("a");
    const laneRowA = wordA.find((el) => el.closest(".lane-row"));
    await user.click(laneRowA ?? wordA[0]);
    const wordC = screen.getAllByText("c");
    const laneRowC = wordC.find((el) => el.closest(".lane-row"));
    await user.keyboard("{Shift>}");
    await user.click(laneRowC ?? wordC[0]);
    await user.keyboard("{/Shift}");
    expect(screen.getByText(/3 selected/i)).toBeTruthy();
  });

  it("Esc clears selection", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="s" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectTwoCues() }));
    const wordA = await screen.findAllByText("a");
    const laneRowA = wordA.find((el) => el.closest(".lane-row"));
    await user.click(laneRowA ?? wordA[0]);
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/\d+ selected/i)).toBeNull();
  });
});
