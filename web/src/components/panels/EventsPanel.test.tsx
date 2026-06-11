import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { EventsPanel } from "./EventsPanel";
import type { EventRow } from "../../model/events";

function row(overrides: Partial<EventRow> = {}): EventRow {
  return {
    gi: 0, label: "Verse 1", section: "Verse", color: "#FF3DA6",
    win_start: 0.3, win_end: 6.4, linger: 0, cueCount: 3, ...overrides,
  };
}

const NOOP = {
  onSetLabel: vi.fn(), onSetSection: vi.fn(), onSetColor: vi.fn(),
  onSetLinger: vi.fn(), onMerge: vi.fn(), onSplit: vi.fn(),
};

function renderPanel(events: EventRow[], extra: Partial<React.ComponentProps<typeof EventsPanel>> = {}) {
  const handlers = {
    onSetLabel: vi.fn(), onSetSection: vi.fn(), onSetColor: vi.fn(),
    onSetLinger: vi.fn(), onMerge: vi.fn(), onSplit: vi.fn(),
  };
  const utils = render(
    <EventsPanel events={events} focusedGi={null} {...handlers} {...extra} />,
  );
  return { ...utils, ...handlers };
}

describe("EventsPanel", () => {
  it("renders one row per event", () => {
    const { container } = renderPanel([row({ gi: 0 }), row({ gi: 1, label: "Chorus" }), row({ gi: 2, label: "Bridge" })]);
    expect(container.querySelectorAll(".ev")).toHaveLength(3);
    const names = screen.getAllByLabelText("Event name").map((n) => n.textContent);
    expect(names).toEqual(["Verse 1", "Chorus", "Bridge"]);
  });

  it("linger + and − call onSetLinger", () => {
    const { onSetLinger, container } = renderPanel([row({ gi: 0, linger: 0.4 })]);
    const stepper = container.querySelector(".stepper") as HTMLElement;
    fireEvent.click(within(stepper).getByText("＋"));
    expect(onSetLinger).toHaveBeenCalledWith(0, expect.closeTo(0.5, 5));
    fireEvent.click(within(stepper).getByText("−"));
    expect(onSetLinger).toHaveBeenCalledWith(0, expect.closeTo(0.3, 5));
  });

  it("linger − clamps at 0", () => {
    const { onSetLinger, container } = renderPanel([row({ gi: 0, linger: 0 })]);
    const stepper = container.querySelector(".stepper") as HTMLElement;
    fireEvent.click(within(stepper).getByText("−"));
    expect(onSetLinger).toHaveBeenCalledWith(0, 0);
  });

  it("section change calls onSetSection", () => {
    const { onSetSection } = renderPanel([row({ gi: 0, section: "Verse" })]);
    const sel = screen.getByLabelText("Section for event 0") as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: "Chorus" } });
    expect(onSetSection).toHaveBeenCalledWith(0, "Chorus");
  });

  it("Custom… opens the modal and Save sanitizes (trims), calls onSetSection", () => {
    const { onSetSection } = renderPanel([row({ gi: 0, section: "Verse" })]);
    fireEvent.change(screen.getByLabelText("Section for event 0"), { target: { value: "__custom" } });
    const input = screen.getByLabelText("Custom section name") as HTMLInputElement;
    // oneLine on Save trims surrounding whitespace (the <input> already drops the
    // literal newlines an HTML single-line field can't hold).
    fireEvent.change(input, { target: { value: "  Refrain  " } });
    fireEvent.click(screen.getByText("Save"));
    expect(onSetSection).toHaveBeenCalledWith(0, "Refrain");
  });

  it("oneLine collapses newlines to a space (the §6 paste/save guard)", async () => {
    const { oneLine } = await import("../../model/events");
    expect(oneLine("Drop\r\nzone")).toBe("Drop zone");
    expect(oneLine("  \n  ")).toBe("");
  });

  it("Custom… with empty value saves '—'", () => {
    const { onSetSection } = renderPanel([row({ gi: 0, section: "Verse" })]);
    fireEvent.change(screen.getByLabelText("Section for event 0"), { target: { value: "__custom" } });
    fireEvent.change(screen.getByLabelText("Custom section name"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Save"));
    expect(onSetSection).toHaveBeenCalledWith(0, "—");
  });

  it("color dot opens the palette popover and a swatch calls onSetColor", () => {
    const { onSetColor } = renderPanel([row({ gi: 0 })]);
    fireEvent.click(screen.getByLabelText("Recolor event 0"));
    fireEvent.click(screen.getByLabelText("Set color #36E2FF"));
    expect(onSetColor).toHaveBeenCalledWith(0, "#36E2FF");
  });

  it("Merge is disabled with fewer than 2 selected", () => {
    renderPanel([row({ gi: 0 }), row({ gi: 1 })]);
    expect(screen.getByRole("button", { name: /merge selected/i })).toBeDisabled();
  });

  it("Merge is disabled when 2 selected events are non-contiguous", () => {
    const { container } = renderPanel([row({ gi: 0 }), row({ gi: 1 }), row({ gi: 2 })]);
    const rows = container.querySelectorAll(".ev");
    fireEvent.click(rows[0]);
    fireEvent.click(rows[2]);
    expect(screen.getByRole("button", { name: /merge selected/i })).toBeDisabled();
  });

  it("Merge is enabled when 2 contiguous events are selected and dispatches sorted gidxs", () => {
    const { container, onMerge } = renderPanel([row({ gi: 0 }), row({ gi: 1 }), row({ gi: 2 })]);
    const rows = container.querySelectorAll(".ev");
    fireEvent.click(rows[2]);
    fireEvent.click(rows[1]);
    const btn = screen.getByRole("button", { name: /merge selected/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onMerge).toHaveBeenCalledWith([1, 2]);
  });

  it("Split at cue is disabled with no focused event and enabled+dispatches with one", () => {
    const onSplit = vi.fn();
    const { rerender } = render(<EventsPanel events={[row({ gi: 0 })]} focusedGi={null} {...NOOP} onSplit={onSplit} />);
    expect(screen.getByRole("button", { name: /split at cue/i })).toBeDisabled();
    rerender(<EventsPanel events={[row({ gi: 0 })]} focusedGi={0} {...NOOP} onSplit={onSplit} />);
    const btn = screen.getByRole("button", { name: /split at cue/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onSplit).toHaveBeenCalledWith(0);
  });

  it("editing a name commits the trimmed value via onSetLabel on blur", () => {
    const { onSetLabel } = renderPanel([row({ gi: 0, label: "Verse 1" })]);
    const name = screen.getByLabelText("Event name");
    name.textContent = "  Chorus  ";
    fireEvent.blur(name);
    expect(onSetLabel).toHaveBeenCalledWith(0, "Chorus");
  });

  it("an empty label renders 'Untitled event' with the unnamed class", () => {
    const { container } = renderPanel([row({ gi: 0, label: "" })]);
    const name = container.querySelector(".name") as HTMLElement;
    expect(name.textContent).toBe("Untitled event");
    expect(name.classList.contains("unnamed")).toBe(true);
  });

  it("clicking a row toggles selection but a click on the name does not", () => {
    const { container } = renderPanel([row({ gi: 0 }), row({ gi: 1 })]);
    const rows = container.querySelectorAll(".ev");
    // clicking the name cell must NOT select the row (merge stays disabled at 1)
    fireEvent.click(within(rows[0] as HTMLElement).getByLabelText("Event name"));
    fireEvent.click(rows[1]);
    expect(screen.getByRole("button", { name: /merge selected/i })).toBeDisabled();
  });
});
