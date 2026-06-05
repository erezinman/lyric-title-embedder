// AlignGrid.audit.test.tsx — Cluster B audit for the alignment popover atom.
// Goes beyond AlignGrid.test.tsx: every value's trigger label, ALL NINE cells
// firing the correct onPick(n) AND closing, the full numpad spatial order, the
// disabled-blocks-open gate, and a double open/close cycle.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AlignGrid } from "./AlignGrid";

const LABELS: Record<number, string> = {
  1: "Bottom-Left", 2: "Bottom-Center", 3: "Bottom-Right",
  4: "Mid-Left", 5: "Center", 6: "Mid-Right",
  7: "Top-Left", 8: "Top-Center", 9: "Top-Right",
};
const NUMPAD = [7, 8, 9, 4, 5, 6, 1, 2, 3];

const cells = () => screen.getAllByRole("button").filter((b) => b.classList.contains("ag-cell"));
const open = () => fireEvent.click(screen.getByLabelText("Alignment"));

beforeEach(() => vi.restoreAllMocks());

describe("AlignGrid audit — trigger label per value", () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    it(`B-54.${n} — value ${n} trigger reads '${LABELS[n]} (${n})'`, () => {
      render(<AlignGrid value={n} onPick={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Alignment" })).toHaveTextContent(`${LABELS[n]} (${n})`);
    });
  }

  it("B-55 — value 0 (unset) falls back to Bottom-Center (2)", () => {
    render(<AlignGrid value={0} onPick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Alignment" })).toHaveTextContent("Bottom-Center (2)");
  });
});

describe("AlignGrid audit — all nine cells fire onPick and close", () => {
  for (const n of NUMPAD) {
    it(`B-56.${n} — clicking '${LABELS[n]} (${n})' fires onPick(${n}) and closes`, () => {
      const onPick = vi.fn();
      render(<AlignGrid value={2} onPick={onPick} />);
      open();
      fireEvent.click(screen.getByRole("button", { name: `${LABELS[n]} (${n})` }));
      expect(onPick).toHaveBeenCalledTimes(1);
      expect(onPick).toHaveBeenCalledWith(n);
      expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    });
  }
});

describe("AlignGrid audit — spatial order & gating", () => {
  it("B-57 — cells render in full numpad spatial order 7,8,9,4,5,6,1,2,3", () => {
    render(<AlignGrid value={2} onPick={vi.fn()} />);
    open();
    const labels = cells().map((c) => c.getAttribute("aria-label"));
    expect(labels).toEqual(NUMPAD.map((n) => `${LABELS[n]} (${n})`));
  });

  it("B-58 — backdrop click closes without onPick", () => {
    const onPick = vi.fn();
    render(<AlignGrid value={2} onPick={onPick} />);
    open();
    fireEvent.click(document.querySelector(".ag-back") as HTMLElement);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("B-59 — Esc closes without onPick", () => {
    const onPick = vi.fn();
    render(<AlignGrid value={2} onPick={onPick} />);
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("B-60 — disabled trigger cannot open the grid (no onPick possible)", () => {
    const onPick = vi.fn();
    const { container } = render(<AlignGrid value={2} onPick={onPick} disabled />);
    const btn = container.querySelector(".kit-sel") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(container.querySelector(".ag-grid")).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("B-61 — double open/close: trigger toggles the grid open then closed", () => {
    render(<AlignGrid value={2} onPick={vi.fn()} />);
    const trigger = screen.getByLabelText("Alignment");
    fireEvent.click(trigger);
    expect(screen.queryByRole("grid")).toBeInTheDocument();
    fireEvent.click(trigger); // toggles closed
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    fireEvent.click(trigger); // re-opens
    expect(screen.queryByRole("grid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alignment" })).toHaveAttribute("aria-expanded", "true");
  });

  it("B-62 — reopening after a pick reflects the new current cell as 'on'", () => {
    let value = 2;
    const onPick = vi.fn((n: number) => { value = n; });
    const { rerender } = render(<AlignGrid value={value} onPick={onPick} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Mid-Right (6)" }));
    expect(onPick).toHaveBeenCalledWith(6);
    rerender(<AlignGrid value={value} onPick={onPick} />);
    open();
    const cellMap = Object.fromEntries(cells().map((c) => [c.getAttribute("aria-label"), c]));
    expect(cellMap["Mid-Right (6)"]).toHaveClass("on");
    expect(cellMap["Bottom-Center (2)"]).not.toHaveClass("on");
  });
});
