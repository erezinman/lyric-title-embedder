import { describe, it, expect } from "vitest";
import { detectDir, resolveDir } from "./bidi";

describe("detectDir — first strong-directional char", () => {
  it("Hebrew → rtl", () => { expect(detectDir("שלום")).toBe("rtl"); });
  it("Arabic → rtl", () => { expect(detectDir("مرحبا")).toBe("rtl"); });
  it("Latin → ltr", () => { expect(detectDir("hello")).toBe("ltr"); });
  it("leading digits then Hebrew → rtl (digits are neutral)", () => {
    expect(detectDir("2024 שלום")).toBe("rtl");
  });
  it("leading digits then Latin → ltr", () => {
    expect(detectDir("2024 release")).toBe("ltr");
  });
  it("pure neutral (digits/punct) → ltr fallback", () => {
    expect(detectDir("123 !?")).toBe("ltr");
  });
  it("empty → ltr", () => { expect(detectDir("")).toBe("ltr"); });
});

describe("resolveDir — setting overrides auto-detect", () => {
  it("explicit rtl wins over Latin text", () => { expect(resolveDir("rtl", "hello")).toBe("rtl"); });
  it("explicit ltr wins over Hebrew text", () => { expect(resolveDir("ltr", "שלום")).toBe("ltr"); });
  it("auto detects from text", () => { expect(resolveDir("auto", "שלום")).toBe("rtl"); });
  it("undefined behaves like auto", () => { expect(resolveDir(undefined, "שלום")).toBe("rtl"); });
});
