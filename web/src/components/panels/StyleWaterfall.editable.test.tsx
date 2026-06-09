// StyleWaterfall.editable.test.tsx — click-to-type numeric cells (zip-13 Phase 5):
// Size commits a number; Box-alpha commits a 2-digit hex string (base-16 parse).
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StyleWaterfall } from "./StyleWaterfall";
import type { Project } from "../../types";

function proj(): Project {
  return {
    words: [{ text: "x", start: 0, end: 1 }],
    layout: [{
      label: "V1", win_start: null, win_end: null, linger: null, del: false,
      style: { fontsize: 72, back_alpha: "40" }, animations: [], suppress: [],
      lines: [{ toks: [{ ids: [0], sep: "", del: false, style: {} }] }],
    }],
    anim_tags: [],
    globals: { linger: 0, animations: [], text_direction: "auto", bidi_marks: true },
    global_style: {
      font: "Space Grotesk", fontsize: 64, bold: true, italic: false, underline: false,
      primary: "#FFFFFF", outline: "#000000", back: "#000000", back_alpha: "80",
      outline_w: 3, shadow: 0, border_style: 1, align: 2,
    },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, pos: null },
    video: null,
  };
}

function renderGroup() {
  const onSetStyle = vi.fn();
  const p = proj();
  render(<StyleWaterfall project={p} sel={{ scope: "group", gi: 0, tok: null }} aiTier={null} onSetStyle={onSetStyle} onClearStyle={vi.fn()} />);
  const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
  return { onSetStyle, groupTier };
}
const lastArgsFor = (fn: ReturnType<typeof vi.fn>, key: string) =>
  [...fn.mock.calls].reverse().find((c) => c.includes(key));

describe("StyleWaterfall — click-to-type cells", () => {
  it("typing a Size commits the numeric value", async () => {
    const { onSetStyle, groupTier } = renderGroup();
    const row = within(groupTier).getByText("Size").closest(".prow") as HTMLElement;
    await userEvent.click(within(row).getByText("72 px"));
    const input = row.querySelector("input.num-in") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "90{Enter}");
    expect(lastArgsFor(onSetStyle, "fontsize")).toEqual(["group", "fontsize", 90]);
  });

  it("typing a Box-alpha commits a 2-digit hex string (base-16 parse)", async () => {
    const { onSetStyle, groupTier } = renderGroup();
    const row = within(groupTier).getByText("Box alpha").closest(".prow") as HTMLElement;
    await userEvent.click(within(row).getByText("0x40"));
    const input = row.querySelector("input.num-in") as HTMLInputElement;
    expect(input.value).toBe("40");           // seeded with the hex digits
    await userEvent.clear(input);
    await userEvent.type(input, "C0{Enter}");  // typed as hex
    expect(lastArgsFor(onSetStyle, "back_alpha")).toEqual(["group", "back_alpha", "C0"]);
  });
});
