// Fade.audit.test.tsx — Cluster C audit for FadeGroupPanel + FadeDefaultsPanel:
// trigger stepper mechanics, auto reset, clear, render conditions, double-press, min clamps.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FadeGroupPanel } from "./FadeGroupPanel";
import { FadeDefaultsPanel } from "./FadeDefaultsPanel";
import { baseProject, withFadeTags } from "../../test-util/fixtures";
import type { Project, FadeTag } from "../../types";

// ---------- helpers ----------

function proj(): Project {
  return baseProject();
}

function finTag(trigger: number | null = null, ids = [0, 1]): FadeTag {
  return { ids, trigger };
}

function foutTag(trigger: number | null = null, ids = [4, 5]): FadeTag {
  return { ids, trigger };
}

// ---------- C-30 — FadeGroupPanel render conditions ----------

describe("C-30 — FadeGroupPanel render conditions", () => {
  it("C-30a — renders null when both finTag and foutTag are null", () => {
    const { container } = render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={null}
        foutTag={null}
        onSet={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(container.querySelector(".fg-panel")).toBeNull();
  });

  it("C-30b — renders when only finTag is present", () => {
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag()}
        foutTag={null}
        onSet={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText("Fade-in")).toBeTruthy();
    expect(screen.queryByText("Fade-out")).toBeNull();
  });

  it("C-30c — renders when only foutTag is present", () => {
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={null}
        foutTag={foutTag()}
        onSet={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText("Fade-out")).toBeTruthy();
    expect(screen.queryByText("Fade-in")).toBeNull();
  });

  it("C-30d — renders both rows when both tags present", () => {
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag()}
        foutTag={foutTag()}
        onSet={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText("Fade-in")).toBeTruthy();
    expect(screen.getByText("Fade-out")).toBeTruthy();
  });
});

// ---------- C-31 — FadeGroupPanel trigger stepper from auto (null=0) ----------

describe("C-31 — FadeGroupPanel trigger stepper from auto (trigger=null → val=0)", () => {
  it("C-31a — '+' on fade-in with trigger=null calls onSet('in', 0+0.5=0.5)", async () => {
    const onSet = vi.fn();
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag(null)} // trigger=null → auto, val=0
        foutTag={null}
        onSet={onSet}
        onClear={vi.fn()}
      />
    );
    const row = screen.getByText("Fade-in").closest(".fg-row") as HTMLElement;
    await userEvent.click(within(row).getAllByText("+").find(el => el.className === "pm")!);
    expect(onSet).toHaveBeenCalledWith("in", 0.5);
  });

  it("C-31b — '−' on fade-in with trigger=null calls onSet('in', 0) (clamped at 0)", async () => {
    const onSet = vi.fn();
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag(null)} // trigger=null, val=0
        foutTag={null}
        onSet={onSet}
        onClear={vi.fn()}
      />
    );
    const row = screen.getByText("Fade-in").closest(".fg-row") as HTMLElement;
    await userEvent.click(within(row).getAllByText("−").find(el => el.className === "pm")!);
    expect(onSet).toHaveBeenCalledWith("in", 0);
  });

  it("C-31c — '+' on fade-out with trigger=null calls onSet('out', 0.5)", async () => {
    const onSet = vi.fn();
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={null}
        foutTag={foutTag(null)}
        onSet={onSet}
        onClear={vi.fn()}
      />
    );
    const row = screen.getByText("Fade-out").closest(".fg-row") as HTMLElement;
    await userEvent.click(within(row).getAllByText("+").find(el => el.className === "pm")!);
    expect(onSet).toHaveBeenCalledWith("out", 0.5);
  });
});

// ---------- C-32 — FadeGroupPanel trigger stepper from set values ----------

