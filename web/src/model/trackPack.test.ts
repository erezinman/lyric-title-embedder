import { describe, it, expect } from "vitest";
import { packTimeline, type PackItem } from "./trackPack";

// helper: build items; key defaults to `${gi}-${s}`
const I = (gi: number, s: number, e: number, key = `${gi}-${s}`): PackItem => ({ key, gi, s, e });
const rowOfItem = (r: ReturnType<typeof packTimeline>, key: string) => r.rowOf.get(key);

describe("trackPack", () => {
  it("lanes — one row per gi, ordered by gi", () => {
    const r = packTimeline([I(2, 0, 1), I(0, 0, 1), I(0, 2, 3)], "lanes");
    expect(r.rows.length).toBe(2);
    expect(r.rows[0].every((it) => it.gi === 0)).toBe(true); // gi 0 first
    expect(r.rows[1].every((it) => it.gi === 2)).toBe(true);
    expect(rowOfItem(r, "0-2")).toBe(0); // both gi-0 items share a row
  });

  it("coherent — non-overlapping groups merge onto one row", () => {
    const r = packTimeline([I(0, 0, 1), I(1, 2, 3)], "coherent");
    expect(r.rows.length).toBe(1);
  });

  it("coherent — overlapping groups go to separate rows; a group is never split", () => {
    const r = packTimeline([I(0, 0, 1, "a"), I(0, 1.5, 3, "b"), I(1, 0.5, 2, "c")], "coherent");
    expect(r.rows.length).toBe(2);
    expect(rowOfItem(r, "a")).toBe(rowOfItem(r, "b"));
    expect(rowOfItem(r, "c")).not.toBe(rowOfItem(r, "a"));
  });

  it("compact — overlapping items of one group scatter across rows", () => {
    const r = packTimeline([I(0, 0, 2, "a"), I(0, 1, 3, "b")], "compact");
    expect(r.rows.length).toBe(2);
    expect(rowOfItem(r, "a")).not.toBe(rowOfItem(r, "b"));
  });

  it("touching endpoints do NOT overlap (epsilon) — they share a row", () => {
    const r = packTimeline([I(0, 0, 1, "a"), I(1, 1, 2, "b")], "compact");
    expect(r.rows.length).toBe(1);
  });

  it("compact orders by start and first-fits (fewest non-colliding rows)", () => {
    const r = packTimeline([I(0, 0, 1), I(1, 1.1, 2), I(2, 2.1, 3)], "compact");
    expect(r.rows.length).toBe(1);
  });
});
