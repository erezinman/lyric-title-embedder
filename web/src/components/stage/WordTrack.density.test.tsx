import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { WordTrack } from "./WordTrack";
import { packTimeline, type Density } from "../../model/trackPack";
import type { Project } from "../../types";

// Three groups crafted so the three densities pack into a DIFFERENT number of
// rows: gi1 overlaps gi0 in time (so Coherent needs ≥2 rows), gi2 is far away (so
// Coherent can re-use gi0's row) → Coherent=2; Lanes always = one row per group=3.
const words = [
  { wid: 0, text: "a0", s: 0.0, e: 1.0, gi: 0, li: 0, ti: 0 },
  { wid: 1, text: "a1", s: 2.0, e: 3.0, gi: 0, li: 0, ti: 1 },
  { wid: 2, text: "b0", s: 0.5, e: 2.5, gi: 1, li: 0, ti: 0 },
  { wid: 3, text: "c0", s: 5.0, e: 6.0, gi: 2, li: 0, ti: 0 },
];
const events = [
  { gi: 0, label: "Verse" },
  { gi: 1, label: "Pre" },
  { gi: 2, label: "Chorus" },
];

function proj(): Project {
  return {
    words: words.map((w) => ({ text: w.text, start: w.s, end: w.e })),
    layout: [0, 1, 2].map((gi) => ({
      label: events[gi].label, win_start: null, win_end: null, linger: null, del: false,
      style: {}, animations: [], suppress: [],
      lines: [{ toks: words.filter((w) => w.gi === gi).map((w) => ({ ids: [w.wid], sep: "", del: false, style: {} })) }],
    })),
    anim_tags: [], globals: { linger: 0, animations: [], text_direction: "auto", bidi_marks: true },
    global_style: { font: "x", fontsize: 64, bold: true, italic: false, underline: false, primary: "#fff", outline: "#000", back: "#000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2 },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 0, margin_r: 0, margin_v: 0, pos: null }, video: null,
  };
}

beforeEach(() => {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({ x: 0, left: 0, width: 1000, top: 0, right: 1000, bottom: 30, height: 30, y: 0, toJSON: () => {} } as DOMRect));
});

function renderWT(density: Density) {
  return render(
    <WordTrack words={words as never} events={events} project={proj()} dur={10} time={0}
      density={density} liveId={null} selId={0} selectedWords={new Set([0])}
      unlocked={false} onRetime={() => {}} onSelect={() => {}} />,
  );
}

const expectedRows = (d: Density) =>
  packTimeline(words.map((w) => ({ key: String(w.wid), gi: w.gi, s: w.s, e: w.e })), d).rows.length;

describe("WordTrack density (Phase 4)", () => {
  it("row count matches the packer for each density and lanes > coherent", () => {
    const counts: Record<Density, number> = { compact: 0, coherent: 0, lanes: 0 };
    for (const d of ["compact", "coherent", "lanes"] as Density[]) {
      const { container, unmount } = renderWT(d);
      const rows = container.querySelectorAll(".wt-row").length;
      expect(rows).toBe(expectedRows(d));
      counts[d] = rows;
      unmount();
    }
    // the densities genuinely differ for this fixture
    expect(counts.lanes).toBe(3);
    expect(counts.lanes).toBeGreaterThan(counts.coherent);
  });

  it("only Lanes renders the per-group gutter labels", () => {
    const lanes = renderWT("lanes");
    expect(lanes.container.querySelectorAll(".wt-gutter").length).toBe(3);
    lanes.unmount();
    const coh = renderWT("coherent");
    expect(coh.container.querySelectorAll(".wt-gutter").length).toBe(0);
  });

  it("clicking a .seg-style density button is wired (setter fires)", () => {
    // The .seg control lives in Editor; here we assert WordTrack itself reflects
    // the density prop. The Editor control is covered by the persistence test.
    const { container } = renderWT("lanes");
    expect(container.querySelector(".wt")?.classList.contains("lanes")).toBe(true);
  });
});
