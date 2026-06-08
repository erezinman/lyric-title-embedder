/**
 * StyleWaterfall.font.test.tsx — §6 font picker. The font row is a real dropdown
 * of families fetched from /api/fonts (module-cached), dispatching the standard
 * style partial {font} at the active tier. Clear-override still works.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import type { Project } from "../../types";

// Mock the fonts endpoint at the client boundary so we control the option list
// without touching the module-level cache directly.
const FONTS = ["Arial", "DejaVu Sans", "Inter", "Space Grotesk"];
vi.mock("../../api/client", () => ({
  getFonts: vi.fn(() => Promise.resolve(FONTS)),
}));

// Import AFTER the mock so StyleWaterfall picks up the mocked getFonts.
import { StyleWaterfall } from "./StyleWaterfall";

function proj(): Project {
  return {
    words: [{ text: "Caught", start: 0.3, end: 0.7 }],
    layout: [{
      label: "V1", win_start: null, win_end: null, linger: null, del: false,
      style: { fontsize: 72 }, animations: [], suppress: [],
      lines: [{ toks: [{ ids: [0], sep: "", del: false, style: { font: "Inter" } }] }],
    }],
    anim_tags: [],
    globals: { linger: 0.0, animations: [] },
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
      onSelectTier={() => {}}
      onSetStyle={onSetStyle}
      onClearStyle={onClearStyle}
    />,
  );
  return { onSetStyle, onClearStyle };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("StyleWaterfall — font picker (§6)", () => {
  function globalFontSelect(): HTMLSelectElement {
    const globalTier = screen.getByText("GLOBAL").closest(".tier3") as HTMLElement;
    const row = within(globalTier).getByText("Font").closest(".prow") as HTMLElement;
    return within(row).getByRole("combobox") as HTMLSelectElement;
  }

  it("FW-01 — font row renders a <select> of the fetched families", async () => {
    renderWith("global");
    await waitFor(() => expect(within(globalFontSelect()).getAllByRole("option").length).toBeGreaterThan(1));
    const sel = globalFontSelect();
    expect(sel.tagName).toBe("SELECT");
    const opts = within(sel).getAllByRole("option").map((o) => o.textContent);
    for (const f of FONTS) expect(opts).toContain(f);
  });

  it("FW-02 — choosing a font dispatches onSetStyle('global', 'font', value)", async () => {
    const { onSetStyle } = renderWith("global");
    await waitFor(() => expect(within(globalFontSelect()).getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(globalFontSelect(), { target: { value: "Arial" } });
    expect(onSetStyle).toHaveBeenCalledWith("global", "font", "Arial");
  });

  it("FW-03 — at the group tier it dispatches onSetStyle('group', ...)", async () => {
    // group's font is inherited from global ("Space Grotesk") since group.style has no font
    const { onSetStyle } = renderWith("group");
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const sel = within(groupTier).getByRole("combobox");
    await waitFor(() => expect(within(sel as HTMLElement).getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(sel, { target: { value: "Inter" } });
    expect(onSetStyle).toHaveBeenCalledWith("group", "font", "Inter");
  });

  it("FW-04 — at the cue tier it dispatches onSetStyle('cue', ...)", async () => {
    const { onSetStyle } = renderWith("cue");
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    const sel = within(cueTier).getByRole("combobox");
    await waitFor(() => expect(within(sel as HTMLElement).getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(sel, { target: { value: "Arial" } });
    expect(onSetStyle).toHaveBeenCalledWith("cue", "font", "Arial");
  });

  it("FW-05 — a cue font override exposes a clear (X) that calls onClearStyle('cue','font')", async () => {
    const { onClearStyle } = renderWith("cue");
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    // the Font row is overridden (font: "Inter") → has a clear button
    const fontRow = within(cueTier).getByText("Font").closest(".prow") as HTMLElement;
    const clearBtn = within(fontRow).getByTitle(/clear/i);
    fireEvent.click(clearBtn);
    expect(onClearStyle).toHaveBeenCalledWith("cue", "font");
  });

  it("FW-06 — the current font value is always selectable even if not in the fetched list", async () => {
    // global font "Space Grotesk" is in FONTS; switch to a value NOT in the list to verify it stays shown.
    const p = proj();
    p.global_style.font = "Comic Sans MS"; // not in FONTS
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "global", gi: 0, tok: null }}
        aiTier={null}
        onSelectTier={() => {}}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />,
    );
    const globalTier = screen.getByText("GLOBAL").closest(".tier3") as HTMLElement;
    const row = within(globalTier).getByText("Font").closest(".prow") as HTMLElement;
    const sel = within(row).getByRole("combobox") as HTMLSelectElement;
    expect(sel.value).toBe("Comic Sans MS");
  });
});
