// ColorPicker.test.tsx — behavior of the ported color picker.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColorPicker, kspHexToRgb, kspRgbToHex, kspHsvToHex } from "./ColorPicker";
import { stubLocalStorage } from "../../test-util/storage";

let store: Map<string, string>;
beforeEach(() => { store = stubLocalStorage(); });

describe("ColorPicker — color math", () => {
  it("hex round-trips and normalizes 3-digit → 6-digit uppercase", () => {
    expect(kspRgbToHex(255, 61, 166)).toBe("#FF3DA6");
    expect(kspHexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(kspHexToRgb("f00")).toEqual({ r: 255, g: 0, b: 0 });
  });
  it("HSV↔hex is stable for pure hues", () => {
    expect(kspHsvToHex(0, 1, 1)).toBe("#FF0000");
    expect(kspHsvToHex(120, 1, 1)).toBe("#00FF00");
  });
});

describe("ColorPicker — hex input", () => {
  it("commits a 3-digit hex normalized to 6-digit uppercase via onChange", () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#000000" onChange={onChange} />);
    const hex = screen.getByDisplayValue("#000000") as HTMLInputElement;
    fireEvent.change(hex, { target: { value: "f00" } });
    fireEvent.blur(hex);
    expect(onChange).toHaveBeenCalledWith("#FF0000");
  });
  it("invalid hex reverts to the current value (no onChange)", () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#123456" onChange={onChange} />);
    const hex = screen.getByDisplayValue("#123456") as HTMLInputElement;
    fireEvent.change(hex, { target: { value: "zzz" } });
    fireEvent.blur(hex);
    expect(onChange).not.toHaveBeenCalled();
    expect(hex.value).toBe("#123456");
  });
});

describe("ColorPicker — alpha channel", () => {
  it("hides the alpha slider/input when alpha/onAlphaChange are omitted", () => {
    const { container } = render(<ColorPicker value="#FFFFFF" onChange={vi.fn()} />);
    expect(container.querySelector(".ksp-track.alpha")).toBeNull();
    expect(container.querySelector(".ksp-num")).toBeNull();
  });
  it("shows the alpha slider + % input when both are provided", () => {
    const { container } = render(
      <ColorPicker value="#FFFFFF" onChange={vi.fn()} alpha={80} onAlphaChange={vi.fn()} />,
    );
    expect(container.querySelector(".ksp-track.alpha")).not.toBeNull();
    const num = container.querySelector(".ksp-num") as HTMLInputElement;
    expect(num.value).toBe("80");
  });
});

describe("ColorPicker — palettes & swatches", () => {
  it("switching the palette pill swaps the swatch row", async () => {
    const { container } = render(<ColorPicker value="#FFFFFF" onChange={vi.fn()} />);
    // Brand has white as first swatch; Neon does not.
    await userEvent.click(screen.getByRole("button", { name: "Neon" }));
    const dots = [...container.querySelectorAll(".ksp-swatches .ksp-dot")] as HTMLElement[];
    expect(dots.some((d) => d.title === "#39FF14")).toBe(true);
  });
  it("clicking a palette swatch sets the color (onChange) but does NOT enqueue a recent", () => {
    const onChange = vi.fn();
    const { container } = render(<ColorPicker value="#000000" onChange={onChange} />);
    const dot = [...container.querySelectorAll(".ksp-swatches .ksp-dot")]
      .find((d) => (d as HTMLElement).title === "#FF3DA6") as HTMLElement;
    fireEvent.click(dot);
    expect(onChange).toHaveBeenCalledWith("#FF3DA6");
    expect(store.get("kss.recentColors")).toBeUndefined();
  });
});

describe("ColorPicker — recent queue", () => {
  it("hex entry enqueues a recent (commit), not a swatch click", () => {
    const { container } = render(<ColorPicker value="#000000" onChange={vi.fn()} />);
    const hex = screen.getByDisplayValue("#000000") as HTMLInputElement;
    fireEvent.change(hex, { target: { value: "#8A5BFF" } });
    fireEvent.blur(hex);
    const stored = JSON.parse(store.get("kss.recentColors") || "[]");
    expect(stored).toContain("#8A5BFF");
    // and the Recent section is shown
    expect(within(container as HTMLElement).getByText("Recent")).toBeTruthy();
  });
});

describe("ColorPicker — role-aware preview", () => {
  const cap = (c: HTMLElement) => c.querySelector(".ksp-preview .ksp-cap") as HTMLElement;
  it("fill role paints the text in the picked color", () => {
    const { container } = render(<ColorPicker value="#FF3DA6" onChange={vi.fn()} previewRole="fill" />);
    expect(cap(container).style.color).toContain("255");
  });
  it("outline role strokes the text and fills with previewFill", () => {
    const { container } = render(
      <ColorPicker value="#000000" onChange={vi.fn()} previewRole="outline" previewFill="#FFFFFF" />,
    );
    const el = cap(container);
    expect(el.style.color).toBe("rgb(255, 255, 255)");
    expect(el.style.getPropertyValue("-webkit-text-stroke-color")).toContain("0");
  });
  it("box role puts the picked color behind the text", () => {
    const { container } = render(
      <ColorPicker value="#000000" onChange={vi.fn()} previewRole="box" previewFill="#FFFFFF" />,
    );
    // jsdom collapses rgba(...,1) → rgb(...); the picked color (#000000) is the box bg
    expect(cap(container).style.background).toBe("rgb(0, 0, 0)");
    expect(cap(container).style.color).toBe("rgb(255, 255, 255)"); // previewFill text
  });
});

describe("ColorPicker — field popover", () => {
  it("field mode renders a trigger button and opens/closes the popover", async () => {
    const { container } = render(<ColorPicker mode="field" value="#FF3DA6" onChange={vi.fn()} />);
    const trigger = container.querySelector(".ksp-field") as HTMLElement;
    expect(trigger).toBeTruthy();
    expect(container.querySelector(".ksp-pop")).toBeNull();
    await userEvent.click(trigger);
    expect(container.querySelector(".ksp-pop")).not.toBeNull();
    // backdrop closes
    fireEvent.click(container.querySelector(".ksp-backdrop") as HTMLElement);
    expect(container.querySelector(".ksp-pop")).toBeNull();
  });
});
