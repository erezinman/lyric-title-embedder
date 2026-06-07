// StyleWaterfall.audit.test.tsx — Cluster C audit: every editable style key,
// tier selection, inheritance, stepper mechanics, color swatches, border mode, align.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StyleWaterfall } from "./StyleWaterfall";
import { baseProject, withGroupStyle, withCueStyle } from "../../test-util/fixtures";
import type { Project } from "../../types";

// ---------- helpers ----------

function selGroup(gi = 0) {
  return { scope: "group" as const, gi, tok: null };
}

function selCue(p: Project, gi = 0, li = 0, ti = 0) {
  return { scope: "cue" as const, gi, tok: p.layout[gi].lines[li].toks[ti] };
}

function selGlobal() {
  return { scope: "global" as const, gi: 0, tok: null };
}

function mkProps(overrides: Partial<Parameters<typeof StyleWaterfall>[0]> = {}) {
  const p = baseProject();
  return {
    project: p,
    sel: selGroup(),
    aiTier: null as null,
    onSelectTier: vi.fn(),
    onSetStyle: vi.fn(),
    onClearStyle: vi.fn(),
    ...overrides,
  };
}
void mkProps;

// ---------- C-01 — Tier selection ----------

describe("C-01 — tier selection fires onSelectTier", () => {
  it("C-01a — clicking GLOBAL tier calls onSelectTier('global')", async () => {
    const onSelectTier = vi.fn();
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={onSelectTier}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText("GLOBAL").closest(".tier3")!);
    expect(onSelectTier).toHaveBeenCalledWith("global");
  });

  it("C-01b — clicking GROUP tier calls onSelectTier('group')", async () => {
    const onSelectTier = vi.fn();
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selGlobal()}
        aiTier={null}
        onSelectTier={onSelectTier}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText("GROUP").closest(".tier3")!);
    expect(onSelectTier).toHaveBeenCalledWith("group");
  });

  it("C-01c — clicking CUE tier calls onSelectTier('cue')", async () => {
    const onSelectTier = vi.fn();
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selCue(p)}
        aiTier={null}
        onSelectTier={onSelectTier}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText("CUE").closest(".tier3")!);
    expect(onSelectTier).toHaveBeenCalledWith("cue");
  });

  it("C-01d — selected tier has 'sel' class", () => {
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    expect(groupTier.classList.contains("sel")).toBe(true);
    const globalTier = screen.getByText("GLOBAL").closest(".tier3") as HTMLElement;
    expect(globalTier.classList.contains("sel")).toBe(false);
  });
});

// ---------- C-02 — fontsize stepper (group tier) ----------

describe("C-02 — fontsize stepper at group tier", () => {
  it("C-02a — '+' fires onSetStyle('group','fontsize', currentVal+2)", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { fontsize: 72 });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const sizeRow = within(groupTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(sizeRow).getByText("+"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "fontsize", 74);
  });

  it("C-02b — '−' fires onSetStyle('group','fontsize', currentVal-2)", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { fontsize: 72 });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const sizeRow = within(groupTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(sizeRow).getByText("−"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "fontsize", 70);
  });

  it("C-02c — fontsize does not go below 8 (min clamp)", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { fontsize: 8 });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const sizeRow = within(groupTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(sizeRow).getByText("−"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "fontsize", 8);
  });

  it("C-02d — double press '+' cumulative: fires twice with 72→74→76", async () => {
    const onSetStyle = vi.fn();
    // We test the values passed on each call — the component uses prop value each time,
    // so we need to re-render after the first click. Use a simple wrapper to verify both calls.
    const p = withGroupStyle(baseProject(), 0, { fontsize: 72 });
    const { rerender } = render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const sizeRow = within(groupTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(sizeRow).getByText("+"));
    expect(onSetStyle).toHaveBeenNthCalledWith(1, "group", "fontsize", 74);

    // Simulate state update — re-render with updated fontsize
    const p2 = withGroupStyle(baseProject(), 0, { fontsize: 74 });
    rerender(
      <StyleWaterfall
        project={p2}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier2 = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const sizeRow2 = within(groupTier2).getByText(/^Size$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(sizeRow2).getByText("+"));
    expect(onSetStyle).toHaveBeenNthCalledWith(2, "group", "fontsize", 76);
  });

  it("C-02e — up then down nets original value", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { fontsize: 72 });
    const { rerender } = render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const sizeRow = within(groupTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(sizeRow).getByText("+"));
    const p2 = withGroupStyle(baseProject(), 0, { fontsize: 74 });
    rerender(
      <StyleWaterfall
        project={p2}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier2 = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const sizeRow2 = within(groupTier2).getByText(/^Size$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(sizeRow2).getByText("−"));
    expect(onSetStyle).toHaveBeenNthCalledWith(2, "group", "fontsize", 72);
  });
});

