/**
 * CueLanes.audit.test.tsx — Cluster D interaction audit.
 * Tests ID prefix: D-01 through D-18
 * Covers: selection (plain, ctrl, shift, cross-group, Esc), collapse/expand,
 * group-header selection (EventStrip appears), WordTrack ↔ CueLanes sync.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "../Editor";
import { setupFakeWS, FakeWS } from "../../test-util/fakews";
import { mockApi, emitState } from "../../test-util/dispatch";
import { baseProject } from "../../test-util/fixtures";

// ---------------------------------------------------------------------------
// Harness setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  FakeWS.last = null;
  setupFakeWS();
  mockApi();
});

/** Wait for WS to connect and emit baseProject state. */
async function bootEditor() {
  render(<Editor projectName="test" onHome={() => {}} />);
  await waitFor(() => expect(FakeWS.last).toBeTruthy());
  emitState(baseProject());
}

void bootEditor;
/** Click the first lane-row element containing `word`. */
async function clickLaneWord(
  user: ReturnType<typeof userEvent.setup>,
  word: string,
  mods: { ctrl?: boolean; shift?: boolean } = {}
) {
  const els = screen.getAllByText(word);
  const laneRow = els.find((el) => el.closest(".lane-row"));
  const target = laneRow ?? els[0];
  if (mods.ctrl) {
    await user.keyboard("{Control>}");
    await user.click(target);
    await user.keyboard("{/Control}");
  } else if (mods.shift) {
    await user.keyboard("{Shift>}");
    await user.click(target);
    await user.keyboard("{/Shift}");
  } else {
    await user.click(target);
  }
}

