/**
 * CueLanes.anim.audit.test.tsx — Cluster AT §5C (lanes ANIMATION column).
 * Test IDs: AT-14..AT-16.
 *
 * The 4th ANIMATION column mirrors the FADE columns: inherited-grey vs
 * override-solid, suppressed treatment for tombstones, empty when none.
 * Driven through the CueLanes component directly with withResolved fixtures.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CueLanes } from "./CueLanes";
import { baseProject, withResolved, withAnimations, resolved, anim, seg, time } from "../../test-util/fixtures";

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

describe("AT-14 ANIMATION column: inherited-grey vs override-solid", () => {
  it("renders an ANIMATION header and override-solid marker for a tag (own) anim", () => {
    // cue 0 carries a tag-sourced (override) resolved anim.
    const p = withResolved(baseProject(), {
      0: [resolved({ id: "x", channel: "alpha", src: "tag" }, 0.5, 0.9)],
    });
    const { container } = renderLanes(p);
    // header
    expect(container.textContent).toContain("ANIMATION");
    // the cell for cue 0
    const row = [...container.querySelectorAll(".lane-row")].find((r) =>
      r.textContent?.includes("alpha"),
    )!;
    const cell = row.querySelector(".lc.anim") as HTMLElement;
    expect(cell).toBeTruthy();
    expect(cell.classList.contains("ovr")).toBe(true);
  });

  it("renders inherited-grey marker for a global-sourced (inherited) anim", () => {
    const p = withResolved(baseProject(), {
      0: [resolved({ id: "g", channel: "alpha", src: "global" }, 0.5, 0.9)],
    });
    const { container } = renderLanes(p);
    const row = [...container.querySelectorAll(".lane-row")].find((r) =>
      r.textContent?.includes("alpha"),
    )!;
    const cell = row.querySelector(".lc.anim") as HTMLElement;
    expect(cell.classList.contains("inh")).toBe(true);
    expect(cell.classList.contains("ovr")).toBe(false);
  });
});

describe("AT-15 tombstoned inherited anim → suppressed treatment", () => {
  it("a cue that suppresses an inherited anim shows the .supp marker", () => {
    // global fade-in + group-0 suppress → cue 0 resolves empty, but the suppress
    // carrier marks the column as suppressed.
    const p = withAnimations(baseProject(), {
      global: [anim({ id: "g_fade", name: "fade_in", channel: "alpha",
        segments: [seg(time("cue_start"), time("cue_start", 250), "FF", "00")] })],
      suppress: { 0: ["g_fade"] },
    });
    const withRes = withResolved(p, { 0: [] }); // resolves to nothing for the group's cues
    const { container } = renderLanes(withRes);
    const row = [...container.querySelectorAll(".lane-row")].find((r) =>
      r.textContent?.includes("alpha"),
    )!;
    const cell = row.querySelector(".lc.anim") as HTMLElement;
    expect(cell.classList.contains("supp")).toBe(true);
  });
});

describe("AT-16 column reflects resolved presence; empty when none", () => {
  it("a cue with no resolved anims and no suppress shows the empty marker", () => {
    const { container } = renderLanes(baseProject());
    const row = [...container.querySelectorAll(".lane-row")].find((r) =>
      r.textContent?.includes("alpha"),
    )!;
    const cell = row.querySelector(".lc.anim") as HTMLElement;
    expect(cell.classList.contains("none")).toBe(true);
    expect(cell.classList.contains("ovr")).toBe(false);
    expect(cell.classList.contains("inh")).toBe(false);
  });
});