describe("C-32 — FadeGroupPanel trigger stepper from set values", () => {
  it("C-32a — '+' on fade-in with trigger=1.5 calls onSet('in', 2.0)", async () => {
    const onSet = vi.fn();
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag(1.5)}
        foutTag={null}
        onSet={onSet}
        onClear={vi.fn()}
      />
    );
    const row = screen.getByText("Fade-in").closest(".fg-row") as HTMLElement;
    await userEvent.click(within(row).getAllByText("+").find(el => el.className === "pm")!);
    expect(onSet).toHaveBeenCalledWith("in", 2.0);
  });

  it("C-32b — '−' on fade-in with trigger=1.5 calls onSet('in', 1.0)", async () => {
    const onSet = vi.fn();
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag(1.5)}
        foutTag={null}
        onSet={onSet}
        onClear={vi.fn()}
      />
    );
    const row = screen.getByText("Fade-in").closest(".fg-row") as HTMLElement;
    await userEvent.click(within(row).getAllByText("−").find(el => el.className === "pm")!);
    expect(onSet).toHaveBeenCalledWith("in", 1.0);
  });

  it("C-32c — trigger cannot go below 0 (clamp)", async () => {
    const onSet = vi.fn();
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag(0.3)}
        foutTag={null}
        onSet={onSet}
        onClear={vi.fn()}
      />
    );
    const row = screen.getByText("Fade-in").closest(".fg-row") as HTMLElement;
    await userEvent.click(within(row).getAllByText("−").find(el => el.className === "pm")!);
    // 0.3-0.5=-0.2 → clamp to 0
    expect(onSet).toHaveBeenCalledWith("in", 0);
  });

  it("C-32d — double press '+' produces cumulative correct values", async () => {
    const onSet = vi.fn();
    const { rerender } = render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag(1.0)}
        foutTag={null}
        onSet={onSet}
        onClear={vi.fn()}
      />
    );
    const row = screen.getByText("Fade-in").closest(".fg-row") as HTMLElement;
    await userEvent.click(within(row).getAllByText("+").find(el => el.className === "pm")!);
    expect(onSet).toHaveBeenNthCalledWith(1, "in", 1.5);

    rerender(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag(1.5)}
        foutTag={null}
        onSet={onSet}
        onClear={vi.fn()}
      />
    );
    const row2 = screen.getByText("Fade-in").closest(".fg-row") as HTMLElement;
    await userEvent.click(within(row2).getAllByText("+").find(el => el.className === "pm")!);
    expect(onSet).toHaveBeenNthCalledWith(2, "in", 2.0);
  });
});

// ---------- C-33 — FadeGroupPanel "auto" reset button ----------

describe("C-33 — FadeGroupPanel 'auto' reset button", () => {
  it("C-33a — 'auto' button visible when trigger is set (not null)", () => {
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag(1.5)}
        foutTag={null}
        onSet={vi.fn()}
        onClear={vi.fn()}
      />
    );
    const row = screen.getByText("Fade-in").closest(".fg-row") as HTMLElement;
    expect(within(row).queryByText("auto")).toBeTruthy();
  });

  it("C-33b — 'auto' reset button (.pm.x) NOT present when trigger is null (only bold label 'auto')", () => {
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag(null)}
        foutTag={null}
        onSet={vi.fn()}
        onClear={vi.fn()}
      />
    );
    const row = screen.getByText("Fade-in").closest(".fg-row") as HTMLElement;
    // When trigger=null, "auto" appears as a <b> label text (not a reset button).
    // The reset button has class "pm x" — it should NOT be present.
    expect(row.querySelector(".pm.x")).toBeNull();
  });

  it("C-33c — clicking 'auto' calls onSet('in', null)", async () => {
    const onSet = vi.fn();
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag(1.5)}
        foutTag={null}
        onSet={onSet}
        onClear={vi.fn()}
      />
    );
    const row = screen.getByText("Fade-in").closest(".fg-row") as HTMLElement;
    await userEvent.click(within(row).getByText("auto"));
    expect(onSet).toHaveBeenCalledWith("in", null);
  });
});

// ---------- C-34 — FadeGroupPanel clear button ----------