// ---------- C-03 — outline_w stepper (step 1, min 0) ----------

describe("C-03 — outline_w stepper", () => {
  it("C-03a — '+' calls onSetStyle('group','outline_w', currentVal+1)", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { outline_w: 3 });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const row = within(groupTier).getByText(/^Outline w$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(row).getByText("+"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "outline_w", 4);
  });

  it("C-03b — min 0: decrementing from 0 stays at 0", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { outline_w: 0 });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const row = within(groupTier).getByText(/^Outline w$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(row).getByText("−"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "outline_w", 0);
  });
});

// ---------- C-04 — shadow stepper (step 1, min 0) ----------

describe("C-04 — shadow stepper", () => {
  it("C-04a — '+' calls onSetStyle('group','shadow', currentVal+1)", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { shadow: 2 });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const row = within(groupTier).getByText(/^Shadow$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(row).getByText("+"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "shadow", 3);
  });

  it("C-04b — min 0: decrement from 0 stays at 0", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { shadow: 0 });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const row = within(groupTier).getByText(/^Shadow$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(row).getByText("−"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "shadow", 0);
  });
});

// ---------- C-05 — back_alpha stepper (hex, step 0x10, clamp 00/FF) ----------

describe("C-05 — back_alpha stepper (hex)", () => {
  it("C-05a — '+' increments hex value by 0x10", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { back_alpha: "80" });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const row = within(groupTier).getByText(/^Box alpha$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(row).getByText("+"));
    // 0x80 = 128; 128+16 = 144 = 0x90
    expect(onSetStyle).toHaveBeenCalledWith("group", "back_alpha", "90");
  });

  it("C-05b — clamps at max FF", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { back_alpha: "F0" });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const row = within(groupTier).getByText(/^Box alpha$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(row).getByText("+"));
    // 0xF0=240; 240+16=256 => clamp to 255 = 0xFF
    expect(onSetStyle).toHaveBeenCalledWith("group", "back_alpha", "FF");
  });

  it("C-05c — clamps at min 00", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { back_alpha: "08" });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const row = within(groupTier).getByText(/^Box alpha$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(row).getByText("−"));
    // 0x08=8; 8-16= -8 => clamp to 0 = 00
    expect(onSetStyle).toHaveBeenCalledWith("group", "back_alpha", "00");
  });
});

// ---------- C-06 — Bold toggle at group tier ----------

describe("C-06 — bold toggle at group tier", () => {
  it("C-06a — clicking bold toggle calls onSetStyle('group','bold', !currentVal)", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { bold: true });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const boldRow = within(groupTier).getByText(/^Bold$/).closest(".prow") as HTMLElement;
    await userEvent.click(boldRow.querySelector(".toggle, .pv-ctl") as Element);
    expect(onSetStyle).toHaveBeenCalledWith("group", "bold", false);
  });

  it("C-06b — ADJ-12: toggling an explicit override to the inherited value CLEARS it (not an explicit set)", async () => {
    // ADJ-12: global bold is `true`. The group explicitly overrides it to `false`.
    // Toggling flips to `true`, which equals the inherited (global) value — so the
    // toggle clears the override (round-trips to inherited) instead of writing an
    // explicit `bold: true`. Equality-clears applies only to the toggle kind.
    const onSetStyle = vi.fn();
    const onClearStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { bold: false });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={onClearStyle}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const boldRow = within(groupTier).getByText(/^Bold$/).closest(".prow") as HTMLElement;
    await userEvent.click(boldRow.querySelector(".toggle, .pv-ctl") as Element);
    expect(onClearStyle).toHaveBeenCalledWith("group", "bold");
    expect(onSetStyle).not.toHaveBeenCalled();
  });
});

