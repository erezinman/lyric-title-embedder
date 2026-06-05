import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Splitter } from "./Splitter";

function setup(orientation: "vertical" | "horizontal", value = 320) {
  const onChange = vi.fn();
  const r = render(
    <Splitter orientation={orientation} value={value} min={200} max={560}
      defaultValue={320} onChange={onChange} label="test splitter" />
  );
  const sep = r.container.querySelector('[role="separator"]') as HTMLElement;
  return { onChange, sep };
}

describe("Splitter", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("vertical: dragging right grows the value by dx", () => {
    const { onChange, sep } = setup("vertical");
    fireEvent.pointerDown(sep, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100 });
    expect(onChange).toHaveBeenLastCalledWith(360);
    fireEvent.pointerUp(window, { clientX: 140, clientY: 100 });
  });

  it("horizontal: dragging up grows the value (dock height)", () => {
    const { onChange, sep } = setup("horizontal", 252);
    fireEvent.pointerDown(sep, { clientX: 100, clientY: 400, button: 0 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 360 });
    expect(onChange).toHaveBeenLastCalledWith(292);
    fireEvent.pointerUp(window, { clientX: 100, clientY: 360 });
  });

  it("clamps to min/max", () => {
    const { onChange, sep } = setup("vertical");
    fireEvent.pointerDown(sep, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(window, { clientX: 100 + 10000, clientY: 100 });
    expect(onChange).toHaveBeenLastCalledWith(560);
    fireEvent.pointerMove(window, { clientX: 100 - 10000, clientY: 100 });
    expect(onChange).toHaveBeenLastCalledWith(200);
    fireEvent.pointerUp(window, { clientX: 100, clientY: 100 });
  });

  it("double-click resets to the default", () => {
    const { onChange, sep } = setup("vertical", 500);
    fireEvent.doubleClick(sep);
    expect(onChange).toHaveBeenCalledWith(320);
  });

  it("arrow keys nudge the value", () => {
    const { onChange, sep } = setup("vertical");
    fireEvent.keyDown(sep, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(336);
    fireEvent.keyDown(sep, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(304);
  });

  it("removes window listeners on pointerup (no further onChange)", () => {
    const { onChange, sep } = setup("vertical");
    fireEvent.pointerDown(sep, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 100 });
    onChange.mockClear();
    fireEvent.pointerMove(window, { clientX: 300, clientY: 100 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
