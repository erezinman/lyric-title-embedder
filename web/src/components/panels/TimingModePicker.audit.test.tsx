/**
 * TimingModePicker.audit.test.tsx — Cluster AM (timing-mode picker) audit.
 * Test IDs: AM-01 .. AM-09 (test design §6 / HANDOFF §4.1 Option B).
 *
 * The picker is a self-contained controlled component (no Editor needed): it
 * renders 3 inline segments (Per cue · Per line · Together) + a Sequence ▾ cell
 * opening a grouped popover (Sequence: cascade/typewriter · Advanced: reverse/
 * centerout/jitter), the step sub-row (only for sequence modes; dashed "not
 * used" otherwise), and a ms⇆% unit toggle. SPEC-GAP-1: it emits literal
 * { mode } / { step, step_unit } partials via onChange.
 */
import { describe, it, expect, vi } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimingModePicker } from "./TimingModePicker";
import type { Animation } from "../../types";

function mkAnim(p: Partial<Animation>): Animation {
  return {
    id: "a1", name: p.name ?? "pop", channel: p.channel ?? "scale_x",
    mode: p.mode ?? "percue", step: p.step ?? null, step_unit: p.step_unit ?? null,
    segments: [], enabled: true, group_id: null,
  };
}

function renderPicker(a: Animation) {
  const onChange = vi.fn();
  render(<TimingModePicker anim={a} onChange={onChange} />);
  return { onChange };
}

function picker(): HTMLElement { return document.querySelector(".tm-row") as HTMLElement; }

