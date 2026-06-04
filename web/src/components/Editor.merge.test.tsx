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
// projectOneLine — words a..d as single-word toks in ONE line of one event.
// ---------------------------------------------------------------------------
function projectOneLine(): Project {
  return {
    words: [
      { text: "a", start: 1.0, end: 1.5 },
      { text: "b", start: 2.0, end: 2.5 },
      { text: "c", start: 3.0, end: 3.4 },
      { text: "d", start: 4.0, end: 4.4 },
    ],
    layout: [
      {
        label: "V",
        accumulate: "words",
        win_start: null,
        win_end: null,
        linger: null,
        del: false,
        style: {},
        fade: {},
        lines: [
          {
            toks: [
              { ids: [0], sep: "", del: false, style: {} },
              { ids: [1], sep: "", del: false, style: {} },
              { ids: [2], sep: "", del: false, style: {} },
              { ids: [3], sep: "", del: false, style: {} },
            ],
          },
        ],
      },
    ],
    fin_tags: [],
    fout_tags: [],
    globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 },
    global_style: {
      font: "x", fontsize: 64, bold: true, primary: "#fff", outline: "#000",
      back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1,
    },
    placement: {
      align: 2, play_w: 1920, play_h: 1080,
      margin_l: 60, margin_r: 60, margin_v: 60, pos: null,
    },
    video: null,
  };
}

// ---------------------------------------------------------------------------
// projectTwoLines — words a,b on line 0; c,d on line 1 of one event.
// ---------------------------------------------------------------------------
function projectTwoLines(): Project {
  const p = projectOneLine();
  p.layout[0].lines = [
    {
      toks: [
        { ids: [0], sep: "", del: false, style: {} },
        { ids: [1], sep: "", del: false, style: {} },
      ],
    },
    {
      toks: [
        { ids: [2], sep: "", del: false, style: {} },
        { ids: [3], sep: "", del: false, style: {} },
      ],
    },
  ];
  return p;
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
// helpers
// ---------------------------------------------------------------------------
function dispatches() {
  const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
  return fetchMock.mock.calls
    .map((c: any) => {
      try { return JSON.parse(c[1]?.body); } catch { return null; }
    })
    .filter(Boolean);
}

async function clickWord(user: ReturnType<typeof userEvent.setup>, label: string, modifier?: "Control") {
  const els = screen.getAllByText(label);
  const laneRow = els.find((el) => el.closest(".lane-row"));
  const target = laneRow ?? els[0];
  if (modifier) {
    await user.keyboard(`{${modifier}>}`);
    await user.click(target);
    await user.keyboard(`{/${modifier}}`);
  } else {
    await user.click(target);
  }
}

async function mergeBtn() {
  return await screen.findByText(/Merge words/i);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("multi-word merge", () => {
  it("3 adjacent words → one merge_word_span with ti_last - ti_first === 2", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="s" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectOneLine() }));

    await clickWord(user, "a");
    await clickWord(user, "b", "Control");
    await clickWord(user, "c", "Control");
    expect(screen.getByText(/3 selected/i)).toBeTruthy();

    await user.click(await mergeBtn());

    const calls = dispatches();
    const spans = calls.filter((c: any) => c.tool === "merge_word_span");
    expect(spans).toHaveLength(1);
    const a = spans[0].args;
    expect(a.sep).toBe(" ");
    expect(a.ti_last - a.ti_first).toBe(2);
    expect(calls.some((c: any) => c.tool === "merge_words")).toBe(false);
  });

  it("non-adjacent selection (words 0 & 2) → no dispatch, error shown", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="s" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectOneLine() }));

    await clickWord(user, "a");
    await clickWord(user, "c", "Control");
    expect(screen.getByText(/2 selected/i)).toBeTruthy();

    await user.click(await mergeBtn());

    const calls = dispatches();
    expect(calls.some((c: any) => c.tool === "merge_word_span")).toBe(false);
    expect(await screen.findByText(/adjacent|one line/i)).toBeTruthy();
  });

  it("cross-line selection → no dispatch, error shown", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="s" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectTwoLines() }));

    await clickWord(user, "b");
    await clickWord(user, "c", "Control");
    expect(screen.getByText(/2 selected/i)).toBeTruthy();

    await user.click(await mergeBtn());

    const calls = dispatches();
    expect(calls.some((c: any) => c.tool === "merge_word_span")).toBe(false);
    expect(await screen.findByText(/adjacent|one line/i)).toBeTruthy();
  });

  it("2 adjacent words → one merge_word_span with ti_last === ti_first + 1", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="s" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectOneLine() }));

    await clickWord(user, "a");
    await clickWord(user, "b", "Control");
    expect(screen.getByText(/2 selected/i)).toBeTruthy();

    await user.click(await mergeBtn());

    const calls = dispatches();
    const spans = calls.filter((c: any) => c.tool === "merge_word_span");
    expect(spans).toHaveLength(1);
    const a = spans[0].args;
    expect(a.sep).toBe(" ");
    expect(a.ti_last).toBe(a.ti_first + 1);
    expect(calls.some((c: any) => c.tool === "merge_words")).toBe(false);
  });
});
