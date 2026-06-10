import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StyleWaterfall } from "./StyleWaterfall";
import type { Project } from "../../types";

function proj(): Project {
  return {
    words: [
      { text: "Caught", start: 0.3, end: 0.7 },
      { text: "in", start: 0.8, end: 1.0 },
      { text: "a", start: 1.05, end: 1.2 },
      { text: "bleat", start: 1.4, end: 2.0 },
    ],
    layout: [
      {
        label: "V1",
        win_start: null, win_end: null, linger: null, del: false,
        style: { fontsize: 72 },
        animations: [], suppress: [],
        lines: [{
          toks: [
            { ids: [0], sep: "", del: false, style: {} },
            { ids: [1], sep: "", del: false, style: {} },
            { ids: [2], sep: "", del: false, style: {} },
            { ids: [3], sep: "", del: false, style: { primary: "#FF3DA6" } },
          ],
        }],
      },
    ],
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

describe("StyleWaterfall", () => {
  it("GROUP tier shows Border mode; CUE tier omits Border mode; clearing a cue override calls onClearStyle('cue',...)", async () => {
    const onClearStyle = vi.fn();
    const onSetStyle = vi.fn();
    const p = proj();
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "cue", gi: 0, tok: p.layout[0].lines[0].toks[3] }}
        aiTier={null}
        onSetStyle={onSetStyle}
        onClearStyle={onClearStyle}
      />
    );

    // "Border mode" should appear somewhere (in GROUP + GLOBAL tiers)
    expect(screen.getAllByText(/Border mode/i).length).toBeGreaterThan(0);

    // CUE tier should NOT contain Border mode
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    expect(within(cueTier).queryByText(/Border mode/i)).toBeNull();

    // The cue's primary override has a clear button; click it
    await userEvent.click(within(cueTier).getByTitle(/clear/i));
    expect(onClearStyle).toHaveBeenCalledWith("cue", expect.any(String));
  });

  it("GROUP tier shows border_style row (Border mode)", () => {
    const p = proj();
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "group", gi: 0, tok: null }}
        aiTier={null}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    // border_style shows as "Border mode"
    expect(within(groupTier).getByText(/Border mode/i)).toBeTruthy();
  });

  it("onSetStyle is called with tier when editing a group prop", async () => {
    const onSetStyle = vi.fn();
    const p = proj();
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "group", gi: 0, tok: null }}
        aiTier={null}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    // Click the "+" on Size stepper (fontsize)
    const sizeRow = within(groupTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(sizeRow).getByText("+"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "fontsize", expect.any(Number));
  });

  it("CUE badge/preview shows full merged-cue text, not just the first word (#10i)", () => {
    const p = proj();
    // merged cue: words 0 ("Caught") + 1 ("in"), joined by a space
    const mergedTok = { ids: [0, 1], sep: " ", del: false, style: {} };
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "cue", gi: 0, tok: mergedTok }}
        aiTier={null}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    // badge text node should contain the full merged text, not just "Caught"
    expect(within(cueTier).getByText('"Caught in"')).toBeTruthy();
    expect(within(cueTier).queryByText('"Caught"')).toBeNull();
  });

  it("GROUP preview hybrid: shows the selected cue's text when a cue is selected (#10ii)", async () => {
    const p = proj();
    // a merged cue: "Caught in"
    const mergedTok = { ids: [0, 1], sep: " ", del: false, style: {} };
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "cue", gi: 0, tok: mergedTok }}
        aiTier={null}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    // GROUP badge still shows the label (unchanged)
    expect(within(groupTier).getByText("V1")).toBeTruthy();
    // Open the GROUP tier's Font picker; its preview caption is the GROUP previewText
    await userEvent.click(groupTier.querySelector(".ksp-field") as HTMLElement);
    const cap = document.querySelector(".ksp-cap") as HTMLElement;
    expect(cap.textContent).toBe("Caught in");
  });

  it("GROUP preview hybrid: falls back to the group label when no cue is selected (#10ii)", async () => {
    const p = proj();
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "group", gi: 0, tok: null }}
        aiTier={null}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    await userEvent.click(groupTier.querySelector(".ksp-field") as HTMLElement);
    const cap = document.querySelector(".ksp-cap") as HTMLElement;
    expect(cap.textContent).toBe("V1");
  });

  it("GLOBAL tier shows 'base' chips and no clear button", () => {
    const p = proj();
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "global", gi: 0, tok: null }}
        aiTier={null}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const globalTier = screen.getByText("GLOBAL").closest(".tier3") as HTMLElement;
    const baseTags = within(globalTier).getAllByText("base");
    expect(baseTags.length).toBeGreaterThan(0);
    expect(within(globalTier).queryByTitle(/clear/i)).toBeNull();
  });
});
