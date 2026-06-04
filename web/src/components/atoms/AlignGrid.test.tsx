import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AlignGrid } from "./AlignGrid";

describe("AlignGrid", () => {
  it("trigger shows the current anchor label", () => {
    render(<AlignGrid value={2} onPick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Alignment" })).toHaveTextContent(
      "Bottom-Center (2)"
    );
  });

  it("trigger is accessible with aria-label=Alignment", () => {
    render(<AlignGrid value={5} onPick={vi.fn()} />);
    expect(screen.getByLabelText("Alignment")).toBeInTheDocument();
  });

  it("grid is not shown before trigger is clicked", () => {
    render(<AlignGrid value={2} onPick={vi.fn()} />);
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("clicking trigger opens the popover showing 9 cells", () => {
    render(<AlignGrid value={2} onPick={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Alignment"));
    const cells = screen.getAllByRole("button").filter((b) => b.classList.contains("ag-cell"));
    expect(cells).toHaveLength(9);
  });

  it("clicking Top-Center (8) calls onPick(8) and closes the popover", () => {
    const onPick = vi.fn();
    render(<AlignGrid value={2} onPick={onPick} />);
    fireEvent.click(screen.getByLabelText("Alignment"));
    fireEvent.click(screen.getByRole("button", { name: "Top-Center (8)" }));
    expect(onPick).toHaveBeenCalledWith(8);
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("Escape closes without calling onPick", () => {
    const onPick = vi.fn();
    render(<AlignGrid value={2} onPick={onPick} />);
    fireEvent.click(screen.getByLabelText("Alignment"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("clicking the backdrop closes without calling onPick", () => {
    const onPick = vi.fn();
    render(<AlignGrid value={2} onPick={onPick} />);
    fireEvent.click(screen.getByLabelText("Alignment"));
    // backdrop is the ag-back element
    const backdrop = document.querySelector(".ag-back") as HTMLElement;
    fireEvent.click(backdrop);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("spatial layout: first three cells are Top-Left (7), Top-Center (8), Top-Right (9)", () => {
    render(<AlignGrid value={2} onPick={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Alignment"));
    const cells = screen.getAllByRole("button").filter((b) => b.classList.contains("ag-cell"));
    expect(cells[0]).toHaveAttribute("aria-label", "Top-Left (7)");
    expect(cells[1]).toHaveAttribute("aria-label", "Top-Center (8)");
    expect(cells[2]).toHaveAttribute("aria-label", "Top-Right (9)");
  });

  it("current value cell has 'on' class", () => {
    render(<AlignGrid value={5} onPick={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Alignment"));
    const cells = screen.getAllByRole("button").filter((b) => b.classList.contains("ag-cell"));
    // In numpad order [7,8,9,4,5,6,1,2,3], value=5 is at index 4
    expect(cells[4]).toHaveClass("on");
    // Others should not have on class
    expect(cells[0]).not.toHaveClass("on");
  });
});
