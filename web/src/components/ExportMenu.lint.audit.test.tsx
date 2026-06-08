/**
 * ExportMenu.lint.audit.test.tsx — Feature B export pre-flight lint panel.
 * Covers the designer's 3 states (≥1 blocking / advisory-only / clean), the
 * burn gate, the jump affordance, and re-check re-gating.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ExportMenu } from "./ExportMenu";
import * as client from "../api/client";
import type { LintIssue } from "../api/client";

beforeEach(() => {
  vi.restoreAllMocks();
  (URL as any).createObjectURL ??= () => "blob:x";
  (URL as any).revokeObjectURL ??= () => {};
  vi.spyOn(client, "getEnv").mockResolvedValue({ same_host: false });
});

const overlap: LintIssue = {
  level: "warn", severity: "blocking", code: "anim_overlap",
  msg: "group-scope animations overlap on channel 'scale_x'",
  where: { scope: "group", channel: "scale_x", gi: 0, li: 0, ti: 0, word_id: 3, time: 1.4 },
};
const clamped: LintIssue = {
  level: "warn", severity: "advisory", code: "anim_clamped",
  msg: "animation 'fade' (alpha) extends outside the event window and will be clamped",
  where: { gi: 0, li: 0, ti: 0, anim_id: "fade", word_id: 7, time: 2.5 },
};
const offCanvas: LintIssue = {
  level: "warn", severity: "info", code: "pos_off_canvas",
  msg: "position (960,1042) is outside the 1920x1080 canvas",
  where: { placement: true, pos: [960, 1042] },
};

function setup(opts: { lint?: LintIssue[]; onJump?: any } = {}) {
  const onBurn = vi.fn();
  const onClose = vi.fn();
  const onJump = opts.onJump ?? vi.fn();
  const lintSpy = vi.spyOn(client, "lint").mockResolvedValue(opts.lint ?? []);
  render(
    <ExportMenu projectName="mysong" onBurn={onBurn} onClose={onClose}
                onJump={onJump} wordCount={363} eventCount={41} />
  );
  return { onBurn, onClose, onJump, lintSpy };
}

const burnBtn = () => screen.getByRole("button", { name: /burn/i }) as HTMLButtonElement;

// ---------------------------------------------------------------------------
describe("LB-1 — blocking state: ≥1 blocking issue", () => {
  it("LB-1a — renders all issue rows from the mocked lint result", async () => {
    setup({ lint: [overlap, clamped, offCanvas] });
    await screen.findByText(/two animations overlap/i);
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });

  it("LB-1b — Burn is disabled while a blocking issue is present", async () => {
    setup({ lint: [overlap, clamped, offCanvas] });
    await screen.findByText(/two animations overlap/i);
    expect(burnBtn()).toBeDisabled();
  });

  it("LB-1c — footer names the blocking count", async () => {
    setup({ lint: [overlap] });
    await screen.findByText(/two animations overlap/i);
    expect(screen.getByText(/1 blocking/i)).toBeInTheDocument();
  });

  it("LB-1d — clicking a disabled Burn does not fire onBurn", async () => {
    const { onBurn } = setup({ lint: [overlap] });
    await screen.findByText(/two animations overlap/i);
    fireEvent.click(burnBtn());
    expect(onBurn).not.toHaveBeenCalled();
  });

  it("LB-1e — severity chips carry the correct severity data-attr", async () => {
    setup({ lint: [overlap, clamped, offCanvas] });
    await screen.findByText(/two animations overlap/i);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items[0].getAttribute("data-severity")).toBe("blocking");
    expect(items[1].getAttribute("data-severity")).toBe("advisory");
    expect(items[2].getAttribute("data-severity")).toBe("info");
  });
});

// ---------------------------------------------------------------------------
describe("LB-2 — advisory-only state", () => {
  it("LB-2a — Burn is enabled and reads 'Burn anyway'", async () => {
    setup({ lint: [clamped] });
    await screen.findByText(/trigger clamped/i);
    const b = screen.getByRole("button", { name: /burn anyway/i }) as HTMLButtonElement;
    expect(b).toBeEnabled();
  });

  it("LB-2b — footer offers burn-anyway", async () => {
    setup({ lint: [clamped] });
    await screen.findByText(/trigger clamped/i);
    expect(screen.getByText(/won.t block/i)).toBeInTheDocument();
  });

  it("LB-2c — clicking Burn anyway fires onBurn + onClose", async () => {
    const { onBurn, onClose } = setup({ lint: [clamped] });
    await screen.findByText(/trigger clamped/i);
    fireEvent.click(screen.getByRole("button", { name: /burn anyway/i }));
    expect(onBurn).toHaveBeenCalledWith("mysong_subbed.mp4", undefined);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
describe("LB-3 — clean state", () => {
  it("LB-3a — shows 'No issues found' and the validated summary", async () => {
    setup({ lint: [] });
    await screen.findByText(/no issues found/i);
    expect(screen.getByText(/363 words · 41 events validated/i)).toBeInTheDocument();
  });

  it("LB-3b — Burn is enabled and footer says all checks passed", async () => {
    setup({ lint: [] });
    await screen.findByText(/no issues found/i);
    expect(burnBtn()).toBeEnabled();
    expect(screen.getByText(/all checks passed/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
describe("LB-4 — jump affordance", () => {
  it("LB-4a — 'Jump to cue' fires onJump with the word_id and time", async () => {
    const onJump = vi.fn();
    setup({ lint: [overlap], onJump });
    await screen.findByText(/two animations overlap/i);
    fireEvent.click(screen.getByRole("button", { name: /jump to cue/i }));
    expect(onJump).toHaveBeenCalledWith(3, 1.4);
  });

  it("LB-4b — advisory clamped row also jumps to its word", async () => {
    const onJump = vi.fn();
    setup({ lint: [clamped], onJump });
    await screen.findByText(/trigger clamped/i);
    fireEvent.click(screen.getByRole("button", { name: /jump to cue/i }));
    expect(onJump).toHaveBeenCalledWith(7, 2.5);
  });

  it("LB-4c — placement issue offers 'Open placement' and does not jump to a cue", async () => {
    const onJump = vi.fn();
    setup({ lint: [offCanvas], onJump });
    await screen.findByText(/off-canvas/i);
    expect(screen.getByText(/open placement/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /jump to cue/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
describe("LB-5 — re-check re-gates without reopening", () => {
  it("LB-5a — fixing the blocking issue re-enables Burn after Check", async () => {
    const lintSpy = vi.spyOn(client, "lint")
      .mockResolvedValueOnce([overlap])    // initial auto-check: blocking
      .mockResolvedValueOnce([]);          // after fix: clean
    const onBurn = vi.fn();
    render(<ExportMenu projectName="mysong" onBurn={onBurn} onClose={vi.fn()}
                       wordCount={1} eventCount={1} />);
    await screen.findByText(/two animations overlap/i);
    expect(burnBtn()).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /^check$/i }));
    await screen.findByText(/no issues found/i);
    expect(burnBtn()).toBeEnabled();
    expect(lintSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
describe("LB-6 — lint failure degrades gracefully (no gate)", () => {
  it("LB-6a — if lint rejects, Burn stays enabled and reads 'Burn video'", async () => {
    vi.spyOn(client, "lint").mockRejectedValue(new Error("no project"));
    render(<ExportMenu projectName="mysong" onBurn={vi.fn()} onClose={vi.fn()} />);
    const b = await screen.findByRole("button", { name: /burn video/i });
    expect(b).toBeEnabled();
  });
});
