// ControlsRail.audit.test.tsx — Cluster B audit for the project rail: lyrics/
// video display incl. em-dash, the Free-placement (\pos) toggle both ways and
// its Editor-level set_globals payload (toggle → set_globals {use_pos,pos} →
// echo → stable round-trip), the state-aware note text, and AlignGrid gating by
// posActive (including the use_pos:false + pos-set ⇒ NOT disabled case).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ControlsRail } from "./ControlsRail";
import { Editor } from "../Editor";
import { setupFakeWS } from "../../test-util/fakews";
import { mockApi, dispatchesOf, clearDispatches, emitState } from "../../test-util/dispatch";
import { baseProject, withPos, withVideo, mutate } from "../../test-util/fixtures";
import { boxFromState, anchorXY } from "../../model/bbox";
import type { Project } from "../../types";

// ---------------------------------------------------------------------------
// Direct-render: display + toggle callback + note text + AlignGrid gating.
// ---------------------------------------------------------------------------
describe("ControlsRail audit — display & toggle (direct render)", () => {
  const renderRail = (p: Project, spies: { onSetGlobal?: () => void; onTogglePos?: (b: boolean) => void } = {}) =>
    render(<ControlsRail project={p} projectName="mysong"
      onSetGlobal={spies.onSetGlobal ?? vi.fn()} onTogglePos={spies.onTogglePos ?? vi.fn()}
      onUploadVideo={async () => {}} onClearVideo={async () => {}} />);

  it("B-41 — lyrics path shows <projectName>/lyrics.json", () => {
    renderRail(baseProject());
    expect(screen.getByText("mysong/lyrics.json")).toBeInTheDocument();
  });

  it("B-42 — VideoControl shows the basename when a video is attached", () => {
    renderRail(withVideo(baseProject(), "/abs/path/song.mp4"));
    expect(screen.getByText("song.mp4")).toBeInTheDocument();
  });

  it("B-43 — VideoControl shows the Empty dropwell when video is null", () => {
    renderRail(baseProject());
    expect(screen.getByRole("button", { name: /attach video/i })).toBeInTheDocument();
  });

  it("B-44 — Free-placement toggle OFF→ON fires onTogglePos(true)", () => {
    const onTogglePos = vi.fn();
    renderRail(baseProject(), { onTogglePos });
    fireEvent.click(screen.getByRole("switch", { name: /free placement/i }));
    expect(onTogglePos).toHaveBeenCalledTimes(1);
    expect(onTogglePos).toHaveBeenCalledWith(true);
  });

  it("B-45 — Free-placement toggle ON→OFF fires onTogglePos(false)", () => {
    const onTogglePos = vi.fn();
    renderRail(withPos(baseProject()), { onTogglePos });
    fireEvent.click(screen.getByRole("switch", { name: /free placement/i }));
    expect(onTogglePos).toHaveBeenCalledWith(false);
  });

  it("B-46 — note text flips with pos state (margin mode)", () => {
    renderRail(baseProject());
    expect(screen.getByText("Margins come from dragging the preview box edges.")).toBeInTheDocument();
  });

  it("B-47 — note text flips with pos state (pin mode)", () => {
    renderRail(withPos(baseProject()));
    expect(screen.getByText("Pin coordinate comes from dragging the preview box.")).toBeInTheDocument();
  });

  it("B-48 — AlignGrid is ENABLED when pos is off", () => {
    const { container } = renderRail(baseProject());
    expect((container.querySelector(".kit-sel") as HTMLButtonElement).disabled).toBe(false);
  });

  it("B-49 — AlignGrid is DISABLED when posActive (use_pos:true + pos set)", () => {
    const { container } = renderRail(withPos(baseProject()));
    expect((container.querySelector(".kit-sel") as HTMLButtonElement).disabled).toBe(true);
  });

  it("B-50 — AlignGrid is NOT disabled when use_pos:false even though pos is set", () => {
    const p = mutate(baseProject(), (d) => { d.placement.pos = [960, 540]; d.placement.use_pos = false; });
    const { container } = renderRail(p);
    // posActive is false (use_pos false) → grid editable
    expect((container.querySelector(".kit-sel") as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Editor-level: toggle → set_globals {use_pos,pos} → echo → stable round-trip.
// ---------------------------------------------------------------------------
describe("ControlsRail audit — toggle dispatch (Editor level)", () => {
  beforeEach(() => { setupFakeWS(); mockApi(); });

  async function mountEditor(p: Project) {
    render(<Editor projectName="s" onHome={() => {}} />);
    await waitFor(() => expect((globalThis as unknown as { WebSocket: { last: unknown } }).WebSocket).toBeTruthy());
    emitState(p);
    return screen.findByRole("switch", { name: /free placement/i });
  }

  it("B-51 — toggle ON dispatches set_globals {use_pos:true, pos:anchorXY(current box)}", async () => {
    const p = baseProject(); // pos null, use_pos true → posActive false → toggle shows OFF
    const sw = await mountEditor(p);
    expect(sw).toHaveAttribute("aria-checked", "false");
    clearDispatches();
    fireEvent.click(sw);
    const calls = dispatchesOf("set_globals");
    expect(calls).toHaveLength(1);
    const expectedPos = anchorXY(boxFromState(p.placement), p.placement.align);
    expect(calls[0].args).toEqual({ partial: { use_pos: true, pos: expectedPos } });
  });

  it("B-52 — toggle OFF dispatches set_globals {use_pos:false, pos:null}", async () => {
    const p = withPos(baseProject(), [1000, 900]); // posActive true → toggle shows ON
    const sw = await mountEditor(p);
    expect(sw).toHaveAttribute("aria-checked", "true");
    clearDispatches();
    fireEvent.click(sw);
    const calls = dispatchesOf("set_globals");
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual({ partial: { use_pos: false, pos: null } });
  });

  it("B-54 — Animations pointer row switches the rail to the Inspector tab", async () => {
    const p = baseProject();
    await mountEditor(p);
    // starts on the Project tab → ControlsRail visible with the Animations row
    const animRow = await screen.findByRole("button", { name: /animations/i });
    fireEvent.click(animRow);
    // inspector tab is now active and the project rail (Animations row) is gone
    await waitFor(() => {
      const inspectorTab = screen.getByRole("button", { name: /inspector/i });
      expect(inspectorTab.className).toContain("on");
    });
    expect(screen.queryByRole("button", { name: /^animations/i })).toBeNull();
  });

  it("B-53 — ON→OFF→ON (echo between) yields a stable pos again", async () => {
    const p0 = baseProject();
    const sw0 = await mountEditor(p0);

    // ON
    clearDispatches();
    act(() => { fireEvent.click(sw0); });
    const on1 = dispatchesOf("set_globals")[0].args.partial as { pos: [number, number]; use_pos: boolean };
    const expectedPos = anchorXY(boxFromState(p0.placement), p0.placement.align);
    expect(on1).toEqual({ use_pos: true, pos: expectedPos });

    // echo the ON state
    const pOn = mutate(p0, (d) => { d.placement.use_pos = true; d.placement.pos = on1.pos; });
    emitState(pOn);
    let sw = await screen.findByRole("switch", { name: /free placement/i });
    expect(sw).toHaveAttribute("aria-checked", "true");

    // OFF
    clearDispatches();
    act(() => { fireEvent.click(sw); });
    expect(dispatchesOf("set_globals")[0].args).toEqual({ partial: { use_pos: false, pos: null } });
    const pOff = mutate(pOn, (d) => { d.placement.use_pos = false; d.placement.pos = null; });
    emitState(pOff);
    sw = await screen.findByRole("switch", { name: /free placement/i });
    expect(sw).toHaveAttribute("aria-checked", "false");

    // ON again — same anchor since margins/align are unchanged
    clearDispatches();
    act(() => { fireEvent.click(sw); });
    const on2 = dispatchesOf("set_globals")[0].args.partial as { pos: [number, number] };
    expect(on2.pos).toEqual(expectedPos);
  });
});
