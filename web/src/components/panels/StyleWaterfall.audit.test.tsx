// StyleWaterfall.audit.test.tsx — Cluster C audit: every editable style key,
// tier selection, inheritance, stepper mechanics, color swatches, border mode, align.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StyleWaterfall } from "./StyleWaterfall";
import { baseProject, withGroupStyle, withCueStyle } from "../../test-util/fixtures";
import { stubLocalStorage } from "../../test-util/storage";
import type { Project } from "../../types";

beforeEach(() => { stubLocalStorage(); });

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
    onSetStyle: vi.fn(),
    onClearStyle: vi.fn(),
    ...overrides,
  };
}
void mkProps;

// ---------- C-01 — Tier header = collapse only (zip 11 §7) ----------

describe("C-01 — tier header collapses; no scope-select, no selected ring", () => {
  it("C-01a — clicking a tier header collapses its rows and persists", async () => {
    const p = baseProject();
    render(<StyleWaterfall project={p} sel={selGroup()} aiTier={null} onSetStyle={vi.fn()} onClearStyle={vi.fn()} />);
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    expect(groupTier.classList.contains("collapsed")).toBe(false);
    await userEvent.click(within(groupTier).getByText("GROUP"));
    expect(groupTier.classList.contains("collapsed")).toBe(true);
    expect(JSON.parse(localStorage.getItem("kss.wfCollapsed")!)).toContain("group");
  });

  it("C-01b — clicking the header twice expands again", async () => {
    const p = baseProject();
    render(<StyleWaterfall project={p} sel={selGroup()} aiTier={null} onSetStyle={vi.fn()} onClearStyle={vi.fn()} />);
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    await userEvent.click(within(groupTier).getByText("GROUP"));
    await userEvent.click(within(groupTier).getByText("GROUP"));
    expect(groupTier.classList.contains("collapsed")).toBe(false);
  });

  it("C-01c — no tier carries a selected ring (.sel removed)", () => {
    const p = baseProject();
    const { container } = render(<StyleWaterfall project={p} sel={selGroup()} aiTier={null} onSetStyle={vi.fn()} onClearStyle={vi.fn()} />);
    expect(container.querySelectorAll(".tier3.sel").length).toBe(0);
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

// ---------- C-06 — Bold (B) driven by the FontPicker at group tier ----------
// Log: the standalone Bold toggle ROW is gone — bold/italic/underline are TYPO_KEYS
// driven by the FontPicker's B/I/U toggles inside the Font row's popover.

/** Open the Font row's FontPicker popover within the given tier and return it. */
async function openFontPopover(tier: HTMLElement) {
  const fontRow = within(tier).getByText(/^Font$/).closest(".prow") as HTMLElement;
  await userEvent.click(fontRow.querySelector(".ksp-field") as Element);
  return document.querySelector(".ksp-pop") as HTMLElement;
}

describe("C-06 — bold (FontPicker B) at group tier", () => {
  it("C-06a — clicking the FontPicker B calls onSetStyle('group','bold', !currentVal)", async () => {
    const onSetStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { bold: true });
    render(
      <StyleWaterfall project={p} sel={selGroup()} aiTier={null} onSetStyle={onSetStyle} onClearStyle={vi.fn()} />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const pop = await openFontPopover(groupTier);
    await userEvent.click(within(pop).getByTitle("Bold"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "bold", false);
  });

  it("C-06b — ADJ-12: toggling an explicit override to the inherited value CLEARS it", async () => {
    // global bold is `true`; the group overrides it to `false`. Toggling B flips to
    // `true` == inherited, so it clears the override (not an explicit set).
    const onSetStyle = vi.fn();
    const onClearStyle = vi.fn();
    const p = withGroupStyle(baseProject(), 0, { bold: false });
    render(
      <StyleWaterfall project={p} sel={selGroup()} aiTier={null} onSetStyle={onSetStyle} onClearStyle={onClearStyle} />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const pop = await openFontPopover(groupTier);
    await userEvent.click(within(pop).getByTitle("Bold"));
    expect(onClearStyle).toHaveBeenCalledWith("group", "bold");
    expect(onSetStyle).not.toHaveBeenCalled();
  });

  it("C-06c — italic/underline B/I/U toggles dispatch at the group tier", async () => {
    const onSetStyle = vi.fn();
    const p = baseProject(); // global italic/underline are false
    render(
      <StyleWaterfall project={p} sel={selGroup()} aiTier={null} onSetStyle={onSetStyle} onClearStyle={vi.fn()} />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const pop = await openFontPopover(groupTier);
    await userEvent.click(within(pop).getByTitle("Italic"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "italic", true);
    await userEvent.click(within(pop).getByTitle("Underline"));
    expect(onSetStyle).toHaveBeenCalledWith("group", "underline", true);
  });

  it("C-06d — typography keys are NOT rendered as standalone rows", () => {
    const p = baseProject();
    render(
      <StyleWaterfall project={p} sel={selGroup()} aiTier={null} onSetStyle={vi.fn()} onClearStyle={vi.fn()} />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    expect(within(groupTier).queryByText(/^Bold$/)).toBeNull();
    expect(within(groupTier).queryByText(/^Italic$/)).toBeNull();
    expect(within(groupTier).queryByText(/^Underline$/)).toBeNull();
  });
});

// ---------- C-07 — Color rows are ColorPicker fields (primary) ----------
// Log: the inline 7-swatch row (.sw-dot) is gone — each color key renders a
// ColorPicker in field mode; picking a palette swatch fires onChange → onSetStyle.

/** Open the ColorPicker popover in the named color row of a tier. */
async function openColorPopover(tier: HTMLElement, label: RegExp) {
  const row = within(tier).getByText(label).closest(".prow") as HTMLElement;
  await userEvent.click(row.querySelector(".ksp-field") as Element);
  return document.querySelector(".ksp-pop") as HTMLElement;
}
/** Click the palette swatch (.ksp-dot) for a given hex inside a popover. */
async function pickPaletteSwatch(pop: HTMLElement, hex: string) {
  const dot = [...pop.querySelectorAll(".ksp-swatches .ksp-dot")]
    .find((d) => (d as HTMLElement).title.toUpperCase() === hex.toUpperCase()) as HTMLElement;
  await userEvent.click(dot);
}

describe("C-07 — color rows are ColorPicker fields (primary) at group tier", () => {
  it("C-07a — the Fill row renders a ColorPicker field trigger (no inline .sw-dot row)", () => {
    const p = baseProject();
    render(
      <StyleWaterfall project={p} sel={selGroup()} aiTier={null} onSetStyle={vi.fn()} onClearStyle={vi.fn()} />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const fillRow = within(groupTier).getByText(/^Fill$/).closest(".prow") as HTMLElement;
    expect(fillRow.querySelector(".ksp-field")).toBeTruthy();
    expect(fillRow.querySelector(".sw-dot")).toBeNull();
  });

  it.each([["#FF3DA6"], ["#8A5BFF"], ["#3DE0FF"], ["#000000"]] as [string][])(
    "C-07b — picking palette swatch %s fires onSetStyle('group','primary', uppercased)",
    async (color) => {
      const onSetStyle = vi.fn();
      const p = withGroupStyle(baseProject(), 0, { primary: "#FFFFFF" });
      render(
        <StyleWaterfall project={p} sel={selGroup()} aiTier={null} onSetStyle={onSetStyle} onClearStyle={vi.fn()} />
      );
      const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
      const pop = await openColorPopover(groupTier, /^Fill$/);
      await pickPaletteSwatch(pop, color);
      expect(onSetStyle).toHaveBeenCalledWith("group", "primary", color);
    }
  );

  it("C-07c — the field trigger shows the current value", () => {
    const p = withGroupStyle(baseProject(), 0, { primary: "#FF3DA6" });
    render(
      <StyleWaterfall project={p} sel={selGroup()} aiTier={null} onSetStyle={vi.fn()} onClearStyle={vi.fn()} />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const fillRow = within(groupTier).getByText(/^Fill$/).closest(".prow") as HTMLElement;
    expect((fillRow.querySelector(".ksp-field-val") as HTMLElement).textContent).toBe("#FF3DA6");
  });
});

// ---------- C-08 — Color fields: outline (role=outline) and back (role=box) ----------

describe("C-08 — color fields for outline and back at group tier", () => {
  it("C-08a — picking an outline swatch calls onSetStyle('group','outline', color); role=outline", async () => {
    const onSetStyle = vi.fn();
    const p = baseProject();
    render(
      <StyleWaterfall project={p} sel={selGroup()} aiTier={null} onSetStyle={onSetStyle} onClearStyle={vi.fn()} />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const outlineLabel = within(groupTier).getAllByText(/^Outline$/).find((el) => el.className === "pl") as HTMLElement;
    const outlineRow = outlineLabel.closest(".prow") as HTMLElement;
    await userEvent.click(outlineRow.querySelector(".ksp-field") as Element);
    const pop = document.querySelector(".ksp-pop") as HTMLElement;
    // outline role: the preview strokes the text (text-stroke set), not a flat fill
    expect((pop.querySelector(".ksp-preview .ksp-cap") as HTMLElement).style.getPropertyValue("-webkit-text-stroke-color")).not.toBe("");
    await pickPaletteSwatch(pop, "#FF3DA6");
    expect(onSetStyle).toHaveBeenCalledWith("group", "outline", "#FF3DA6");
  });

  it("C-08b — picking a Box color swatch calls onSetStyle('group','back', color); role=box", async () => {
    const onSetStyle = vi.fn();
    const p = baseProject();
    render(
      <StyleWaterfall project={p} sel={selGroup()} aiTier={null} onSetStyle={onSetStyle} onClearStyle={vi.fn()} />
    );
    const groupTier = screen.getByText("GROUP").closest(".tier3") as HTMLElement;
    const pop = await openColorPopover(groupTier, /^Box color$/);
    expect((pop.querySelector(".ksp-preview .ksp-cap") as HTMLElement).style.background).not.toBe("");
    await pickPaletteSwatch(pop, "#8A5BFF");
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
        onSetStyle={onSetStyle}
        onClearStyle={vi.fn()}
      />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    const sizeRow = within(cueTier).getByText(/^Size$/).closest(".prow") as HTMLElement;
    await userEvent.click(within(sizeRow).getByText("+"));
    expect(onSetStyle).toHaveBeenCalledWith("cue", "fontsize", 66);
  });

  it("C-12b — cue tier ColorPicker palette swatch fires onSetStyle('cue','primary', color)", async () => {
    const onSetStyle = vi.fn();
    const p = withCueStyle(baseProject(), 0, 0, 0, { primary: "#FFFFFF" });
    render(
      <StyleWaterfall project={p} sel={selCue(p)} aiTier={null} onSetStyle={onSetStyle} onClearStyle={vi.fn()} />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    const pop = await openColorPopover(cueTier, /^Fill$/);
    await pickPaletteSwatch(pop, "#FF3DA6");
    expect(onSetStyle).toHaveBeenCalledWith("cue", "primary", "#FF3DA6");
  });

  it("C-12c — cue tier FontPicker B fires onSetStyle('cue','bold', !val)", async () => {
    const onSetStyle = vi.fn();
    const p = withCueStyle(baseProject(), 0, 0, 0, { bold: true });
    render(
      <StyleWaterfall project={p} sel={selCue(p)} aiTier={null} onSetStyle={onSetStyle} onClearStyle={vi.fn()} />
    );
    const cueTier = screen.getByText("CUE").closest(".tier3") as HTMLElement;
    const pop = await openFontPopover(cueTier);
    await userEvent.click(within(pop).getByTitle("Bold"));
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
