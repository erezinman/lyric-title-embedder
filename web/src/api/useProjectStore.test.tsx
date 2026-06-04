import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useProjectStore } from "./useProjectStore";
import type { Project } from "../types";

class FakeWS {
  static last: FakeWS | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  url: string;
  constructor(url: string) { this.url = url; FakeWS.last = this; setTimeout(() => this.onopen?.(), 0); }
  send() {}
  close() { this.onclose?.(); }
  emit(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}

function fakeProject(fontsize: number): Project {
  return {
    words: [], layout: [{ label: "V1", accumulate: "words", win_start: null, win_end: null,
      linger: null, del: false, style: { fontsize }, fade: {}, lines: [] }],
    fin_tags: [], fout_tags: [], globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 },
    global_style: { font: "x", fontsize: 64, bold: true, primary: "#fff", outline: "#000",
      back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, pos: null },
    video: null,
  };
}

beforeEach(() => {
  (globalThis as any).WebSocket = FakeWS as unknown as typeof WebSocket;
  vi.restoreAllMocks();
});

describe("useProjectStore", () => {
  it("connects and stores pushed project", async () => {
    const { result } = renderHook(() => useProjectStore());
    await waitFor(() => expect(result.current.connected).toBe(true));
    act(() => FakeWS.last!.emit({ type: "state", state: fakeProject(72) }));
    expect(result.current.project?.layout[0].style.fontsize).toBe(72);
  });

  it("call() POSTs and the next push updates state", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: {} }), { status: 200, headers: { "Content-Type": "application/json" } }) as Response
    );
    const { result } = renderHook(() => useProjectStore());
    await waitFor(() => expect(result.current.connected).toBe(true));
    await act(async () => { await result.current.call("set_group_style", { gi: 0, partial: { fontsize: 99 } }); });
    expect(f).toHaveBeenCalledWith("/api/call", expect.objectContaining({ method: "POST" }));
    act(() => FakeWS.last!.emit({ type: "state", state: fakeProject(99) }));
    expect(result.current.project?.layout[0].style.fontsize).toBe(99);
  });

  it("a push with no in-flight local call marks lastExternal", async () => {
    const { result } = renderHook(() => useProjectStore());
    await waitFor(() => expect(result.current.connected).toBe(true));
    act(() => FakeWS.last!.emit({ type: "state", state: fakeProject(64) }));
    expect(result.current.lastExternal).toBeGreaterThan(0);
  });
});
