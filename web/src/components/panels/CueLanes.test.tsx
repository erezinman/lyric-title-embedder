import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CueLanes } from "./CueLanes";
import type { Project } from "../../types";
import { fadeInAnim, fadeOutAnim } from "../../model/animPresets";
import { stubLocalStorage } from "../../test-util/storage";

beforeEach(() => { stubLocalStorage(); });

function proj(): Project {
  return {
    words: [
      { text: "Caught", start: 0.3, end: 0.7 },   // 0
      { text: "in",     start: 0.8, end: 1.0 },   // 1
      { text: "a",      start: 1.05, end: 1.2 },  // 2
      { text: "bleat",  start: 1.4,  end: 2.0 },  // 3
      { text: "up",     start: 3.7,  end: 4.0 },  // 4
      { text: "in",     start: 4.05, end: 4.45 }, // 5
    ],
    layout: [
      {
        label: "V1",
        win_start: null, win_end: null, linger: null, del: false,
        style: { fontsize: 72 },
        animations: [], suppress: [],
        lines: [{
          toks: [
            { ids: [0], sep: "", del: false, style: {} },
            { ids: [1], sep: "", del: false, style: {} },
            { ids: [2], sep: "", del: false, style: {} },
            { ids: [3], sep: "", del: false, style: {} },
            { ids: [4, 5], sep: " ", del: false, style: {} }, // merged: "up in"
          ],
        }],
      },
    ],
    // animations model: fade-in on word 0, fade-out on word 3 (anim_tags)
    anim_tags: [
      { ids: [0], anims: [fadeInAnim("a1")], suppress: [] },
      { ids: [3], anims: [fadeOutAnim("a2")], suppress: [] },
    ],
    globals: { linger: 0.0, animations: [], text_direction: "auto", bidi_marks: true },
    global_style: {
      font: "Space Grotesk", fontsize: 64, bold: true, italic: false, underline: false, primary: "#FFFFFF",
      outline: "#000000", back: "#000000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2,
    },
    placement: { align: 2, play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, pos: null },
    video: null,
  };
}

function renderLanes(p: Project) {
  return render(
    <CueLanes
      project={p}
      sel={{ scope: "group", gi: 0, tok: null }}
      selectedWords={new Set<number>()}
      collapsed={new Set<number>()}
      aiHotKey={null}
      onSelectWord={() => {}}
      onSelectEvent={() => {}}
      onToggleCollapse={() => {}}
    />,
  );
}

describe("CueLanes (redesigned)", () => {
  it("renders event label, merged-token joined text, and the new LAYOUT/ANIMATION headers (no FADE columns)", () => {
    renderLanes(proj());
    expect(screen.getByText("V1")).toBeTruthy();
    expect(screen.getByText(/up in/)).toBeTruthy();
    expect(screen.getByText(/ANIMATION/)).toBeTruthy();
    expect(screen.queryByText(/FADE-IN/i)).toBeNull();
    expect(screen.queryByText(/FADE-OUT/i)).toBeNull();
  });

  it("shows the cue's structural end time in the end sub-lane (word 3 end = 2.00)", () => {
    const { container } = renderLanes(proj());
    const endCells = [...container.querySelectorAll(".lc.t-cell.t-end")].map((c) => c.textContent);
    expect(endCells.some((t) => t?.includes("2.00"))).toBe(true);
  });

  it("renders own animation chips from the cue's tags (fade in on cue 0, fade out on cue 3)", () => {
    renderLanes(proj());
    // fadeInAnim → name 'fade_in' → chip label 'fade in'; fadeOutAnim → 'fade out'
    expect(screen.getByText(/fade in/i)).toBeTruthy();
    expect(screen.getByText(/fade out/i)).toBeTruthy();
    expect(document.querySelectorAll(".achip.own").length).toBeGreaterThanOrEqual(2);
  });

  it("flags OUTWARD spill on the end sub-lane (caret + delta), none in-window", () => {
    const p = proj();
    // merged token "up in" spans 3.7–4.45; an anim resolving to 4.80 spills +0.35 past the end.
    p.layout[0].lines[0].toks[4].anims_resolved = [
      { id: "s", name: "fade out", channel: "alpha", segments: [{ start_s: 4.3, end_s: 4.8, from: 1, to: 0, accel: 1 }] },
    ];
    const { container } = renderLanes(p);
    const spillEnd = [...container.querySelectorAll(".lc.t-cell.t-end.spill")].find((c) => c.textContent?.includes("+0.35"));
    expect(spillEnd).toBeTruthy();
    expect(spillEnd?.querySelector(".caret")?.textContent).toBe("›");
    // a cue with no anims_resolved has no spill marker
    expect(container.querySelectorAll(".lc.t-cell.t-start.spill").length).toBe(0);
  });

  it("column grip drag updates --lane-cols and persists to kss.laneCols", () => {
    const { container } = renderLanes(proj());
    const lanes = container.querySelector(".lanes.anim-dock") as HTMLElement;
    const before = lanes.style.getPropertyValue("--lane-cols");
    const grip = container.querySelector(".col-grip") as HTMLElement;
    expect(grip).toBeTruthy();
    fireEvent.pointerDown(grip, { clientX: 200 });
    fireEvent.pointerMove(window, { clientX: 260 });
    fireEvent.pointerUp(window);
    expect(lanes.style.getPropertyValue("--lane-cols")).not.toBe(before);   // text col widened
    expect(localStorage.getItem("kss.laneCols")).toBeTruthy();
  });

  it("double-clicking a grip resets that column to its default and persists", () => {
    localStorage.setItem("kss.laneCols", JSON.stringify([300, 96, 96]));
    const { container } = renderLanes(proj());
    const grip = container.querySelector(".col-grip") as HTMLElement;
    grip.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(JSON.parse(localStorage.getItem("kss.laneCols")!)[0]).toBe(160);   // text default
  });
});
