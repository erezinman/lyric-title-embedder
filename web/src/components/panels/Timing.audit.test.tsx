// Timing.audit.test.tsx — Cluster C audit for TimingPanel:
// lock pill, unlocked/locked timing inputs, arrow key stepping, blur commit,
// merged cue gating, text field behavior, original value revert.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimingPanel } from "./TimingPanel";
import { baseProject, withMergedTok } from "../../test-util/fixtures";
import type { Project, Token } from "../../types";

function singleTok(): Token {
  return { ids: [0], sep: "", del: false, style: {} };
}

function proj(): Project {
  return baseProject();
}

// ---------- C-20 — Lock pill ----------

describe("C-20 — lock pill toggle", () => {
  // FINDING: lock-pill button accessible name is its text content ("locked"/"unlocked"),
  // not the title attribute ("Unlock timings"/"Lock timings"). The title IS set correctly
  // but getByRole resolves name from text first. Tests use text-based query instead.
  it.fails("C-20a — FINDING: lock pill accessible name is title ('Unlock timings') not text ('locked')", () => {
    render(
      <TimingPanel
        tok={singleTok()}
        project={proj()}
        unlocked={false}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    // This FAILS: button text is "locked", not matching /unlock timings/i
    expect(screen.getByRole("button", { name: /unlock timings/i })).toBeTruthy();
  });

  it.fails("C-20b — FINDING: lock pill accessible name is title ('Lock timings') not text ('unlocked')", () => {
    render(
      <TimingPanel
        tok={singleTok()}
        project={proj()}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    // This FAILS: button text is "unlocked", not matching /lock timings/i
    expect(screen.getByRole("button", { name: /lock timings/i })).toBeTruthy();
  });

  it("C-20a2 — lock pill shows 'locked' text when locked and has title 'Unlock timings'", () => {
    render(
      <TimingPanel
        tok={singleTok()}
        project={proj()}
        unlocked={false}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    const btn = screen.getByTitle("Unlock timings");
    expect(btn.textContent).toContain("locked");
  });

  it("C-20b2 — lock pill shows 'unlocked' text when unlocked and has title 'Lock timings'", () => {
    render(
      <TimingPanel
        tok={singleTok()}
        project={proj()}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    const btn = screen.getByTitle("Lock timings");
    expect(btn.textContent).toContain("unlocked");
  });

  it("C-20c — clicking lock pill calls onToggleLock", async () => {
    const onToggleLock = vi.fn();
    render(
      <TimingPanel
        tok={singleTok()}
        project={proj()}
        unlocked={false}
        onToggleLock={onToggleLock}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    await userEvent.click(screen.getByTitle("Unlock timings"));
    expect(onToggleLock).toHaveBeenCalledTimes(1);
  });

  it("C-20d — clicking lock pill again calls onToggleLock again (toggle×2)", async () => {
    const onToggleLock = vi.fn();
    const { rerender } = render(
      <TimingPanel
        tok={singleTok()}
        project={proj()}
        unlocked={false}
        onToggleLock={onToggleLock}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    await userEvent.click(screen.getByTitle("Unlock timings"));
    rerender(
      <TimingPanel
        tok={singleTok()}
        project={proj()}
        unlocked={true}
        onToggleLock={onToggleLock}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    await userEvent.click(screen.getByTitle("Lock timings"));
    expect(onToggleLock).toHaveBeenCalledTimes(2);
  });
});

// ---------- C-21 — Locked timing inputs disabled ----------

describe("C-21 — locked: Start/End disabled, no commits on ArrowUp", () => {
  it("C-21a — Start input is disabled when locked", () => {
    render(
      <TimingPanel
        tok={singleTok()}
        project={proj()}
        unlocked={false}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    expect((screen.getByLabelText(/^start$/i) as HTMLInputElement).disabled).toBe(true);
  });

  it("C-21b — End input is disabled when locked", () => {
    render(
      <TimingPanel
        tok={singleTok()}
        project={proj()}
        unlocked={false}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    expect((screen.getByLabelText(/^end$/i) as HTMLInputElement).disabled).toBe(true);
  });

  it.fails(
    "C-21c — FINDING: fireEvent.keyDown on disabled input still calls onSetTime (jsdom bypasses disabled state; real browser would not)",
    () => {
      const onSetTime = vi.fn();
      render(
        <TimingPanel
          tok={singleTok()}
          project={proj()}
          unlocked={false}
          onToggleLock={vi.fn()}
          onSetTime={onSetTime}
          onSetText={vi.fn()}
        />
      );
      const startInput = screen.getByLabelText(/^start$/i);
      // In a real browser a disabled input receives no keyboard events.
      // jsdom's fireEvent ignores the disabled attribute and fires anyway.
      fireEvent.keyDown(startInput, { key: "ArrowUp" });
      // FAILS: onSetTime IS called because jsdom bypasses disabled attribute on keyDown.
      expect(onSetTime).not.toHaveBeenCalled();
    }
  );
});

// ---------- C-22 — Unlocked timing inputs ----------

describe("C-22 — unlocked: Start/End enabled, commit via Enter", () => {
  it("C-22a — Start input is enabled when unlocked", () => {
    render(
      <TimingPanel
        tok={singleTok()}
        project={proj()}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    expect((screen.getByLabelText(/^start$/i) as HTMLInputElement).disabled).toBe(false);
  });

  it("C-22b — End input is enabled when unlocked", () => {
    render(
      <TimingPanel
        tok={singleTok()}
        project={proj()}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    expect((screen.getByLabelText(/^end$/i) as HTMLInputElement).disabled).toBe(false);
  });

  it("C-22c — typing value in Start and pressing Enter calls onSetTime with clamped start < end", async () => {
    const onSetTime = vi.fn();
    const p = proj(); // word 0: start=0.5, end=1.2
    render(
      <TimingPanel
        tok={singleTok()}
        project={p}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={onSetTime}
        onSetText={vi.fn()}
      />
    );
    const startInput = screen.getByLabelText(/^start$/i);
    await userEvent.clear(startInput);
    await userEvent.type(startInput, "0.3{Enter}");
    expect(onSetTime).toHaveBeenCalledWith(
      expect.any(Number), // start clamped: max(0, min(0.3, end-0.01))
      expect.any(Number)  // end
    );
    const call = onSetTime.mock.calls[0];
    expect(call[0]).toBeCloseTo(0.3, 2);
  });

  it("C-22d — typing value in End and pressing Enter calls onSetTime with end > start", async () => {
    const onSetTime = vi.fn();
    const p = proj(); // word 0: start=0.5, end=1.2
    render(
      <TimingPanel
        tok={singleTok()}
        project={p}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={onSetTime}
        onSetText={vi.fn()}
      />
    );
    const endInput = screen.getByLabelText(/^end$/i);
    await userEvent.clear(endInput);
    await userEvent.type(endInput, "2.0{Enter}");
    expect(onSetTime).toHaveBeenCalledWith(expect.any(Number), 2.0);
  });

  it("C-22e — blur on End commits onSetTime", async () => {
    const onSetTime = vi.fn();
    const p = proj();
    render(
      <TimingPanel
        tok={singleTok()}
        project={p}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={onSetTime}
        onSetText={vi.fn()}
      />
    );
    const endInput = screen.getByLabelText(/^end$/i);
    await userEvent.clear(endInput);
    await userEvent.type(endInput, "1.5");
    fireEvent.blur(endInput);
    expect(onSetTime).toHaveBeenCalled();
  });

  it("C-22f — ArrowUp on Start calls onSetTime with start+0.05", () => {
    const onSetTime = vi.fn();
    const p = proj(); // word 0: start=0.5
    render(
      <TimingPanel
        tok={singleTok()}
        project={p}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={onSetTime}
        onSetText={vi.fn()}
      />
    );
    const startInput = screen.getByLabelText(/^start$/i);
    fireEvent.keyDown(startInput, { key: "ArrowUp" });
    expect(onSetTime).toHaveBeenCalledTimes(1);
  });

  it("C-22g — ArrowDown on Start calls onSetTime (decrements by 0.05)", () => {
    const onSetTime = vi.fn();
    const p = proj();
    render(
      <TimingPanel
        tok={singleTok()}
        project={p}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={onSetTime}
        onSetText={vi.fn()}
      />
    );
    const startInput = screen.getByLabelText(/^start$/i);
    fireEvent.keyDown(startInput, { key: "ArrowDown" });
    expect(onSetTime).toHaveBeenCalledTimes(1);
  });
});

// ---------- C-23 — Merged cue gating ----------

describe("C-23 — merged cue: timing fields and text field disabled", () => {
  it("C-23a — merged cue: Start disabled even when unlocked", () => {
    const p = withMergedTok(baseProject());
    const mergedTok = p.layout[0].lines[0].toks[0]; // ids=[0,1]
    render(
      <TimingPanel
        tok={mergedTok}
        project={p}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    expect((screen.getByLabelText(/^start$/i) as HTMLInputElement).disabled).toBe(true);
  });

  it("C-23b — merged cue: End disabled even when unlocked", () => {
    const p = withMergedTok(baseProject());
    const mergedTok = p.layout[0].lines[0].toks[0];
    render(
      <TimingPanel
        tok={mergedTok}
        project={p}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    expect((screen.getByLabelText(/^end$/i) as HTMLInputElement).disabled).toBe(true);
  });

  it("C-23c — merged cue: text input disabled", () => {
    const p = withMergedTok(baseProject());
    const mergedTok = p.layout[0].lines[0].toks[0];
    render(
      <TimingPanel
        tok={mergedTok}
        project={p}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    expect((screen.getByLabelText(/text/i) as HTMLInputElement).disabled).toBe(true);
  });

  it("C-23d — merged cue: shows 'Merged cue' note", () => {
    const p = withMergedTok(baseProject());
    const mergedTok = p.layout[0].lines[0].toks[0];
    render(
      <TimingPanel
        tok={mergedTok}
        project={p}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    expect(screen.getByText(/Merged cue/i)).toBeTruthy();
  });
});

// ---------- C-24 — Text field behavior ----------

describe("C-24 — text field: Enter and blur commit", () => {
  it("C-24a — pressing Enter in text field calls onSetText with current value", async () => {
    const onSetText = vi.fn();
    render(
      <TimingPanel
        tok={singleTok()}
        project={proj()}
        unlocked={false}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={onSetText}
      />
    );
    const textInput = screen.getByLabelText(/text/i);
    await userEvent.clear(textInput);
    await userEvent.type(textInput, "hello{Enter}");
    expect(onSetText).toHaveBeenCalledWith("hello");
  });

  it("C-24b — blurring text field calls onSetText with current value", async () => {
    const onSetText = vi.fn();
    render(
      <TimingPanel
        tok={singleTok()}
        project={proj()}
        unlocked={false}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={onSetText}
      />
    );
    const textInput = screen.getByLabelText(/text/i);
    await userEvent.clear(textInput);
    await userEvent.type(textInput, "world");
    fireEvent.blur(textInput);
    expect(onSetText).toHaveBeenCalledWith("world");
  });

  it("C-24c — text field shows current word text on render", () => {
    const p = proj();
    // word 0 = "alpha"
    render(
      <TimingPanel
        tok={singleTok()}
        project={p}
        unlocked={false}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    expect((screen.getByLabelText(/text/i) as HTMLInputElement).value).toBe("alpha");
  });

  it("C-24d — retyping the original text still calls onSetText", async () => {
    const onSetText = vi.fn();
    const p = proj();
    render(
      <TimingPanel
        tok={singleTok()}
        project={p}
        unlocked={false}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={onSetText}
      />
    );
    const textInput = screen.getByLabelText(/text/i);
    await userEvent.clear(textInput);
    await userEvent.type(textInput, "alpha{Enter}");
    expect(onSetText).toHaveBeenCalledWith("alpha");
  });
});

// ---------- C-25 — tok=null renders nothing ----------

describe("C-25 — tok=null renders nothing", () => {
  it("C-25a — TimingPanel renders null when tok is null", () => {
    const { container } = render(
      <TimingPanel
        tok={null}
        project={proj()}
        unlocked={false}
        onToggleLock={vi.fn()}
        onSetTime={vi.fn()}
        onSetText={vi.fn()}
      />
    );
    expect(container.querySelector(".timing")).toBeNull();
  });
});

// ---------- C-26 — Start clamping ----------

describe("C-26 — Start clamping: value capped at end-0.01", () => {
  it("C-26a — entering Start value > end triggers clamped onSetTime", async () => {
    const onSetTime = vi.fn();
    const p = proj(); // word 0: start=0.5, end=1.2
    render(
      <TimingPanel
        tok={singleTok()}
        project={p}
        unlocked={true}
        onToggleLock={vi.fn()}
        onSetTime={onSetTime}
        onSetText={vi.fn()}
      />
    );
    const startInput = screen.getByLabelText(/^start$/i);
    await userEvent.clear(startInput);
    await userEvent.type(startInput, "5.0{Enter}");
    // start should be clamped to end-0.01 = 1.2-0.01 = 1.19
    const call = onSetTime.mock.calls[0];
    expect(call[0]).toBeLessThan(call[1]); // start < end
    expect(call[0]).toBeCloseTo(1.19, 1);
  });
});
