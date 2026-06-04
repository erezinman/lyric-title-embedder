import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FadeGroupPanel } from "./FadeGroupPanel";
import type { Project } from "../../types";

function proj(): Project {
  return {
    words: [{ text: "Hello", start: 0.0, end: 0.5 }],
    layout: [
      {
        label: "V1",
        accumulate: "words",
        win_start: null, win_end: null, linger: null, del: false,
        style: {},
        fade: {},
        lines: [{ toks: [{ ids: [0], sep: "", del: false, style: {} }] }],
      },
    ],
    fin_tags: [],
    fout_tags: [],
    globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 },
    global_style: {
      font: "Space Grotesk", fontsize: 64, bold: true, primary: "#FFFFFF",
      outline: "#000000", back: "#000000", back_alpha: "80",
      outline_w: 3, shadow: 0, border_style: 1,
    },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, pos: null },
    video: null,
  };
}

const finTag = { ids: [0], trigger: null };
const foutTag = { ids: [0], trigger: null };

describe("FadeGroupPanel — Global defaults section", () => {
  it("renders the Global defaults tier even when there are NO fade tags", () => {
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={null}
        foutTag={null}
        onSet={vi.fn()}
        onClear={vi.fn()}
        onSetDefault={vi.fn()}
      />
    );
    expect(screen.getByText(/Global defaults/i)).toBeTruthy();
  });

  it("renders a 'Global defaults' section showing current values from project.globals", () => {
    const p = proj();
    render(
      <FadeGroupPanel
        project={p}
        gi={0}
        finTag={finTag}
        foutTag={foutTag}
        onSet={vi.fn()}
        onClear={vi.fn()}
        onSetDefault={vi.fn()}
      />
    );
    const heading = screen.getByText(/Global defaults/i);
    expect(heading).toBeTruthy();
    // The global defaults rows are siblings after the heading; scope via closest container
    const panel = heading.closest(".fg-panel") as HTMLElement;
    // fade_in_ms = 250ms — at least one .v span should show it
    const fadeInRow = within(panel).getAllByText("Fade-in").find(el => el.closest(".prow"))!.closest(".prow") as HTMLElement;
    expect(within(fadeInRow).getByText("250ms")).toBeTruthy();
    const fadeOutRow = within(panel).getAllByText("Fade-out").find(el => el.closest(".prow"))!.closest(".prow") as HTMLElement;
    expect(within(fadeOutRow).getByText("1000ms")).toBeTruthy();
    // linger = 0s
    const lingerRow = within(panel).getByText("Linger").closest(".prow") as HTMLElement;
    expect(within(lingerRow).getByText("0s")).toBeTruthy();
  });

  it("clicking fade-in + calls onSetDefault('fade_in_ms', 300)", async () => {
    const onSetDefault = vi.fn();
    const p = proj();
    render(
      <FadeGroupPanel
        project={p}
        gi={0}
        finTag={finTag}
        foutTag={foutTag}
        onSet={vi.fn()}
        onClear={vi.fn()}
        onSetDefault={onSetDefault}
      />
    );
    // Scope to the Global defaults section container
    const globSection = screen.getByText(/Global defaults/i).closest(".fg-panel") as HTMLElement;
    // Find the Fade-in row (inside .prow) in the global defaults
    const fadeInRows = within(globSection).getAllByText("Fade-in");
    // the one inside a .prow (global defaults row, not fg-k)
    const fadeInRow = fadeInRows.find(el => el.closest(".prow"))!.closest(".prow") as HTMLElement;
    const plusBtn = within(fadeInRow).getByText("+");
    await userEvent.click(plusBtn);
    expect(onSetDefault).toHaveBeenCalledWith("fade_in_ms", 300);
  });

  it("clicking linger + calls onSetDefault('linger', 0.1)", async () => {
    const onSetDefault = vi.fn();
    const p = proj();
    render(
      <FadeGroupPanel
        project={p}
        gi={0}
        finTag={finTag}
        foutTag={foutTag}
        onSet={vi.fn()}
        onClear={vi.fn()}
        onSetDefault={onSetDefault}
      />
    );
    const lingerRow = screen.getByText("Linger").closest(".prow") as HTMLElement;
    const plusBtn = within(lingerRow).getByText("+");
    await userEvent.click(plusBtn);
    expect(onSetDefault).toHaveBeenCalledWith("linger", 0.1);
  });

  it("clicking fade-out − calls onSetDefault('fade_out_ms', 950)", async () => {
    const onSetDefault = vi.fn();
    const p = proj();
    render(
      <FadeGroupPanel
        project={p}
        gi={0}
        finTag={finTag}
        foutTag={foutTag}
        onSet={vi.fn()}
        onClear={vi.fn()}
        onSetDefault={onSetDefault}
      />
    );
    // Find the Fade-out row that is inside a .prow (global defaults), not .fg-k
    const fadeOutEls = screen.getAllByText("Fade-out");
    const fadeOutRow = fadeOutEls.find(el => el.closest(".prow"))!.closest(".prow") as HTMLElement;
    const minusBtn = within(fadeOutRow).getByText("−");
    await userEvent.click(minusBtn);
    expect(onSetDefault).toHaveBeenCalledWith("fade_out_ms", 950);
  });
});
