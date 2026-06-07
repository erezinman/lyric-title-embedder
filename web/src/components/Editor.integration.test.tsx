import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "./Editor";
import type { Project } from "../types";

class FakeWS {
  static last: FakeWS | null = null;
  onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: (() => void) | null = null;
  constructor() { FakeWS.last = this; setTimeout(() => this.onopen?.(), 0); }
  send() {} close() { this.onclose?.(); }
  emit(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}
function projectWithGroup0(): Project {
  return {
    words: [{ text: "Caught", start: 0.3, end: 0.7 }, { text: "in", start: 0.8, end: 1.0 }],
    layout: [{ label: "Verse 1", win_start: null, win_end: null, linger: null, del: false,
      style: {}, animations: [], suppress: [], lines: [{ toks: [
        { ids: [0], sep: "", del: false, style: {} }, { ids: [1], sep: "", del: false, style: {} } ] }] }],
    anim_tags: [], globals: { linger: 0, animations: [] },
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

describe("Editor integration", () => {
  it("selecting a group and toggling Bold on the GROUP tier dispatches set_group_style", async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    render(<Editor projectName="s" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    act(() => FakeWS.last!.emit({ type: "state", state: projectWithGroup0() }));
    await userEvent.click(await screen.findByText("Verse 1"));        // select the group
    await userEvent.click(screen.getByText("Inspector"));             // open inspector rail tab
    // disambiguate: the animations section also has a "GROUP" tag chip — pick the style tier (.tier3)
    const groupTier = screen.getAllByText("GROUP")
      .map((el) => el.closest(".tier3"))
      .find((el): el is HTMLElement => el != null) as HTMLElement;
    // find the Bold row's toggle within the GROUP tier and click it
    const boldRow = within(groupTier).getByText(/Bold/i).closest(".prow") as HTMLElement;
    await userEvent.click(boldRow.querySelector(".toggle, .pv-ctl, [class*='toggle']") as Element);
    const calls = (f.mock.calls as any[]).map(c => { try { return JSON.parse((c[1] as RequestInit).body as string); } catch { return null; } }).filter(Boolean);
    expect(calls.some((c: any) => c.tool === "set_group_style" && c.args && c.args.partial && "bold" in c.args.partial)).toBe(true);
  });
});
