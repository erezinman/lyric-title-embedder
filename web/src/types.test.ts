import { describe, it, expect } from "vitest";
import { STYLE_KEYS, CUE_STYLE_KEYS, FADE_KEYS } from "./types";

describe("key lists", () => {
  it("STYLE_KEYS has the 10 engine style keys including border_style", () => {
    expect(STYLE_KEYS).toEqual(["font","fontsize","bold","primary","outline","back","back_alpha","outline_w","shadow","border_style"]);
  });
  it("CUE_STYLE_KEYS is STYLE_KEYS minus border_style (9)", () => {
    expect(CUE_STYLE_KEYS).toEqual(STYLE_KEYS.filter(k => k !== "border_style"));
    expect(CUE_STYLE_KEYS).toHaveLength(9);
  });
  it("FADE_KEYS is the two duration keys", () => {
    expect(FADE_KEYS).toEqual(["fade_in_ms","fade_out_ms"]);
  });
});
