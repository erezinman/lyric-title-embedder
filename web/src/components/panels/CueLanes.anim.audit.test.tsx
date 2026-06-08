/**
 * CueLanes.anim.audit.test.tsx — ANIMATION lane chips (zip 11 redesign).
 * Test IDs: AT-14..AT-16.
 *
 * The single ANIMATION lane renders channel-colored chips from cueRows (the
 * carrier-derived waterfall state): own = .achip.own, inherited = .achip.inh
 * (+ grp/glob src), tombstone = .achip.tomb, empty = .lc.anim.none.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CueLanes } from "./CueLanes";
import { baseProject, withAnimations, anim, seg, time } from "../../test-util/fixtures";

const noop = () => {};
const baseSel = { scope: "group" as const, gi: 0, tok: null };

function renderLanes(project: ReturnType<typeof baseProject>) {
  return render(
    <CueLanes
      project={project}
      sel={baseSel}
      selectedWords={new Set()}
      collapsed={new Set()}
      aiHotKey={null}
      onSelectWord={noop}
      onSelectEvent={noop}
      onToggleCollapse={noop}
    />,
  );
}

/** The ANIMATION cell of the row whose text contains `word` (a baseProject word). */
function animCell(container: HTMLElement, word: string): HTMLElement {
  const row = [...container.querySelectorAll(".lane-row")].find((r) => r.textContent?.includes(word))!;
  return row.querySelector(".lc.anim") as HTMLElement;
}

describe("AT-14 ANIMATION chips: own vs inherited", () => {
  it("a tag-sourced (own) anim renders a solid .achip.own chip", () => {
    // cue 0 (alpha) carries a tag-sourced sweep anim
    const p = withAnimations(baseProject(), {
      tags: [{ ids: [0], anims: [anim({ id: "x", name: "sweep", channel: "clip_rect",
        segments: [seg(time("cue_start"), time("cue_end"), [0, 0, 0, 0], [1920, 0, 0, 0])] })], suppress: [] }],
    });
    const { container } = renderLanes(p);
    expect(container.textContent).toContain("ANIMATION");
    const chip = animCell(container, "alpha").querySelector(".achip") as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.classList.contains("own")).toBe(true);
    expect(chip.textContent).toContain("sweep");
  });

  it("a global-sourced (inherited) anim renders a grey .achip.inh chip with a glob src tag", () => {
    const p = withAnimations(baseProject(), {
      global: [anim({ id: "g", name: "glow", channel: "alpha",
        segments: [seg(time("cue_start"), time("cue_start", 250), "00", "FF")] })],
    });
    const { container } = renderLanes(p);
    const chip = animCell(container, "alpha").querySelector(".achip") as HTMLElement;
    expect(chip.classList.contains("inh")).toBe(true);
    expect(chip.classList.contains("own")).toBe(false);
    expect(chip.querySelector(".src")?.textContent).toBe("glob");
  });
});

describe("AT-15 tombstoned inherited anim → .achip.tomb", () => {
  it("a global anim suppressed at the cue's group renders a struck .achip.tomb chip", () => {
    const p = withAnimations(baseProject(), {
      global: [anim({ id: "g_fade", name: "fade_in", channel: "alpha",
        segments: [seg(time("cue_start"), time("cue_start", 250), "FF", "00")] })],
      suppress: { 0: ["g_fade"] },   // suppressed at group 0 (contains alpha)
    });
    const { container } = renderLanes(p);
    const chip = animCell(container, "alpha").querySelector(".achip") as HTMLElement;
    expect(chip.classList.contains("tomb")).toBe(true);
  });
});

describe("AT-16 empty ANIMATION lane when no anims", () => {
  it("a cue with no own/inherited anims shows the empty marker", () => {
    const { container } = renderLanes(baseProject());
    const cell = animCell(container, "alpha");
    expect(cell.classList.contains("none")).toBe(true);
    expect(cell.querySelector(".achip")).toBeNull();
  });
});