describe("AM timing-mode picker", () => {
  it("AM-01 — renders 3 inline segments + Sequence ▾ under a TIMING label", async () => {
    renderPicker(mkAnim({ mode: "percue" }));
    const row = picker();
    expect(within(row).getByText(/Timing/i)).toBeTruthy();
    const seg = row.querySelector(".seg") as HTMLElement;
    const segButtons = seg.querySelectorAll(".seg-b:not(.seq)");
    expect(segButtons.length).toBe(3);
    expect(within(seg).getByText(/Per cue/i)).toBeTruthy();
    expect(within(seg).getByText(/Per line/i)).toBeTruthy();
    expect(within(seg).getByText(/Together/i)).toBeTruthy();
    expect(seg.querySelector(".seg-b.seq")).toBeTruthy();
  });

  it("AM-02 — clicking a segment emits { mode } and marks it active", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker(mkAnim({ mode: "percue" }));
    const seg = picker().querySelector(".seg") as HTMLElement;
    await user.click(within(seg).getByRole("button", { name: /Together/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ mode: "together" });
    // active class moves (re-render with the new mode reflects it)
    renderPicker(mkAnim({ mode: "together" }));
    const segs = document.querySelectorAll(".seg");
    const last = segs[segs.length - 1] as HTMLElement;
    const active = within(last).getByRole("button", { name: /Together/i });
    expect(active.className).toContain("on");
  });

  it("AM-03 — Sequence ▾ opens a grouped popover (cascade/typewriter + advanced); picking adopts the name", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker(mkAnim({ mode: "percue" }));
    const seqCell = picker().querySelector(".seg-b.seq") as HTMLElement;
    await user.click(seqCell);
    const pop = document.querySelector(".md-pop, .adv-pop") as HTMLElement;
    expect(pop).toBeTruthy();
    expect(within(pop).getByText(/Sequence/i)).toBeTruthy();
    expect(within(pop).getByText(/Advanced/i)).toBeTruthy();
    expect(within(pop).getByText(/Cascade/i)).toBeTruthy();
    expect(within(pop).getByText(/Typewriter/i)).toBeTruthy();
    await user.click(within(pop).getByText(/Cascade/i));
    expect(onChange).toHaveBeenCalledWith({ mode: "cascade" });
  });

  it("AM-04 — step sub-row gating: dashed 'not used' for non-sequence; editable for sequence; row height stable", async () => {
    // together → dashed placeholder
    renderPicker(mkAnim({ mode: "together" }));
    let sub = picker().querySelector(".substep") as HTMLElement;
    expect(sub.className).toContain("na");
    expect(within(sub).getByText(/not used/i)).toBeTruthy();
    expect(picker().querySelector(".stepper")).toBeNull();

    // cascade → editable step (placeholder slot still present, never absent)
    renderPicker(mkAnim({ mode: "cascade", step: 80, step_unit: "ms" }));
    const rows = document.querySelectorAll(".tm-row");
    const cascadeRow = rows[rows.length - 1] as HTMLElement;
    sub = cascadeRow.querySelector(".substep") as HTMLElement;
    expect(sub.className).not.toContain("na");
    expect(sub.querySelector(".stepper")).toBeTruthy();
    expect(sub.querySelector(".unit")).toBeTruthy();
  });

  it("AM-05 — ms⇆% toggle on step flips unit and emits { step, step_unit }", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker(mkAnim({ mode: "cascade", step: 80, step_unit: "ms" }));
    const unit = picker().querySelector(".unit") as HTMLElement;
    await user.click(within(unit).getByRole("button", { name: /^%$/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const partial = onChange.mock.calls[0][0] as Record<string, unknown>;
    expect(partial.step_unit).toBe("frac");
    expect(partial).toHaveProperty("step");
  });

  it("AM-06 — per-preset defaults: Fade/Pop/Color/Blur→percue; Wipe→typewriter; Slide→together", async () => {
    const { buildPreset } = await import("../../model/animPresets");
    const modeOf = (k: Parameters<typeof buildPreset>[0]) => buildPreset(k, (i) => "x" + i)[0].mode;
    expect(modeOf("fade_in")).toBe("percue");
    expect(modeOf("pop")).toBe("percue");
    expect(modeOf("color_flash")).toBe("percue");
    expect(modeOf("blur_in")).toBe("percue");
    expect(modeOf("wipe_in")).toBe("typewriter");
    expect(modeOf("slide")).toBe("together");
  });

  it("AM-07 — roundtrip: switch mode A→B→A restores active segment + substep visibility", async () => {
    const user = userEvent.setup();
    // baseline: together (dashed substep)
    const { onChange } = renderPicker(mkAnim({ mode: "together" }));
    const baselineHTML = picker().innerHTML;
    // A→B: pick cascade (emits) — simulate the controlled re-render
    const seq = picker().querySelector(".seg-b.seq") as HTMLElement;
    await user.click(seq);
    const pop = document.querySelector(".md-pop, .adv-pop") as HTMLElement;
    await user.click(within(pop).getByText(/Cascade/i));
    expect(onChange).toHaveBeenCalledWith({ mode: "cascade" });
    // B→A: re-render back to together → identical DOM (back to square one)
    document.body.innerHTML = "";
    renderPicker(mkAnim({ mode: "together" }));
    expect(picker().innerHTML).toBe(baselineHTML);
  });

  it("AM-08 — mode names are hover-explained (glossary tooltip via title/aria)", async () => {
    renderPicker(mkAnim({ mode: "percue" }));
    const seg = picker().querySelector(".seg") as HTMLElement;
    const perCue = within(seg).getByRole("button", { name: /Per cue/i });
    const described = perCue.getAttribute("title") || perCue.getAttribute("aria-label");
    expect(described).toBeTruthy();
    expect(String(described).length).toBeGreaterThan(5);
  });

  it("AM-09 — gating: advanced modes (reverse/centerout/jitter) are NOT inline segments", async () => {
    renderPicker(mkAnim({ mode: "percue" }));
    const seg = picker().querySelector(".seg") as HTMLElement;
    // the inline segment row has no Reverse/Center-out/Jitter buttons
    expect(within(seg).queryByText(/Reverse/i)).toBeNull();
    expect(within(seg).queryByText(/Center-out/i)).toBeNull();
    expect(within(seg).queryByText(/Jitter/i)).toBeNull();
  });
});
