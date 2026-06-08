import { describe, it, expect } from "vitest";
import { STYLE_KEYS, CUE_STYLE_KEYS } from "./types";

describe("key lists", () => {
  it("STYLE_KEYS has the 13 engine style keys incl. italic/underline + group-only border_style + align", () => {
    expect(STYLE_KEYS).toEqual(["font","fontsize","bold","italic","underline","primary","outline","back","back_alpha","outline_w","shadow","border_style","align"]);
  });
  it("CUE_STYLE_KEYS is STYLE_KEYS minus the group-only keys (11)", () => {
    expect(CUE_STYLE_KEYS).toEqual(STYLE_KEYS.filter(k => k !== "border_style" && k !== "align"));
    expect(CUE_STYLE_KEYS).toHaveLength(11);
  });
});
