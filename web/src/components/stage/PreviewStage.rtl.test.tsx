import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PreviewStage } from "./PreviewStage";
import type { CapWord } from "./PreviewStage";
import type { PlacementState } from "../../model/bbox";

const placement: PlacementState = { align: 2, play_w: 1920, play_h: 1080,
  margin_l: 80, margin_r: 80, margin_v: 60, pos: null };

const word = (wid: number, text: string, li = 0): CapWord =>
  ({ wid, li, text, live: false, pending: false, sel: false, fill: null, scale: 1, bold: null, italic: null, underline: null });

function setup(capWords: CapWord[], textDirection?: "auto" | "ltr" | "rtl", onSelectWord = vi.fn()) {
  const r = render(
    <PreviewStage capWords={capWords} time={0} mode="live" onMode={() => {}}
      onRenderExact={() => {}} onSelectWord={onSelectWord}
      playW={1920} playH={1080} placement={placement} onPlacement={vi.fn()}
      textDirection={textDirection} />
  );
  const cap = r.container.querySelector(".cap") as HTMLElement;
  return { r, cap, onSelectWord };
}

describe("PreviewStage caption direction", () => {
  it("explicit rtl globals → overlay container is dir=rtl", () => {
    const { cap } = setup([word(0, "hello")], "rtl");
    expect(cap.getAttribute("dir")).toBe("rtl");
    expect(cap.style.direction).toBe("rtl");
  });

  it("explicit ltr globals → overlay container is dir=ltr even with Hebrew text", () => {
    const { cap } = setup([word(0, "שלום")], "ltr");
    expect(cap.getAttribute("dir")).toBe("ltr");
  });

  it("auto + Hebrew text → rtl", () => {
    const { cap } = setup([word(0, "שלום"), word(1, "עולם")], "auto");
    expect(cap.getAttribute("dir")).toBe("rtl");
  });

  it("auto + Arabic text → rtl", () => {
    const { cap } = setup([word(0, "مرحبا")], "auto");
    expect(cap.getAttribute("dir")).toBe("rtl");
  });

  it("auto + Latin text → ltr", () => {
    const { cap } = setup([word(0, "hello"), word(1, "world")], "auto");
    expect(cap.getAttribute("dir")).toBe("ltr");
  });

  it("auto + leading number then Hebrew → rtl (first STRONG char wins)", () => {
    const { cap } = setup([word(0, "2024"), word(1, "שלום")], "auto");
    expect(cap.getAttribute("dir")).toBe("rtl");
  });

  it("defaults to auto when no textDirection prop is given (Latin → ltr)", () => {
    const { cap } = setup([word(0, "hello")]);
    expect(cap.getAttribute("dir")).toBe("ltr");
  });

  it("clicking a word still selects its logical wid under rtl (dir does not remap clicks)", () => {
    const onSelectWord = vi.fn();
    const { r } = setup([word(0, "ראשון"), word(1, "שני")], "rtl", onSelectWord);
    const spans = r.container.querySelectorAll(".cap .w");
    // DOM order stays logical: spans[0] is wid 0, spans[1] is wid 1.
    fireEvent.click(spans[1]);
    expect(onSelectWord).toHaveBeenCalledWith(1);
  });
});
