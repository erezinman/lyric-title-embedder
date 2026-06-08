import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "./Editor";
import * as client from "../api/client";
import type { Project } from "../types";

class FakeWS {
  static last: FakeWS | null = null;
  onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: (() => void) | null = null;
  constructor() { FakeWS.last = this; setTimeout(() => this.onopen?.(), 0); }
  send() {} close() { this.onclose?.(); }
  emit(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}
function proj(): Project {
  return { words: [{ text: "Caught", start: 0.3, end: 0.7 }],
    layout: [{ label: "V1", win_start: null, win_end: null, linger: null, del: false,
      style: {}, animations: [], suppress: [], lines: [{ toks: [{ ids: [0], sep: "", del: false, style: {} }] }] }],
    anim_tags: [], globals: { linger: 0, animations: [], text_direction: "auto", bidi_marks: true },
    global_style: { font: "x", fontsize: 64, bold: true, italic: false, underline: false, primary: "#fff", outline: "#000", back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, pos: null }, video: null };
}
beforeEach(() => {
  (globalThis as any).WebSocket = FakeWS as unknown as typeof WebSocket;
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ result: {}, job_id: "j1" }), { status: 200, headers: { "Content-Type": "application/json" } }) as Response
  );
  vi.spyOn(client, "getEnv").mockResolvedValue({ same_host: false });
});

describe("Editor burn", () => {
  it("Export posts /api/burn and a burn push shows progress then done", async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    render(<Editor projectName="s" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: proj() }));
    await userEvent.click(await screen.findByText(/Export/i));
    // menu opens — click "Burn video" to trigger the burn POST
    await userEvent.click(await screen.findByRole("button", { name: /burn video/i }));
    expect((f.mock.calls as any[]).some((c) => String(c[0]).includes("/api/burn"))).toBe(true);
    act(() => FakeWS.last!.emit({ type: "burn", job: { frac: 0.5, done: false, ok: false, err: null, out: "o.mp4" } }));
    await waitFor(() => screen.getByText(/50%|rendering|burn/i));
    act(() => FakeWS.last!.emit({ type: "burn", job: { frac: 1, done: true, ok: true, err: null, out: "o.mp4" } }));
    await waitFor(() => screen.getByText(/done|o\.mp4/i));
  });
});
