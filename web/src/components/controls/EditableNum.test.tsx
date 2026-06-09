// EditableNum.test.tsx — click-to-type numeric value cell (zip-13). TDD RED: the
// component does not exist yet.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditableNum } from "./EditableNum";

describe("EditableNum", () => {
  it("renders the display text as a span until clicked", () => {
    render(<EditableNum display="+250 ms" value={250} onCommit={vi.fn()} />);
    expect(screen.getByText("+250 ms")).toBeTruthy();
    expect(document.querySelector("input.num-in")).toBeNull();
  });

  it("click turns it into a numeric input seeded with value", async () => {
    render(<EditableNum display="+250 ms" value={250} onCommit={vi.fn()} />);
    await userEvent.click(screen.getByText("+250 ms"));
    const input = document.querySelector("input.num-in") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("250");
  });

  it("Enter commits the parsed value", async () => {
    const onCommit = vi.fn();
    render(<EditableNum display="+250 ms" value={250} onCommit={onCommit} />);
    await userEvent.click(screen.getByText("+250 ms"));
    const input = document.querySelector("input.num-in") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "300");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(300);
  });

  it("blur commits", async () => {
    const onCommit = vi.fn();
    render(<EditableNum display="72 px" value={72} onCommit={onCommit} />);
    await userEvent.click(screen.getByText("72 px"));
    const input = document.querySelector("input.num-in") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "80");
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(80);
  });

  it("Esc cancels without committing", async () => {
    const onCommit = vi.fn();
    render(<EditableNum display="72 px" value={72} onCommit={onCommit} />);
    await userEvent.click(screen.getByText("72 px"));
    const input = document.querySelector("input.num-in") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "80");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(document.querySelector("input.num-in")).toBeNull();
  });

  it("ArrowUp/Down nudge the input by step (without committing yet)", async () => {
    render(<EditableNum display="250" value={250} step={10} onCommit={vi.fn()} />);
    await userEvent.click(screen.getByText("250"));
    const input = document.querySelector("input.num-in") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.value).toBe("260");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.value).toBe("250");
  });

  it("a parse that returns null/NaN rejects the commit", async () => {
    const onCommit = vi.fn();
    render(<EditableNum display="x" value={1} parse={() => null} onCommit={onCommit} />);
    await userEvent.click(screen.getByText("x"));
    const input = document.querySelector("input.num-in") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("click does not bubble to a parent onClick (stopPropagation)", async () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <EditableNum display="5" value={5} onCommit={vi.fn()} />
      </div>,
    );
    await userEvent.click(screen.getByText("5"));
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("uses the className for the value span (inherits host styling)", () => {
    render(<EditableNum display="9" value={9} className="sv" onCommit={vi.fn()} />);
    expect(screen.getByText("9").className).toContain("sv");
  });
});