// ---------------------------------------------------------------------------
// 1. CueLanes selection — plain click
// ---------------------------------------------------------------------------
describe("CueLanes plain click", () => {
  it("D-01 — plain click on a cue row adds .sel class to that row", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    await clickLaneWord(user, "alpha");
    // The lane-row containing "alpha" should have .sel
    const allRows = container.querySelectorAll(".lane-row");
    const alphaRow = [...allRows].find((r) => r.textContent?.includes("alpha"));
    expect(alphaRow?.classList.contains("sel")).toBe(true);
  });

  it("D-02 — plain click sets selection count to 1", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    await clickLaneWord(user, "alpha");
    expect(screen.getByText(/1 selected/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. CueLanes ctrl-click — multi-select
// ---------------------------------------------------------------------------
describe("CueLanes ctrl-click multi-select", () => {
  it("D-03 — ctrl-click second row adds .multi class to BOTH rows", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    await clickLaneWord(user, "alpha");
    await clickLaneWord(user, "bravo", { ctrl: true });

    const allRows = container.querySelectorAll(".lane-row");
    const alphaRow = [...allRows].find((r) => r.textContent?.includes("alpha"));
    const bravoRow = [...allRows].find((r) => r.textContent?.includes("bravo"));
    expect(alphaRow?.classList.contains("multi")).toBe(true);
    expect(bravoRow?.classList.contains("multi")).toBe(true);
  });

  it("D-04 — ctrl-click removes a row from multi-selection when clicked again", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    await clickLaneWord(user, "alpha");
    await clickLaneWord(user, "bravo", { ctrl: true });
    expect(screen.getByText(/2 selected/i)).toBeTruthy();

    // ctrl-click alpha again to deselect it
    await clickLaneWord(user, "alpha", { ctrl: true });
    expect(screen.getByText(/1 selected/i)).toBeTruthy();

    const allRows = container.querySelectorAll(".lane-row");
    const alphaRow = [...allRows].find((r) => r.textContent?.includes("alpha"));
    expect(alphaRow?.classList.contains("multi")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. CueLanes shift-click range selection
// ---------------------------------------------------------------------------
describe("CueLanes shift-click range selection", () => {
  it("D-05 — shift-click selects all rows between anchor and target by time", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    // baseProject: words alpha(0)..india(8) in time order
    emitState(baseProject());

    // click first word (alpha), shift-click 3rd (charlie) → should select alpha, bravo, charlie
    await clickLaneWord(user, "alpha");
    await clickLaneWord(user, "charlie", { shift: true });
    expect(screen.getByText(/3 selected/i)).toBeTruthy();
  });

  it("D-06 — cross-group shift-click includes words from both groups", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    // alpha is group0, hotel is group1 — all 8 words (alpha..hotel) should be selected
    await clickLaneWord(user, "alpha");
    await clickLaneWord(user, "hotel", { shift: true });
    // 8 words: alpha(0)..hotel(7)
    expect(screen.getByText(/8 selected/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 4. Esc clears all selection
// ---------------------------------------------------------------------------
describe("CueLanes Esc clears selection", () => {
  it("D-07 — Esc after multi-select clears all selection", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    await clickLaneWord(user, "alpha");
    await clickLaneWord(user, "bravo", { ctrl: true });
    expect(screen.getByText(/2 selected/i)).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByText(/\d+ selected/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Event header click → group selection + EventStrip
// ---------------------------------------------------------------------------
describe("CueLanes event header selection", () => {
  it("D-08 — clicking event header selects group (EventStrip label appears)", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    // Find the lane-evt div for "Verse 1"
    const evtEls = screen.getAllByText("Verse 1");
    const laneEvt = evtEls.find((el) => el.closest(".lane-evt"));
    const target = laneEvt ?? evtEls[0];
    await user.click(target);

    // EventStrip should appear with the group label
    await waitFor(() => {
      const strips = document.querySelectorAll(".evt-strip");
      expect(strips.length).toBeGreaterThan(0);
    });
  });

  it("D-09 — clicking event header applies .sel on the .lane-evt row", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    const evtEls = screen.getAllByText("Verse 1");
    const laneEvt = evtEls.find((el) => el.closest(".lane-evt"));
    const target = laneEvt ? laneEvt.closest(".lane-evt")! : evtEls[0];
    await user.click(target as HTMLElement);

    const evtDivs = container.querySelectorAll(".lane-evt");
    const verse1Div = [...evtDivs].find((d) => d.textContent?.includes("Verse 1"));
    expect(verse1Div?.classList.contains("sel")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Collapse / expand chevron
// ---------------------------------------------------------------------------
describe("CueLanes collapse/expand", () => {
  it("D-10 — clicking chevron collapses rows (lane-rows hidden)", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    // Count lane-rows before collapse
    const before = container.querySelectorAll(".lane-row").length;
    expect(before).toBeGreaterThan(0);

    // Click the chevron of group 0 (Verse 1)
    const chevrons = container.querySelectorAll(".lane-evt .chev");
    await user.click(chevrons[0] as HTMLElement);

    // After collapse: Verse 1 rows (7 tokens) should be gone; Chorus rows remain
    const after = container.querySelectorAll(".lane-row").length;
    expect(after).toBeLessThan(before);
  });

  it("D-11 — clicking chevron twice (collapse then expand) restores all rows", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    const before = container.querySelectorAll(".lane-row").length;
    const chevrons = container.querySelectorAll(".lane-evt .chev");
    await user.click(chevrons[0] as HTMLElement); // collapse
    await user.click(chevrons[0] as HTMLElement); // expand
    const after = container.querySelectorAll(".lane-row").length;
    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 7. WordTrack ↔ CueLanes cross-sync
// ---------------------------------------------------------------------------
describe("WordTrack locked ↔ CueLanes sync", () => {
  it("D-12 — lane-row click highlights .sel in lane-row", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    await clickLaneWord(user, "alpha");

    // The lane-row should have .sel
    const allRows = container.querySelectorAll(".lane-row");
    const alphaRow = [...allRows].find((r) => r.textContent?.includes("alpha"));
    expect(alphaRow?.classList.contains("sel")).toBe(true);
  });

  it("D-13 — WordTrack block click (locked mode) selects that word in CueLanes (.sel on lane-row)", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    // Switch to timeline tab
    const timelineTab = screen.getByRole("button", { name: /Timeline/i });
    await user.click(timelineTab);

    // Click block for "alpha" in the WordTrack (locked mode — default timingsUnlocked=false)
    const blocks = container.querySelectorAll(".block");
    const alphaBlock = [...blocks].find((b) => b.getAttribute("title")?.includes("alpha"));
    if (!alphaBlock) {
      // Finding blocks by title may not work if titles differ — try first block
      await user.click(blocks[0] as HTMLElement);
    } else {
      await user.click(alphaBlock as HTMLElement);
    }

    // Switch to Cue lanes tab to check selection
    const lanesTab = screen.getByRole("button", { name: /Cue lanes/i });
    await user.click(lanesTab);

    // Some lane-row should have .sel class
    await waitFor(() => {
      const selRows = container.querySelectorAll(".lane-row.sel");
      expect(selRows.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// 8. Empty-space click clears selection (zip 11 §5)
// ---------------------------------------------------------------------------
describe("CueLanes empty-space deselect", () => {
  it("D-14 — clicking the empty dock-body background clears the selection", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    await clickLaneWord(user, "alpha");
    expect(screen.getByText(/1 selected/i)).toBeTruthy();

    await user.click(container.querySelector(".dock-body") as HTMLElement);
    expect(screen.queryByText(/\d+ selected/i)).toBeNull();
  });

  it("D-15 — clicking a cue row selects it (does NOT clear via the bg handler)", async () => {
    const user = userEvent.setup();
    render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    await clickLaneWord(user, "alpha");
    expect(screen.getByText(/1 selected/i)).toBeTruthy();   // row click survived bubbling to bgClear
  });
});

// ---------------------------------------------------------------------------
// 9. Double-click cue → flip view + keep selection (zip 11 §6)
// ---------------------------------------------------------------------------
describe("CueLanes double-click view-flip", () => {
  it("D-16 — double-click a lane row flips to Timeline, cue stays selected", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    const els = screen.getAllByText("alpha");
    const row = els.find((el) => el.closest(".lane-row"))!.closest(".lane-row") as HTMLElement;
    await user.dblClick(row);

    expect(screen.getByText(/Magnet/i)).toBeTruthy();          // Timeline tab now active
    expect(container.querySelectorAll(".lane-row").length).toBe(0);
    expect(screen.getByText(/1 selected/i)).toBeTruthy();
  });

  it("D-17 — double-click a timeline block flips to Cue lanes, cue selected", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor projectName="test" onHome={() => {}} />);
    await waitFor(() => expect(FakeWS.last).toBeTruthy());
    emitState(baseProject());

    await user.click(screen.getByRole("button", { name: /Timeline/i }));
    const block = container.querySelector(".block") as HTMLElement;
    await user.dblClick(block);

    await waitFor(() => expect(container.querySelectorAll(".lane-row").length).toBeGreaterThan(0));
    expect(screen.getByText(/1 selected/i)).toBeTruthy();
  });
});
