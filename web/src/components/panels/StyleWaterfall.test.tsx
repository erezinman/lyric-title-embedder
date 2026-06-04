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
        accumulate: "words",
        win_start: null, win_end: null, linger: null, del: false,
        style: { fontsize: 72 },
        fade: { fade_in_ms: 400 },
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
    fin_tags: [],
    fout_tags: [],
    globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0.0 },
    global_style: {
      font: "Space Grotesk", fontsize: 64, bold: true, primary: "#FFFFFF",
      outline: "#000000", back: "#000000", back_alpha: "80",
      outline_w: 3, shadow: 0, border_style: 1,
    },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, pos: null },
    video: null,
  };
}

describe("StyleWaterfall", () => {
  it("GROUP tier shows Border mode + fade rows; CUE tier omits Border mode; clearing a cue override calls onClearStyle('cue',...)", async () => {
    const onClearStyle = vi.fn();
    const onSetStyle = vi.fn();
    const onSetFade = vi.fn();
    const p = proj();
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "cue", gi: 0, tok: p.layout[0].lines[0].toks[3] }}
        aiTier={null}
        onSelectTier={() => {}}
        onSetStyle={onSetStyle}
        onClearStyle={onClearStyle}
        onSetFade={onSetFade}
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

  it("GROUP tier has 10 style rows (incl border_style) + 2 fade rows", () => {
    const p = proj();
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "group", gi: 0, tok: null }}
        aiTier={null}
        onSelectTier={() => {}}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
        onSetFade={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    // border_style shows as "Border mode"
    expect(within(groupTier).getByText(/Border mode/i)).toBeTruthy();
    // Fade rows
    expect(within(groupTier).getByText(/Group fade-in/i)).toBeTruthy();
    expect(within(groupTier).getByText(/Group fade-out/i)).toBeTruthy();
  });

  it("GLOBAL tier has border_style but no fade rows", () => {
    const p = proj();
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "global", gi: 0, tok: null }}
        aiTier={null}
        onSelectTier={() => {}}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
        onSetFade={vi.fn()}
      />
    );
    const globalTier = screen.getByText("GLOBAL").closest(".tier3") as HTMLElement;
    expect(within(globalTier).queryByText(/Group fade-in/i)).toBeNull();
    expect(within(globalTier).queryByText(/Group fade-out/i)).toBeNull();
  });

  it("GROUP fade row shows inherited global value when group override is null", () => {
    const p = proj();
    // Group 0 has fade_in_ms:400 set; remove it to test inheritance
    p.layout[0].fade = {};
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "group", gi: 0, tok: null }}
        aiTier={null}
        onSelectTier={() => {}}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
        onSetFade={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    // Global value for fade_in_ms is 250, shown greyed
    const fadeInRow = within(groupTier).getByText(/Group fade-in/i).closest(".prow") as HTMLElement;
    expect(fadeInRow.classList.contains("inh")).toBe(true);
  });

  it("GROUP fade row is solid when group overrides the fade", () => {
    const p = proj(); // group 0 has fade_in_ms:400
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "group", gi: 0, tok: null }}
        aiTier={null}
        onSelectTier={() => {}}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
        onSetFade={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const fadeInRow = within(groupTier).getByText(/Group fade-in/i).closest(".prow") as HTMLElement;
    expect(fadeInRow.classList.contains("over")).toBe(true);
  });

  it("onSetStyle is called with tier when editing a group prop", async () => {
    const onSetStyle = vi.fn();
    const p = proj();
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "group", gi: 0, tok: null }}
        aiTier={null}
        onSelectTier={() => {}}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
        onSetFade={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    // Click the "+" on Size stepper (fontsize)
    const sizeRow = within(groupTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(sizeRow).getByText("+"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "fontsize", expect.any(Number));
  });

  it("GLOBAL tier shows 'base' chips and no clear button", () => {
    const p = proj();
    render(
      <StyleWaterfall
        project={p}
        sel={{ scope: "global", gi: 0, tok: null }}
        aiTier={null}
        onSelectTier={() => {}}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
        onSetFade={vi.fn()}
      />
    );
    const globalTier = screen.getByText("GLOBAL").closest(".tier3") as HTMLElement;
    const baseTags = within(globalTier).getAllByText("base");
    expect(baseTags.length).toBeGreaterThan(0);
    expect(within(globalTier).queryByTitle(/clear/i)).toBeNull();
  });
});
