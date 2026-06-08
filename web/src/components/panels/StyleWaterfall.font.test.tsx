/**
 * StyleWaterfall.font.test.tsx — §3.2 font row. The Font row now renders a
 * FontPicker (field mode) that drives the `font` key AND bold/italic/underline
 * via onTypo at the active tier. Picking a face dispatches the {font} partial;
 * the curated KSP_FONTS list backs the picker (no /api/fonts fetch for the list).
 * Clear-override still works.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project } from "../../types";
import { stubLocalStorage } from "../../test-util/storage";

// FontPicker imports `fonts` from the client for uploads; mock it so the row
// never hits the network. The face list comes from the curated KSP_FONTS set.
vi.mock("../../api/client", () => ({
  fonts: { list: vi.fn(), upload: vi.fn(() => Promise.resolve({ family: "x", url: "" })), remove: vi.fn(() => Promise.resolve({ deleted: true })) },
}));

import { StyleWaterfall } from "./StyleWaterfall";

function proj(): Project {
  return {
    words: [{ text: "Caught", start: 0.3, end: 0.7 }],
    layout: [{
      label: "V1", win_start: null, win_end: null, linger: null, del: false,
      style: { fontsize: 72 }, animations: [], suppress: [],
      lines: [{ toks: [{ ids: [0], sep: "", del: false, style: { font: "Oswald" } }] }],
    }],
    anim_tags: [],
    globals: { linger: 0.0, animations: [], text_direction: "auto", bidi_marks: true },
    global_style: {
      font: "Space Grotesk", fontsize: 64, bold: true, italic: false, underline: false, primary: "#FFFFFF",
      outline: "#000000", back: "#000000", back_alpha: "80",
      outline_w: 3, shadow: 0, border_style: 1, align: 2,
    },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, pos: null },
    video: null,
  };
}

function renderWith(scope: "global" | "group" | "cue", onSetStyle = vi.fn(), onClearStyle = vi.fn()) {
  const p = proj();
  const tok = scope === "cue" ? p.layout[0].lines[0].toks[0] : null;
  render(
    <StyleWaterfall
      project={p}
      sel={{ scope, gi: 0, tok }}
      aiTier={null}
      onSetStyle={onSetStyle}
      onClearStyle={onClearStyle}
    />,
  );
  return { onSetStyle, onClearStyle };
}

/** Open the FontPicker popover in the given tier. */
async function openFontPopover(tierTitle: string): Promise<HTMLElement> {
  const tier = screen.getByText(tierTitle).closest(".tier3") as HTMLElement;
  const row = within(tier).getByText(/^Font$/).closest(".prow") as HTMLElement;
  await userEvent.click(row.querySelector(".ksp-field") as Element);
  return document.querySelector(".ksp-pop") as HTMLElement;
}

beforeEach(() => { vi.clearAllMocks(); stubLocalStorage(); });

describe("StyleWaterfall — font row (FontPicker, §3.2)", () => {
  it("FW-01 — the Font row renders a FontPicker field (no <select>)", () => {
    renderWith("global");
    const globalTier = screen.getByText("GLOBAL").closest(".tier3") as HTMLElement;
    const row = within(globalTier).getByText(/^Font$/).closest(".prow") as HTMLElement;
    expect(row.querySelector(".ksp-field")).toBeTruthy();
    expect(row.querySelector("select")).toBeNull();
  });

  it("FW-02 — picking a face dispatches onSetStyle('global','font', value)", async () => {
    const { onSetStyle } = renderWith("global");
    const pop = await openFontPopover("GLOBAL");
    await userEvent.click(within(pop).getByText("Montserrat"));
    expect(onSetStyle).toHaveBeenCalledWith("global", "font", "Montserrat");
  });

  it("FW-03 — at the group tier it dispatches onSetStyle('group', ...)", async () => {
    const { onSetStyle } = renderWith("group");
    const pop = await openFontPopover("GROUP");
    await userEvent.click(within(pop).getByText("Anton"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "font", "Anton");
  });

  it("FW-04 — at the cue tier it dispatches onSetStyle('cue', ...)", async () => {
    const { onSetStyle } = renderWith("cue");
    const pop = await openFontPopover("CUE");
    await userEvent.click(within(pop).getByText("Bebas Neue"));
    expect(onSetStyle).toHaveBeenCalledWith("cue", "font", "Bebas Neue");
  });

  it("FW-05 — a cue font override exposes a clear (X) that calls onClearStyle('cue','font')", async () => {
    const { onClearStyle } = renderWith("cue");
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    const fontRow = within(cueTier).getByText(/^Font$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(fontRow).getByTitle(/clear/i));
    expect(onClearStyle).toHaveBeenCalledWith("cue", "font");
  });

  it("FW-06 — the field trigger shows the current font value", () => {
    renderWith("cue");
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    const fontRow = within(cueTier).getByText(/^Font$/).closest(".prow") as HTMLElement;
    // cue overrides font to "Oswald"
    expect((fontRow.querySelector(".ksp-field-val") as HTMLElement).textContent).toBe("Oswald");
  });

  it("FW-07 — the FontPicker B/I/U drive bold/italic/underline at the tier", async () => {
    const { onSetStyle } = renderWith("group");
    const pop = await openFontPopover("GROUP");
    await userEvent.click(within(pop).getByTitle("Italic"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "italic", true);
  });
});