// ---------- C-07 — Color swatches (primary) at group tier ----------

describe("C-07 — color swatches (primary) at group tier", () => {
  const COLOR_OPTS = ["#FFFFFF", "#FF3DA6", "#8A5BFF", "#3DE0FF", "#000000", "#4DE0C2", "#FFC24D"];

  it("C-07a — 7 swatches rendered in Fill row at group tier", () => {
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const fillRow = within(groupTier).getByText(/^Fill$/).closest(".prow") as HTMLElement;
    const swatches = fillRow.querySelectorAll(".sw-dot");
    expect(swatches.length).toBe(7);
  });

  it.each(COLOR_OPTS.map((c, i) => [i, c] as [number, string]))(
    "C-07b — clicking swatch %i (%s) fires onSetStyle('group','primary','%s')",
    async (idx, color) => {
      const onSetStyle = vi.fn();
      const p = withGroupStyle(baseProject(), 0, { primary: "#FFFFFF" });
      render(
        <StyleWaterfall
          project={p}
          sel={selGroup()}
          aiTier={null}
          onSelectTier={vi.fn()}
          onSetStyle={onSetStyle}
          onClearStyle={vi.fn()}
        />
      );
      const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
      const fillRow = within(groupTier).getByText(/^Fill$/).closest(".prow") as HTMLElement;
      const swatches = fillRow.querySelectorAll(".sw-dot");
      await userEvent.click(swatches[idx] as Element);
      expect(onSetStyle).toHaveBeenCalledWith("group", "primary", color);
    }
  );

  it("C-07c — active swatch has 'on' class", () => {
    const p = withGroupStyle(baseProject(), 0, { primary: "#FF3DA6" });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const fillRow = within(groupTier).getByText(/^Fill$/).closest(".prow") as HTMLElement;
    const onSwatch = fillRow.querySelector(".sw-dot.on") as HTMLElement;
    expect(onSwatch).toBeTruthy();
    expect(onSwatch.style.background).toContain(""); // just check it exists
  });
});

// ---------- C-08 — Color swatches: outline and back ----------

describe("C-08 — color swatches for outline and back at group tier", () => {
  it("C-08a — clicking outline swatch calls onSetStyle('group','outline', color)", async () => {
    const onSetStyle = vi.fn();
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    // "Outline" is both a label (.pl) and a button text; query by label class to find the row
    const outlineLabel = within(groupTier)
      .getAllByText(/^Outline$/)
      .find((el) => el.className === "pl") as HTMLElement;
    const outlineRow = outlineLabel.closest(".prow") as HTMLElement;
    const swatches = outlineRow.querySelectorAll(".sw-dot");
    await userEvent.click(swatches[1] as Element); // #FF3DA6
    expect(onSetStyle).toHaveBeenCalledWith("group", "outline", "#FF3DA6");
  });

  it("C-08b — clicking back color swatch calls onSetStyle('group','back', color)", async () => {
    const onSetStyle = vi.fn();
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const backRow = within(groupTier).getByText(/^Box color$/).closest(".prow") as HTMLElement;
    const swatches = backRow.querySelectorAll(".sw-dot");
    await userEvent.click(swatches[2] as Element); // #8A5BFF
    expect(onSetStyle).toHaveBeenCalledWith("group", "back", "#8A5BFF");
  });
});

// ---------- C-09 — border_style mode buttons (group only) ----------

describe("C-09 — border_style Outline/Box buttons at group tier", () => {
  it("C-09a — 'Outline' button fires onSetStyle('group','border_style',1)", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { border_style: 3 });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const borderRow = within(groupTier).getByText(/Border mode/i).closest(".prow") as HTMLElement;
    await userEvent.click(within(borderRow).getByText("Outline"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "border_style", 1);
  });

  it("C-09b — 'Box' button fires onSetStyle('group','border_style',3)", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { border_style: 1 });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const borderRow = within(groupTier).getByText(/Border mode/i).closest(".prow") as HTMLElement;
    await userEvent.click(within(borderRow).getByText("Box"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "border_style", 3);
  });

  it("C-09c — CUE tier has NO Border mode row", () => {
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selCue(p)}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    expect(within(cueTier).queryByText(/Border mode/i)).toBeNull();
  });
});