describe("C-34 — FadeGroupPanel Clear button calls onClear", () => {
  it("C-34a — clicking Clear on fade-in row calls onClear('in')", async () => {
    const onClear = vi.fn();
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag()}
        foutTag={null}
        onSet={vi.fn()}
        onClear={onClear}
      />
    );
    const row = screen.getByText("Fade-in").closest(".fg-row") as HTMLElement;
    await userEvent.click(within(row).getByText(/clear/i));
    expect(onClear).toHaveBeenCalledWith("in");
  });

  it("C-34b — clicking Clear on fade-out row calls onClear('out')", async () => {
    const onClear = vi.fn();
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={null}
        foutTag={foutTag()}
        onSet={vi.fn()}
        onClear={onClear}
      />
    );
    const row = screen.getByText("Fade-out").closest(".fg-row") as HTMLElement;
    await userEvent.click(within(row).getByText(/clear/i));
    expect(onClear).toHaveBeenCalledWith("out");
  });
});

// ---------- C-35 — FadeGroupPanel with withFadeTags fixture ----------

describe("C-35 — FadeGroupPanel with withFadeTags fixture", () => {
  it("C-35a — withFadeTags fixture: finTag and foutTag are both rendered", () => {
    const p = withFadeTags(baseProject());
    const ft = p.fin_tags[0];
    const fot = p.fout_tags[0];
    render(
      <FadeGroupPanel
        project={p}
        gi={0}
        finTag={ft}
        foutTag={fot}
        onSet={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText("Fade-in")).toBeTruthy();
    expect(screen.getByText("Fade-out")).toBeTruthy();
  });

  it("C-35b — foutTag trigger=2.5 is shown in row", () => {
    const p = withFadeTags(baseProject());
    const fot = p.fout_tags[0]; // trigger=2.5
    render(
      <FadeGroupPanel
        project={p}
        gi={0}
        finTag={null}
        foutTag={fot}
        onSet={vi.fn()}
        onClear={vi.fn()}
      />
    );
    const row = screen.getByText("Fade-out").closest(".fg-row") as HTMLElement;
    expect(within(row).queryByText("2.50s")).toBeTruthy();
  });

  it("C-35c — finTag trigger=null shows 'auto' label not an 'auto' button", () => {
    const p = withFadeTags(baseProject());
    const ft = p.fin_tags[0]; // trigger=null
    render(
      <FadeGroupPanel
        project={p}
        gi={0}
        finTag={ft}
        foutTag={null}
        onSet={vi.fn()}
        onClear={vi.fn()}
      />
    );
    const row = screen.getByText("Fade-in").closest(".fg-row") as HTMLElement;
    // 'auto' text in the trig display (bold)
    expect(row.textContent).toContain("auto");
    // But no 'auto' reset button (only shows when trigger is set)
    const autoBtn = within(row).queryByText("auto");
    // The "auto" in the bold is inside <b>auto</b>, check it's not a .pm.x button
    if (autoBtn) {
      expect(autoBtn.className).not.toContain("pm x");
    }
  });
});

// ---------- C-36 — FadeGroupPanel word count display ----------

describe("C-36 — FadeGroupPanel word count", () => {
  it("C-36a — shows correct word count in fade-in row", () => {
    render(
      <FadeGroupPanel
        project={proj()}
        gi={0}
        finTag={finTag(null, [0, 1, 2, 3])}
        foutTag={null}
        onSet={vi.fn()}
        onClear={vi.fn()}
      />
    );
    const row = screen.getByText("Fade-in").closest(".fg-row") as HTMLElement;
    expect(within(row).queryByText("4 words")).toBeTruthy();
  });
});

// ---------- C-40 — FadeDefaultsPanel additional tests ----------

describe("C-40 — FadeDefaultsPanel: double-press and min-0 clamp", () => {
  it("C-40a — double press '+' on fade_in_ms: second press uses 300, gets 350", async () => {
    const onSet = vi.fn();
    const g = { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 };
    const { rerender } = render(<FadeDefaultsPanel globals={g} onSet={onSet} />);
    const row = screen.getByText("Fade-in").closest(".fd-row") as HTMLElement;
    await userEvent.click(within(row).getByText("+"));
    expect(onSet).toHaveBeenNthCalledWith(1, "fade_in_ms", 300);

    rerender(<FadeDefaultsPanel globals={{ ...g, fade_in_ms: 300 }} onSet={onSet} />);
    const row2 = screen.getByText("Fade-in").closest(".fd-row") as HTMLElement;
    await userEvent.click(within(row2).getByText("+"));
    expect(onSet).toHaveBeenNthCalledWith(2, "fade_in_ms", 350);
  });

  it("C-40b — linger min 0: decrement from 0 stays 0", async () => {
    const onSet = vi.fn();
    render(<FadeDefaultsPanel globals={{ fade_in_ms: 250, fade_out_ms: 1000, linger: 0 }} onSet={onSet} />);
    const row = screen.getByText("Linger").closest(".fd-row") as HTMLElement;
    await userEvent.click(within(row).getByText("−"));
    expect(onSet).toHaveBeenCalledWith("linger", 0);
  });

  it("C-40c — linger double press '+' cumulative: 0→0.1→0.2", async () => {
    const onSet = vi.fn();
    const { rerender } = render(
      <FadeDefaultsPanel globals={{ fade_in_ms: 250, fade_out_ms: 1000, linger: 0 }} onSet={onSet} />
    );
    const row = screen.getByText("Linger").closest(".fd-row") as HTMLElement;
    await userEvent.click(within(row).getByText("+"));
    expect(onSet).toHaveBeenNthCalledWith(1, "linger", 0.1);

    rerender(<FadeDefaultsPanel globals={{ fade_in_ms: 250, fade_out_ms: 1000, linger: 0.1 }} onSet={onSet} />);
    const row2 = screen.getByText("Linger").closest(".fd-row") as HTMLElement;
    await userEvent.click(within(row2).getByText("+"));
    expect(onSet).toHaveBeenNthCalledWith(2, "linger", 0.2);
  });

  it("C-40d — fade_out_ms '−' double press: 1000→950→900", async () => {
    const onSet = vi.fn();
    const { rerender } = render(
      <FadeDefaultsPanel globals={{ fade_in_ms: 250, fade_out_ms: 1000, linger: 0 }} onSet={onSet} />
    );
    const row = screen.getByText("Fade-out").closest(".fd-row") as HTMLElement;
    await userEvent.click(within(row).getByText("−"));
    expect(onSet).toHaveBeenNthCalledWith(1, "fade_out_ms", 950);

    rerender(<FadeDefaultsPanel globals={{ fade_in_ms: 250, fade_out_ms: 950, linger: 0 }} onSet={onSet} />);
    const row2 = screen.getByText("Fade-out").closest(".fd-row") as HTMLElement;
    await userEvent.click(within(row2).getByText("−"));
    expect(onSet).toHaveBeenNthCalledWith(2, "fade_out_ms", 900);
  });

  it("C-40e — all three steppers render their values", () => {
    render(
      <FadeDefaultsPanel globals={{ fade_in_ms: 300, fade_out_ms: 800, linger: 0.5 }} onSet={vi.fn()} />
    );
    expect(screen.getByText("300ms")).toBeTruthy();
    expect(screen.getByText("800ms")).toBeTruthy();
    expect(screen.getByText("0.5s")).toBeTruthy();
  });

  it("C-40f — fade_in_ms min 0: decrement from 0 stays 0", async () => {
    const onSet = vi.fn();
    render(<FadeDefaultsPanel globals={{ fade_in_ms: 0, fade_out_ms: 1000, linger: 0 }} onSet={onSet} />);
    const row = screen.getByText("Fade-in").closest(".fd-row") as HTMLElement;
    await userEvent.click(within(row).getByText("−"));
    expect(onSet).toHaveBeenCalledWith("fade_in_ms", 0);
  });
});
