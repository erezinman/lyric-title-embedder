// EventStrip.audit.test.tsx — Cluster C audit for EventStrip:
// linger stepper, active styling, double-press, window metadata.
// (The accumulate 3-way was removed with the animations migration — C-50/C-54
// accumulate tests were deleted; the AM-phase timing-mode picker replaces it.)
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventStrip } from "./EventStrip";
import type { LayoutGroup } from "../../types";

// ---------- helpers ----------

function makeGroup(overrides: Partial<LayoutGroup> = {}): LayoutGroup {
  return {
    label: "Verse 1",
    win_start: null,
    win_end: null,
    linger: null,
    del: false,
    style: {},
    animations: [], suppress: [],
    lines: [],
    ...overrides,
  };
}

// ---------- C-51 — Linger stepper ----------

describe("C-51 — linger stepper", () => {
  it("C-51a — '+' on linger=null(0) calls onSet({ linger: 0.1 })", async () => {
    const onSet = vi.fn();
    const g = makeGroup({ linger: null });
    render(<EventStrip g={g} onSet={onSet} />);
    const lingerSection = screen.getByText("Linger").closest(".es-grp") as HTMLElement;
    await userEvent.click(within(lingerSection).getByText("+"));
    expect(onSet).toHaveBeenCalledWith({ linger: expect.closeTo(0.1, 5) });
  });

  it("C-51b — '−' on linger=null(0) calls onSet({ linger: 0 }) (min 0 clamp)", async () => {
    const onSet = vi.fn();
    const g = makeGroup({ linger: null });
    render(<EventStrip g={g} onSet={onSet} />);
    const lingerSection = screen.getByText("Linger").closest(".es-grp") as HTMLElement;
    await userEvent.click(within(lingerSection).getByText("−"));
    expect(onSet).toHaveBeenCalledWith({ linger: 0 });
  });

  it("C-51c — '+' on linger=1.0 calls onSet({ linger: 1.1 })", async () => {
    const onSet = vi.fn();
    const g = makeGroup({ linger: 1.0 });
    render(<EventStrip g={g} onSet={onSet} />);
    const lingerSection = screen.getByText("Linger").closest(".es-grp") as HTMLElement;
    await userEvent.click(within(lingerSection).getByText("+"));
    expect(onSet).toHaveBeenCalledWith({ linger: expect.closeTo(1.1, 5) });
  });

  it("C-51d — '−' on linger=1.0 calls onSet({ linger: 0.9 })", async () => {
    const onSet = vi.fn();
    const g = makeGroup({ linger: 1.0 });
    render(<EventStrip g={g} onSet={onSet} />);
    const lingerSection = screen.getByText("Linger").closest(".es-grp") as HTMLElement;
    await userEvent.click(within(lingerSection).getByText("−"));
    expect(onSet).toHaveBeenCalledWith({ linger: expect.closeTo(0.9, 5) });
  });

  it("C-51e — linger=null displays as '0.0s'", () => {
    const g = makeGroup({ linger: null });
    render(<EventStrip g={g} onSet={vi.fn()} />);
    expect(screen.getByText("0.0s")).toBeTruthy();
  });

  it("C-51f — linger=2.5 displays as '2.5s'", () => {
    const g = makeGroup({ linger: 2.5 });
    render(<EventStrip g={g} onSet={vi.fn()} />);
    expect(screen.getByText("2.5s")).toBeTruthy();
  });
});

// ---------- C-52 — Linger double-press ----------

describe("C-52 — linger double-press cumulative", () => {
  it("C-52a — double press '+' from linger=0.5 produces 0.6 then 0.7", async () => {
    const onSet = vi.fn();
    const { rerender } = render(<EventStrip g={makeGroup({ linger: 0.5 })} onSet={onSet} />);
    const lingerSection = screen.getByText("Linger").closest(".es-grp") as HTMLElement;
    await userEvent.click(within(lingerSection).getByText("+"));
    expect(onSet).toHaveBeenNthCalledWith(1, { linger: expect.closeTo(0.6, 5) });

    rerender(<EventStrip g={makeGroup({ linger: 0.6 })} onSet={onSet} />);
    const lingerSection2 = screen.getByText("Linger").closest(".es-grp") as HTMLElement;
    await userEvent.click(within(lingerSection2).getByText("+"));
    expect(onSet).toHaveBeenNthCalledWith(2, { linger: expect.closeTo(0.7, 5) });
  });

  it("C-52b — up-then-down nets original value for linger", async () => {
    const onSet = vi.fn();
    const { rerender } = render(<EventStrip g={makeGroup({ linger: 1.0 })} onSet={onSet} />);
    const lingerSection = screen.getByText("Linger").closest(".es-grp") as HTMLElement;
    await userEvent.click(within(lingerSection).getByText("+"));
    expect(onSet).toHaveBeenNthCalledWith(1, { linger: expect.closeTo(1.1, 5) });

    rerender(<EventStrip g={makeGroup({ linger: 1.1 })} onSet={onSet} />);
    const lingerSection2 = screen.getByText("Linger").closest(".es-grp") as HTMLElement;
    await userEvent.click(within(lingerSection2).getByText("−"));
    expect(onSet).toHaveBeenNthCalledWith(2, { linger: expect.closeTo(1.0, 5) });
  });
});

// ---------- C-53 — EventStrip label and window display ----------

describe("C-53 — EventStrip metadata display", () => {
  it("C-53a — shows event label", () => {
    const g = makeGroup({ label: "Chorus" });
    render(<EventStrip g={g} onSet={vi.fn()} />);
    expect(screen.getByText("Chorus")).toBeTruthy();
  });

  it("C-53b — win_start=null and win_end=null shows 'first word' and 'last + linger'", () => {
    const g = makeGroup({ win_start: null, win_end: null });
    render(<EventStrip g={g} onSet={vi.fn()} />);
    const note = screen.getByText(/window auto/i);
    expect(note.textContent).toContain("first word");
    expect(note.textContent).toContain("last + linger");
  });

  it("C-53c — win_start=1.5 shows '1.5s' in window note", () => {
    const g = makeGroup({ win_start: 1.5, win_end: null });
    render(<EventStrip g={g} onSet={vi.fn()} />);
    const note = screen.getByText(/window auto/i);
    expect(note.textContent).toContain("1.5");
  });

  it("C-53d — win_end=5.0 shows '5' in window note", () => {
    const g = makeGroup({ win_start: null, win_end: 5.0 });
    render(<EventStrip g={g} onSet={vi.fn()} />);
    const note = screen.getByText(/window auto/i);
    expect(note.textContent).toContain("5");
  });
});