// ---------- C-10 — align grid at group tier ----------

describe("C-10 — align grid at group tier", () => {
  it("C-10a — clicking an alignment cell calls onSetStyle('group','align', number)", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { align: 2 });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const alignRow = within(groupTier).getByText(/^Alignment$/).closest(".prow") as HTMLElement;
    // AlignGrid is a dropdown: first click the toggle button to open, then click a cell
    const toggleBtn = alignRow.querySelector("button.kit-sel") as HTMLElement;
    expect(toggleBtn).toBeTruthy();
    await userEvent.click(toggleBtn);
    // Now the grid is open; click the first cell
    const cells = document.querySelectorAll(".ag-cell");
    expect(cells.length).toBeGreaterThan(0);
    await userEvent.click(cells[0] as Element);
    expect(onSetStyle).toHaveBeenCalledWith("group", "align", expect.any(Number));
  });

  it("C-10b — CUE tier has NO align row", () => {
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selCue(p)}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    expect(within(cueTier).queryByText(/^Alignment$/)).toBeNull();
  });
});

// ---------- C-11 — Inheritance display ----------

describe("C-11 — inheritance display and clear override", () => {
  it("C-11a — cue row shows 'grp' source when group overrides the value", () => {
    const p = withGroupStyle(baseProject(), 0, { fontsize: 72 });
    render(
      <StyleWaterfall
        project={p}
        sel={selCue(p)}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    // Size row inherits from group, so should show "grp"
    const sizeRow = within(cueTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    expect(within(sizeRow).queryByText("grp")).toBeTruthy();
  });

  it("C-11b — cue row shows 'glob' source when only global has the value", () => {
    const p = baseProject(); // no group override for fontsize
    render(
      <StyleWaterfall
        project={p}
        sel={selCue(p)}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    const sizeRow = within(cueTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    expect(within(sizeRow).queryByText("glob")).toBeTruthy();
  });

  it("C-11c — overridden cue row shows clear button", () => {
    const p = withCueStyle(baseProject(), 0, 0, 0, { primary: "#FF3DA6" });
    render(
      <StyleWaterfall
        project={p}
        sel={selCue(p)}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    const fillRow = within(cueTier).getByText(/^Fill$/).closest(".prow") as HTMLElement;
    expect(within(fillRow).queryByTitle(/clear/i)).toBeTruthy();
  });

  it("C-11d — clear button fires onClearStyle('cue', 'primary')", async () => {
    const onClearStyle = vi.fn();
    const p = withCueStyle(baseProject(), 0, 0, 0, { primary: "#FF3DA6" });
    render(
      <StyleWaterfall
        project={p}
        sel={selCue(p)}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={onClearStyle}
      />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    const fillRow = within(cueTier).getByText(/^Fill$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(fillRow).getByTitle(/clear/i));
    expect(onClearStyle).toHaveBeenCalledWith("cue", "primary");
  });

  it("C-11e — after clear, row shows inherited value (no clear button)", () => {
    // Render without override → should show inherited state with no clear button
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selCue(p)}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    const fillRow = within(cueTier).getByText(/^Fill$/).closest(".prow") as HTMLElement;
    expect(within(fillRow).queryByTitle(/clear/i)).toBeNull();
  });

  it("C-11f — group tier: no clear button on non-overridden row shows 'glob'", () => {
    const p = baseProject(); // no group overrides
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const sizeRow = within(groupTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    expect(within(sizeRow).queryByTitle(/clear/i)).toBeNull();
    expect(within(sizeRow).queryByText("glob")).toBeTruthy();
  });

  it("C-11g — group tier: overridden row shows clear button; click calls onClearStyle('group', key)", async () => {
    const onClearStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { fontsize: 72 });
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={onClearStyle}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const sizeRow = within(groupTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(sizeRow).getByTitle(/clear/i));
    expect(onClearStyle).toHaveBeenCalledWith("group", "fontsize");
  });
});

// ---------- C-12 — CUE tier style controls ----------

describe("C-12 — cue tier style controls", () => {
  it("C-12a — cue tier fontsize '+' fires onSetStyle('cue','fontsize', val+2)", async () => {
    const onSetStyle = vi.fn();
    const p = withCueStyle(baseProject(), 0, 0, 0, { fontsize: 64 });
    render(
      <StyleWaterfall
        project={p}
        sel={selCue(p)}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    const sizeRow = within(cueTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(sizeRow).getByText("+"));
    expect(onSetStyle).toHaveBeenCalledWith("cue", "fontsize", 66);
  });

  it("C-12b — cue tier primary swatch fires onSetStyle('cue','primary', color)", async () => {
    const onSetStyle = vi.fn();
    const p = withCueStyle(baseProject(), 0, 0, 0, { primary: "#FFFFFF" });
    render(
      <StyleWaterfall
        project={p}
        sel={selCue(p)}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    const fillRow = within(cueTier).getByText(/^Fill$/).closest(".prow") as HTMLElement;
    const swatches = fillRow.querySelectorAll(".sw-dot");
    await userEvent.click(swatches[1] as Element); // #FF3DA6
    expect(onSetStyle).toHaveBeenCalledWith("cue", "primary", "#FF3DA6");
  });

  it("C-12c — cue tier bold toggle fires onSetStyle('cue','bold', !val)", async () => {
    const onSetStyle = vi.fn();
    const p = withCueStyle(baseProject(), 0, 0, 0, { bold: true });
    render(
      <StyleWaterfall
        project={p}
        sel={selCue(p)}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    const boldRow = within(cueTier).getByText(/^Bold$/).closest(".prow") as HTMLElement;
    await userEvent.click(boldRow.querySelector(".toggle, .pv-ctl") as Element);
    expect(onSetStyle).toHaveBeenCalledWith("cue", "bold", false);
  });
});

// ---------- C-13 — Global tier ----------

describe("C-13 — global tier controls", () => {
  it("C-13a — global fontsize '+' fires onSetStyle('global','fontsize', val+2)", async () => {
    const onSetStyle = vi.fn();
    const p = baseProject(); // global fontsize = 64
    render(
      <StyleWaterfall
        project={p}
        sel={selGlobal()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const globalTier = screen.getByText("GLOBAL").closest(".tier3") as HTMLElement;
    const sizeRow = within(globalTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(sizeRow).getByText("+"));
    expect(onSetStyle).toHaveBeenCalledWith("global", "fontsize", 66);
  });

  it("C-13b — global tier: all rows show 'base' chip, no clear button", () => {
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selGlobal()}
        aiTier={null}
        onSelectTier={vi.fn()}
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


// ---------- C-15 — CUE badge shows first word text ----------

describe("C-15 — CUE tier badge", () => {
  it("C-15a — cue tier badge contains the text of the selected word", () => {
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selCue(p)}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    // word 0 is "alpha"
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    expect(within(cueTier).queryByText(/"alpha"/)).toBeTruthy();
  });
});

// ---------- C-16 — aiHot class ----------

describe("C-16 — aiTier hot class", () => {
  it("C-16a — aiTier='group' adds aihot class to GROUP tier", () => {
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier="group"
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    expect(groupTier.classList.contains("aihot")).toBe(true);
  });

  it("C-16b — aiTier=null adds aihot to no tier", () => {
    const p = baseProject();
    render(
      <StyleWaterfall
        project={p}
        sel={selGroup()}
        aiTier={null}
        onSelectTier={vi.fn()}
        onSetStyle={vi.fn()}
        onClearStyle={vi.fn()}
      />
    );
    const globalTier = screen.getByText("GLOBAL").closest(".tier3") as HTMLElement;
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    expect(globalTier.classList.contains("aihot")).toBe(false);
    expect(groupTier.classList.contains("aihot")).toBe(false);
  });
});
