/**
 * ExternalSync.audit.test.tsx — Cluster F interaction audit.
 * Tests ID prefix: F-01 …
 *
 * Theme: every async WebSocket state push (the MCP-agent edit path) must render
 * correctly in the UI with ZERO UI interaction. Each test boots the Editor,
 * emits baseProject(), captures a UI surface, emits a mutated push (NO clicks
 * that cause the mutation), asserts the surface updated, then emits baseline
 * again and asserts it reverted.
 *
 * A handful of tests perform ONE click solely to make a surface visible
 * (switch dock/rail tab, select a group header). That click never causes the
 * mutation under test — the mutation always arrives via emitState. Such cases
 * are annotated `// VIS-CLICK`.
 *
 * Describe blocks are organized BY MCP TOOL NAME (mcp_server/tools.py).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "./Editor";
import { setupFakeWS, FakeWS } from "../test-util/fakews";
import { mockApi, emitState } from "../test-util/dispatch";
import {
  baseProject, mutate, withFadeAnims, withPos, withVideo,
  withMergedTok, withGroupStyle, withCueStyle,
} from "../test-util/fixtures";
import type { Project } from "../types";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
beforeEach(() => {
  FakeWS.last = null;
  setupFakeWS();
  mockApi();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Boot Editor, wait for WS, emit baseProject, wait for "Verse 1" to render. */
async function boot(initial: Project = baseProject()) {
  const utils = render(<Editor projectName="audit" onHome={() => {}} />);
  await waitFor(() => expect(FakeWS.last).toBeTruthy());
  emitState(initial);
  await waitFor(() => expect(screen.getAllByText("Verse 1").length).toBeGreaterThan(0));
  return utils;
}

/** Emit a burn-progress message exactly as useProjectStore expects it. */
function emitBurn(job: { frac: number; done: boolean; ok: boolean; err: string | null; out: string }) {
  act(() => { FakeWS.last!.emit({ type: "burn", job }); });
}

/** The .cap word spans (live preview captions). */
function capSpans(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll(".cap .w")] as HTMLElement[];
}
/** Find the .cap word span whose text === word. */
function capWord(container: HTMLElement, word: string): HTMLElement | undefined {
  return capSpans(container).find((s) => s.textContent === word);
}
/** Find the lane-row containing the given (visible) word text. */
function laneRow(container: HTMLElement, word: string): HTMLElement | undefined {
  return [...container.querySelectorAll(".lane-row")].find(
    (r) => r.textContent?.includes(word),
  ) as HTMLElement | undefined;
}
/** Switch the side rail to the Inspector tab (VIS-CLICK helper). */
async function openInspector(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Inspector/i }));
}
/** Select the Verse 1 group header in the lanes (VIS-CLICK helper). */
async function selectVerse1Header(user: ReturnType<typeof userEvent.setup>) {
  const els = screen.getAllByText("Verse 1");
  const laneEvt = els.find((el) => el.closest(".lane-evt"));
  await user.click((laneEvt?.closest(".lane-evt") ?? els[0]) as HTMLElement);
}

// ===========================================================================
// set_globals
// ===========================================================================
describe("set_globals", () => {
  it("F-01 — align change updates the Project-tab AlignGrid label", async () => {
    const { container } = await boot();
    // Project tab is default; AlignGrid button shows the current alignment.
    const grid = () => container.querySelector(".ag-wrap .kit-sel") as HTMLElement;
    expect(grid().textContent).toMatch(/Bottom-Center \(2\)/);

    emitState(mutate(baseProject(), (d) => { d.placement.align = 7; }));
    await waitFor(() => expect(grid().textContent).toMatch(/Top-Left \(7\)/));

    emitState(baseProject());
    await waitFor(() => expect(grid().textContent).toMatch(/Bottom-Center \(2\)/));
  });

  it("F-02 — margin change moves the .bbox inline style (left/width %)", async () => {
    const { container } = await boot();
    const bbox = () => container.querySelector(".bbox") as HTMLElement;
    const left0 = bbox().style.left;
    expect(left0).toBeTruthy();

    // margin_l 80 -> 400 widens the left margin (left % grows)
    emitState(mutate(baseProject(), (d) => { d.placement.margin_l = 400; }));
    await waitFor(() => {
      const left = parseFloat(bbox().style.left);
      expect(left).toBeGreaterThan(parseFloat(left0));
    });

    emitState(baseProject());
    await waitFor(() => expect(bbox().style.left).toBe(left0));
  });

  it("F-03 — margin_v change moves the .cap caption vertical position", async () => {
    const { container } = await boot();
    const cap = () => container.querySelector(".cap") as HTMLElement;
    const bottom0 = cap().style.bottom; // align 2 => bottom anchored

    emitState(mutate(baseProject(), (d) => { d.placement.margin_v = 300; }));
    await waitFor(() => expect(cap().style.bottom).not.toBe(bottom0));

    emitState(baseProject());
    await waitFor(() => expect(cap().style.bottom).toBe(bottom0));
  });

  it("F-04 — pos + use_pos push renders .pinbox and removes .bbox", async () => {
    const { container } = await boot();
    expect(container.querySelector(".bbox")).toBeTruthy();
    expect(container.querySelector(".pinbox")).toBeNull();

    emitState(withPos(baseProject(), [960, 540]));
    await waitFor(() => {
      expect(container.querySelector(".pinbox")).toBeTruthy();
      expect(container.querySelector(".bbox")).toBeNull();
    });

    emitState(baseProject());
    await waitFor(() => {
      expect(container.querySelector(".bbox")).toBeTruthy();
      expect(container.querySelector(".pinbox")).toBeNull();
    });
  });

  it("F-05 — global fontsize override shows in the GLOBAL tier Size row", async () => {
    const user = userEvent.setup();
    const { container } = await boot();
    await openInspector(user); // VIS-CLICK: reveal StyleWaterfall

    const globalTier = () => container.querySelector(".tier3.global") as HTMLElement;
    expect(within(globalTier()).getByText(/64 px/)).toBeTruthy();

    emitState(mutate(baseProject(), (d) => { d.global_style.fontsize = 96; }));
    await waitFor(() => expect(within(globalTier()).getByText(/96 px/)).toBeTruthy());

    emitState(baseProject());
    await waitFor(() => expect(within(globalTier()).getByText(/64 px/)).toBeTruthy());
  });

  it("F-06 — global primary color push updates the Fill ColorPicker field value", async () => {
    // Log: color rows are now ColorPicker fields (the inline .sw-dot row is gone).
    // The pushed primary surfaces as the field's hex value in the GLOBAL tier.
    const user = userEvent.setup();
    const { container } = await boot();
    await openInspector(user); // VIS-CLICK

    const globalTier = () => container.querySelector(".tier3.global") as HTMLElement;
    const fillFieldVal = () => {
      const fillRow = [...globalTier().querySelectorAll(".prow")]
        .find((r) => r.querySelector(".pl")?.textContent === "Fill") as HTMLElement;
      return (fillRow.querySelector(".ksp-field-val") as HTMLElement).textContent;
    };
    // global primary starts white
    expect(fillFieldVal()).toBe("#FFFFFF");

    emitState(mutate(baseProject(), (d) => { d.global_style.primary = "#FF3DA6"; }));
    await waitFor(() => expect(fillFieldVal()).toBe("#FF3DA6"));

    emitState(baseProject());
    await waitFor(() => expect(fillFieldVal()).toBe("#FFFFFF"));
  });
});

// ===========================================================================
// set_group_style
// ===========================================================================
describe("set_group_style", () => {
  it("F-07 — group fontsize override scales caption fontSize on that group's words", async () => {
    const { container } = await boot();
    // baseline: no scale on caption words
    const alpha = () => capWord(container, "alpha")!;
    expect(alpha().style.fontSize).toBe("");

    emitState(withGroupStyle(baseProject(), 0, { fontsize: 128 }));
    await waitFor(() => expect(capWord(container, "alpha")!.style.fontSize).toBe("2em")); // 128/64

    emitState(baseProject());
    await waitFor(() => expect(capWord(container, "alpha")!.style.fontSize).toBe(""));
  });

  it("F-08 — group bold override sets caption fontWeight on that group's words", async () => {
    const { container } = await boot();
    // global bold is true, group has no override -> caption bold is null (no inline weight)
    expect(capWord(container, "alpha")!.style.fontWeight).toBe("");

    emitState(withGroupStyle(baseProject(), 0, { bold: false }));
    await waitFor(() => expect(capWord(container, "alpha")!.style.fontWeight).toBe("400"));

    emitState(baseProject());
    await waitFor(() => expect(capWord(container, "alpha")!.style.fontWeight).toBe(""));
  });

  it("F-08i — group italic override sets caption fontStyle on that group's words", async () => {
    const { container } = await boot();
    expect(capWord(container, "alpha")!.style.fontStyle).toBe("");

    emitState(withGroupStyle(baseProject(), 0, { italic: true }));
    await waitFor(() => expect(capWord(container, "alpha")!.style.fontStyle).toBe("italic"));

    emitState(baseProject());
    await waitFor(() => expect(capWord(container, "alpha")!.style.fontStyle).toBe(""));
  });

  it("F-08u — group underline override sets caption textDecoration on that group's words", async () => {
    const { container } = await boot();
    expect(capWord(container, "alpha")!.style.textDecoration).toBe("");

    emitState(withGroupStyle(baseProject(), 0, { underline: true }));
    await waitFor(() => expect(capWord(container, "alpha")!.style.textDecoration).toBe("underline"));

    emitState(baseProject());
    await waitFor(() => expect(capWord(container, "alpha")!.style.textDecoration).toBe(""));
  });

  it("F-09 — group primary override sets caption color on that group's words", async () => {
    const { container } = await boot();
    expect(capWord(container, "alpha")!.style.color).toBe("");

    emitState(withGroupStyle(baseProject(), 0, { primary: "#3DE0FF" }));
    await waitFor(() => expect(capWord(container, "alpha")!.style.color).not.toBe(""));

    emitState(baseProject());
    await waitFor(() => expect(capWord(container, "alpha")!.style.color).toBe(""));
  });

  it("F-10 — group style override shows in the GROUP tier Size row (overridden)", async () => {
    const user = userEvent.setup();
    const { container } = await boot();
    await openInspector(user); // VIS-CLICK

    const groupTier = () => container.querySelector(".tier3.group") as HTMLElement;
    // before override the Size row is inherited
    const sizeRow0 = within(groupTier()).getByText("Size").closest(".prow")!;
    expect(sizeRow0.classList.contains("over")).toBe(false);

    emitState(withGroupStyle(baseProject(), 0, { fontsize: 100 }));
    await waitFor(() => {
      const row = within(container.querySelector(".tier3.group") as HTMLElement)
        .getByText("Size").closest(".prow")!;
      expect(row.classList.contains("over")).toBe(true);
      expect(within(row as HTMLElement).getByText(/100 px/)).toBeTruthy();
    });

    emitState(baseProject());
    await waitFor(() => {
      const row = within(container.querySelector(".tier3.group") as HTMLElement)
        .getByText("Size").closest(".prow")!;
      expect(row.classList.contains("over")).toBe(false);
    });
  });
});

// ===========================================================================
// set_cue_style
// ===========================================================================
describe("set_cue_style", () => {
  it("F-11 — cue fontsize on ONE token scales only that caption word", async () => {
    const { container } = await boot();
    expect(capWord(container, "alpha")!.style.fontSize).toBe("");
    expect(capWord(container, "bravo")!.style.fontSize).toBe("");

    // alpha is gi0,li0,ti0
    emitState(withCueStyle(baseProject(), 0, 0, 0, { fontsize: 96 }));
    await waitFor(() => expect(capWord(container, "alpha")!.style.fontSize).toBe("1.5em"));
    // neighbour unchanged
    expect(capWord(container, "bravo")!.style.fontSize).toBe("");

    emitState(baseProject());
    await waitFor(() => expect(capWord(container, "alpha")!.style.fontSize).toBe(""));
  });

  it("F-12 — cue bold on ONE token sets only that caption word's fontWeight", async () => {
    const { container } = await boot();
    expect(capWord(container, "alpha")!.style.fontWeight).toBe("");

    emitState(withCueStyle(baseProject(), 0, 0, 0, { bold: false }));
    await waitFor(() => expect(capWord(container, "alpha")!.style.fontWeight).toBe("400"));
    expect(capWord(container, "bravo")!.style.fontWeight).toBe("");

    emitState(baseProject());
    await waitFor(() => expect(capWord(container, "alpha")!.style.fontWeight).toBe(""));
  });

  it("F-12i — cue italic on ONE token sets only that caption word's fontStyle", async () => {
    const { container } = await boot();
    expect(capWord(container, "alpha")!.style.fontStyle).toBe("");

    emitState(withCueStyle(baseProject(), 0, 0, 0, { italic: true }));
    await waitFor(() => expect(capWord(container, "alpha")!.style.fontStyle).toBe("italic"));
    expect(capWord(container, "bravo")!.style.fontStyle).toBe("");

    emitState(baseProject());
    await waitFor(() => expect(capWord(container, "alpha")!.style.fontStyle).toBe(""));
  });

  it("F-12u — cue underline on ONE token sets only that caption word's textDecoration", async () => {
    const { container } = await boot();
    expect(capWord(container, "alpha")!.style.textDecoration).toBe("");

    emitState(withCueStyle(baseProject(), 0, 0, 0, { underline: true }));
    await waitFor(() => expect(capWord(container, "alpha")!.style.textDecoration).toBe("underline"));
    expect(capWord(container, "bravo")!.style.textDecoration).toBe("");

    emitState(baseProject());
    await waitFor(() => expect(capWord(container, "alpha")!.style.textDecoration).toBe(""));
  });

  it("F-13 — cue primary on ONE token sets only that caption word's color", async () => {
    const { container } = await boot();
    expect(capWord(container, "alpha")!.style.color).toBe("");

    emitState(withCueStyle(baseProject(), 0, 0, 0, { primary: "#FFC24D" }));
    await waitFor(() => expect(capWord(container, "alpha")!.style.color).not.toBe(""));
    expect(capWord(container, "bravo")!.style.color).toBe("");

    emitState(baseProject());
    await waitFor(() => expect(capWord(container, "alpha")!.style.color).toBe(""));
  });
});

// ===========================================================================
// add_animation / remove_animation (fade preset, anim_tags) — lane FADE columns
// The set_group_fade / set_fade_defaults / set_fade_tag_props tools and their
// FadeDefaultsPanel / FadeGroupPanel / GROUP-tier fade-row surfaces were removed
// with the animations migration; F-14..F-17, F-21, F-22 were deleted (coverage
// returns in the AI/AM phases). The lane FADE columns now derive from anim_tags.
// ===========================================================================
// Redesign (zip 11): fades are no longer privileged FADE columns — they're ordinary
// channel chips in the single ANIMATION lane (own = .achip.own, sourced from cueRows).
// These assert the same external-sync semantics against the new chip surface.
const animCell = (container: HTMLElement, word: string): HTMLElement =>
  laneRow(container, word)!.querySelector(".lc.anim") as HTMLElement;
const hasChip = (container: HTMLElement, word: string, re: RegExp): boolean =>
  [...animCell(container, word).querySelectorAll(".achip")].some((c) => re.test(c.textContent || ""));

describe("add_animation (fade preset, pushed)", () => {
  it("F-18 — pushing a fade_in anim_tag adds an own 'fade in' chip to the ANIMATION lane", async () => {
    const { container } = await boot();
    expect(hasChip(container, "alpha", /fade in/i)).toBe(false);

    emitState(withFadeAnims(baseProject()));
    await waitFor(() => expect(hasChip(container, "alpha", /fade in/i)).toBe(true));

    emitState(baseProject());
    await waitFor(() => expect(hasChip(container, "alpha", /fade in/i)).toBe(false));
  });

  it("F-19 — the ANIMATION lane shows '· none' until a fade_out anim_tag is pushed", async () => {
    const { container } = await boot();
    expect(animCell(container, "echo").textContent).toContain("· none");

    // withFadeAnims puts a fade_out anim on ids [4,5,6]; "echo" = word 4
    emitState(withFadeAnims(baseProject()));
    await waitFor(() => expect(hasChip(container, "echo", /fade out/i)).toBe(true));

    emitState(baseProject());
    await waitFor(() => expect(animCell(container, "echo").textContent).toContain("· none"));
  });
});

describe("remove_animation (fade preset, pushed)", () => {
  it("F-20 — removing the fade_in anim_tag removes the 'fade in' chip", async () => {
    const { container } = await boot(withFadeAnims(baseProject()));
    expect(hasChip(container, "alpha", /fade in/i)).toBe(true);

    emitState(mutate(withFadeAnims(baseProject()), (d) => { d.anim_tags = d.anim_tags.filter((t) => !t.ids.includes(0)); }));
    await waitFor(() => expect(hasChip(container, "alpha", /fade in/i)).toBe(false));

    emitState(withFadeAnims(baseProject()));
    await waitFor(() => expect(hasChip(container, "alpha", /fade in/i)).toBe(true));
  });
});

// ===========================================================================
// set_layout_props
// ===========================================================================
describe("set_layout_props", () => {
  it("F-24 — linger change updates EventStrip linger value", async () => {
    const user = userEvent.setup();
    const { container } = await boot();
    await selectVerse1Header(user); // VIS-CLICK — EventStrip only renders after explicit group selection
    await waitFor(() => expect(container.querySelector(".evt-strip")).toBeTruthy());

    const lingerV = () => container.querySelector(".evt-strip .pv-step .v") as HTMLElement;
    expect(lingerV().textContent).toBe("0.0s");

    emitState(mutate(baseProject(), (d) => { d.layout[0].linger = 2; }));
    await waitFor(() => expect(lingerV().textContent).toBe("2.0s"));

    emitState(baseProject());
    await waitFor(() => expect(lingerV().textContent).toBe("0.0s"));
  });

  it("F-26 — explicit window start updates EventStrip window note text", async () => {
    const user = userEvent.setup();
    const { container } = await boot();
    await selectVerse1Header(user); // VIS-CLICK
    await waitFor(() => expect(container.querySelector(".evt-strip")).toBeTruthy());

    const note = () => container.querySelector(".evt-strip .es-note") as HTMLElement;
    expect(note().textContent).toContain("first word");

    emitState(mutate(baseProject(), (d) => { d.layout[0].win_start = 3; }));
    await waitFor(() => expect(note().textContent).toContain("3s"));

    emitState(baseProject());
    await waitFor(() => expect(note().textContent).toContain("first word"));
  });
});

// ===========================================================================
// delete_words / restore_words  (toggle_word_del)
// ===========================================================================
describe("toggle_word_del", () => {
  it("F-27 — delete push strikes the lane row, caption omits the word; restore reverts", async () => {
    const { container } = await boot();
    // baseline: bravo present in caption + lane row not struck
    expect(capWord(container, "bravo")).toBeTruthy();
    expect(laneRow(container, "bravo")!.classList.contains("del")).toBe(false);

    emitState(mutate(baseProject(), (d) => { d.layout[0].lines[0].toks[1].del = true; }));
    await waitFor(() => {
      // caption no longer has bravo word
      expect(capWord(container, "bravo")).toBeUndefined();
      // lane row marked del with a strikethrough <s>
      const row = laneRow(container, "bravo")!;
      expect(row.classList.contains("del")).toBe(true);
      expect(row.querySelector("s")).toBeTruthy();
    });

    emitState(baseProject());
    await waitFor(() => {
      expect(capWord(container, "bravo")).toBeTruthy();
      expect(laneRow(container, "bravo")!.classList.contains("del")).toBe(false);
    });
  });
});

// ===========================================================================
// set_word_times
// ===========================================================================
describe("set_word_times", () => {
  it("F-28 — time change updates the lanes event range readout (.rng)", async () => {
    const { container } = await boot();
    const rng = () => {
      const evt = [...container.querySelectorAll(".lane-evt")].find((e) => e.textContent?.includes("Chorus"))!;
      return evt.querySelector(".rng") as HTMLElement;
    };
    // Chorus = words 7,8 — starts 7.5
    expect(rng().textContent).toContain("7.50");

    emitState(mutate(baseProject(), (d) => { d.words[7].start = 5.0; }));
    await waitFor(() => expect(rng().textContent).toContain("5.00"));

    emitState(baseProject());
    await waitFor(() => expect(rng().textContent).toContain("7.50"));
  });

  it("F-29 — time change moves a WordTrack .block left/width %", async () => {
    const user = userEvent.setup();
    const { container } = await boot();
    await user.click(screen.getByRole("button", { name: /Timeline/i })); // VIS-CLICK: show WordTrack

    const block = () => {
      const b = [...container.querySelectorAll(".block")].find(
        (el) => el.getAttribute("title")?.startsWith("alpha "),
      );
      return b as HTMLElement;
    };
    await waitFor(() => expect(block()).toBeTruthy());
    const left0 = block().style.left;

    emitState(mutate(baseProject(), (d) => { d.words[0].start = 3.0; d.words[0].end = 3.7; }));
    await waitFor(() => {
      const b = [...container.querySelectorAll(".block")].find(
        (el) => el.getAttribute("title")?.startsWith("alpha "),
      ) as HTMLElement;
      expect(parseFloat(b.style.left)).toBeGreaterThan(parseFloat(left0));
    });

    emitState(baseProject());
    await waitFor(() => {
      const b = [...container.querySelectorAll(".block")].find(
        (el) => el.getAttribute("title")?.startsWith("alpha "),
      ) as HTMLElement;
      expect(b.style.left).toBe(left0);
    });
  });
});

// ===========================================================================
// set_word_text
// ===========================================================================
describe("set_word_text", () => {
  it("F-30 — text change updates the lane row text and caption word text", async () => {
    const { container } = await boot();
    expect(laneRow(container, "alpha")).toBeTruthy();
    expect(capWord(container, "alpha")).toBeTruthy();

    emitState(mutate(baseProject(), (d) => { d.words[0].text = "ALPHAZ"; }));
    await waitFor(() => {
      expect(laneRow(container, "ALPHAZ")).toBeTruthy();
      expect(capWord(container, "ALPHAZ")).toBeTruthy();
    });
    expect(capWord(container, "alpha")).toBeUndefined();

    emitState(baseProject());
    await waitFor(() => expect(capWord(container, "alpha")).toBeTruthy());
  });
});

// ===========================================================================
// break_line / join_lines
// ===========================================================================
describe("break_line", () => {
  it("F-31 — extra break adds a 'line break · \\N' divider and a caption line", async () => {
    const { container } = await boot();
    const divCount = () => container.querySelectorAll(".lanes .line-div").length;
    const capLineCount = () => container.querySelectorAll(".cap > div").length;
    // Verse 1 has 2 lines -> 1 divider; group 1 has 1 line. total dividers = 1
    expect(divCount()).toBe(1);
    const capLines0 = capLineCount();

    // split line 0 of group 0 after ti1 (bravo) -> Verse 1 becomes 3 lines
    emitState(mutate(baseProject(), (d) => {
      const toks = d.layout[0].lines[0].toks;
      d.layout[0].lines = [
        { toks: toks.slice(0, 2) },
        { toks: toks.slice(2) },
        d.layout[0].lines[1],
      ];
    }));
    await waitFor(() => expect(divCount()).toBe(2));
    expect(capLineCount()).toBeGreaterThan(capLines0);

    emitState(baseProject());
    await waitFor(() => expect(divCount()).toBe(1));
  });
});

describe("join_lines", () => {
  it("F-32 — joining the two Verse 1 lines removes the divider and merges caption lines", async () => {
    const { container } = await boot();
    const divCount = () => container.querySelectorAll(".lanes .line-div").length;
    expect(divCount()).toBe(1);

    emitState(mutate(baseProject(), (d) => {
      const merged = [...d.layout[0].lines[0].toks, ...d.layout[0].lines[1].toks];
      d.layout[0].lines = [{ toks: merged }];
    }));
    await waitFor(() => expect(divCount()).toBe(0));

    emitState(baseProject());
    await waitFor(() => expect(divCount()).toBe(1));
  });
});

// ===========================================================================
// merge_words / merge_word_span
// ===========================================================================
describe("merge_word_span", () => {
  it("F-33 — merging two words yields one joined lane row + caption word; revert splits", async () => {
    const { container } = await boot();
    // baseline: alpha and bravo are separate rows
    expect(laneRow(container, "alpha")).toBeTruthy();
    expect(capWord(container, "alpha")).toBeTruthy();
    expect(capWord(container, "bravo")).toBeTruthy();

    emitState(withMergedTok(baseProject())); // toks[0] = ids [0,1] sep " "
    await waitFor(() => {
      // joined caption word "alpha bravo"
      expect(capWord(container, "alpha bravo")).toBeTruthy();
      // lane row shows merged tag
      const row = [...container.querySelectorAll(".lane-row")].find((r) => r.textContent?.includes("alpha bravo"));
      expect(row).toBeTruthy();
      expect(within(row as HTMLElement).getByText("merged")).toBeTruthy();
    });
    // individual "alpha" caption span no longer exists
    expect(capWord(container, "alpha")).toBeUndefined();

    emitState(baseProject());
    await waitFor(() => {
      expect(capWord(container, "alpha")).toBeTruthy();
      expect(capWord(container, "bravo")).toBeTruthy();
      expect(capWord(container, "alpha bravo")).toBeUndefined();
    });
  });
});

// ===========================================================================
// merge_events / split_event / ungroup_event
// ===========================================================================
describe("merge_events", () => {
  it("F-34 — merging the two groups drops one .lane-evt header", async () => {
    const { container } = await boot();
    const evtCount = () => container.querySelectorAll(".lane-evt").length;
    expect(evtCount()).toBe(2);

    // merge: a single group containing both groups' lines
    emitState(mutate(baseProject(), (d) => {
      const allLines = [...d.layout[0].lines, ...d.layout[1].lines];
      d.layout = [{ ...d.layout[0], lines: allLines }];
    }));
    await waitFor(() => expect(evtCount()).toBe(1));

    emitState(baseProject());
    await waitFor(() => expect(evtCount()).toBe(2));
  });
});

describe("split_event", () => {
  it("F-35 — splitting Verse 1 into two groups adds a .lane-evt header", async () => {
    const { container } = await boot();
    const evtCount = () => container.querySelectorAll(".lane-evt").length;
    expect(evtCount()).toBe(2);

    emitState(mutate(baseProject(), (d) => {
      const g0 = d.layout[0];
      d.layout = [
        { ...g0, lines: [g0.lines[0]] },
        { ...g0, label: "Verse 1b", lines: [g0.lines[1]] },
        d.layout[1],
      ];
    }));
    await waitFor(() => expect(evtCount()).toBe(3));

    emitState(baseProject());
    await waitFor(() => expect(evtCount()).toBe(2));
  });
});

describe("ungroup_event", () => {
  it("F-36 — ungrouping reflects in WordTrack lane count", async () => {
    const user = userEvent.setup();
    const { container } = await boot();
    await user.click(screen.getByRole("button", { name: /Timeline/i })); // VIS-CLICK

    const laneCount = () => container.querySelectorAll(".wt-lane").length;
    await waitFor(() => expect(laneCount()).toBe(2));

    // ungroup Verse1 into two single-line groups -> 3 lanes
    emitState(mutate(baseProject(), (d) => {
      const g0 = d.layout[0];
      d.layout = [
        { ...g0, lines: [g0.lines[0]] },
        { ...g0, label: "Verse 1·2", lines: [g0.lines[1]] },
        d.layout[1],
      ];
    }));
    await waitFor(() => expect(laneCount()).toBe(3));

    emitState(baseProject());
    await waitFor(() => expect(laneCount()).toBe(2));
  });
});

// ===========================================================================
// set_video  (set_globals video field)
// ===========================================================================
describe("set_video", () => {
  it("F-37 — video push shows the basename in the VideoControl, Empty dropwell when cleared", async () => {
    const { container } = await boot();
    const fname = () => container.querySelector(".vc-fname") as HTMLElement | null;
    // Empty initially: no filename row, Attach button present.
    expect(fname()).toBeNull();
    expect(screen.getByRole("button", { name: /attach video/i })).toBeInTheDocument();

    emitState(withVideo(baseProject(), "/abs/clip.mp4"));
    await waitFor(() => expect(fname()?.textContent).toBe("clip.mp4"));

    emitState(baseProject());
    await waitFor(() => expect(fname()).toBeNull());
    expect(screen.getByRole("button", { name: /attach video/i })).toBeInTheDocument();
  });
});

// ===========================================================================
// Combined deep revert (external undo simulation)
// ===========================================================================
describe("combined deep revert", () => {
  it("F-38 — one push mutating words+style+layout, then baseline reverts all three surfaces", async () => {
    const { container } = await boot();
    // baseline captures
    expect(capWord(container, "alpha")!.style.fontSize).toBe("");
    // layout facet now surfaces via the lane-evt range chip's linger suffix
    const evtRng = () => {
      const evt = [...container.querySelectorAll(".lane-evt")].find((e) => e.textContent?.includes("Verse 1"))!;
      return evt.querySelector(".rng") as HTMLElement;
    };
    expect(evtRng().textContent).not.toContain("+1.5s");

    emitState(mutate(baseProject(), (d) => {
      d.words[0].text = "OMEGA";                       // words facet
      d.layout[0].style = { fontsize: 128 };           // style facet
      d.layout[0].linger = 1.5;                        // layout facet
    }));
    await waitFor(() => {
      expect(capWord(container, "OMEGA")).toBeTruthy();
      expect(capWord(container, "OMEGA")!.style.fontSize).toBe("2em");
      expect(evtRng().textContent).toContain("+1.5s");
    });

    emitState(baseProject());
    await waitFor(() => {
      expect(capWord(container, "alpha")).toBeTruthy();
      expect(capWord(container, "alpha")!.style.fontSize).toBe("");
      expect(evtRng().textContent).not.toContain("+1.5s");
      expect(capWord(container, "OMEGA")).toBeUndefined();
    });
  });
});

// ===========================================================================
// External-edit detection (toast + ai-pill)
// ===========================================================================
describe("external-edit detection", () => {
  it("F-39 — unsolicited push shows 'AI agent updated the project' toast (auto-dismiss)", async () => {
    vi.useFakeTimers();
    render(<Editor projectName="audit" onHome={() => {}} />);
    // flush the WS onopen setTimeout(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(FakeWS.last).toBeTruthy();

    act(() => { FakeWS.last!.emit({ type: "state", state: baseProject() }); });
    // toast present
    expect(screen.getByText(/AI agent updated the project/i)).toBeTruthy();

    // auto-dismiss after 3s
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(screen.queryByText(/AI agent updated the project/i)).toBeNull();
  });

  it("F-40 — push right after a UI-triggered local dispatch shows NO toast", async () => {
    // Real timers; the localUntil window is wall-clock (Date.now()+1500) and the
    // echo lands synchronously right after the click, well inside that window.
    const user = userEvent.setup();
    const { container } = await boot();

    // A local UI edit fires first (sets localUntil = now + 1500). Open the
    // Project-tab align grid and pick a cell -> store.call("set_globals", …).
    const alignBtn = container.querySelector(".ag-wrap .kit-sel") as HTMLElement;
    await user.click(alignBtn);                       // opens grid
    const cell = container.querySelector(".ag-grid .ag-cell") as HTMLElement;
    await user.click(cell);                           // dispatches set_globals (local)

    // Snapshot the existing external toast node (created by boot's first push),
    // THEN emit the echo. ExternalToast is keyed by store.lastExternal; if the
    // local edit is correctly suppressed, lastExternal stays frozen and the same
    // node persists (no remount). A broken suppression bumps lastExternal,
    // remounting a *new* node (referentially different).
    const nodeBefore = container.querySelector(".toast.ai");
    act(() => { FakeWS.last!.emit({ type: "state", state: baseProject() }); });
    const nodeAfter = container.querySelector(".toast.ai");

    // Same node identity (or both gone) => no remount => no new external toast.
    expect(nodeAfter).toBe(nodeBefore);
  });

  it("F-41 — .ai-pill shows while connected and disappears after WS close", async () => {
    const { container } = await boot();
    expect(container.querySelector(".ai-pill")).toBeTruthy();

    act(() => { FakeWS.last!.close(); });
    await waitFor(() => expect(container.querySelector(".ai-pill")).toBeNull());
  });
});

// ===========================================================================
// Burn pushes
// ===========================================================================
describe("burn pushes", () => {
  it("F-42 — burn progress message updates the progress toast text", async () => {
    await boot();
    expect(screen.queryByText(/rendering/i)).toBeNull();

    emitBurn({ frac: 0.42, done: false, ok: false, err: null, out: "o.mp4" });
    await waitFor(() => expect(screen.getByText(/rendering — 42%/i)).toBeTruthy());

    emitBurn({ frac: 0.87, done: false, ok: false, err: null, out: "o.mp4" });
    await waitFor(() => expect(screen.getByText(/rendering — 87%/i)).toBeTruthy());
  });

  it("F-43 — burn done message swaps to the done toast", async () => {
    await boot();
    emitBurn({ frac: 0.5, done: false, ok: false, err: null, out: "out.mp4" });
    await waitFor(() => expect(screen.getByText(/rendering — 50%/i)).toBeTruthy());

    emitBurn({ frac: 1, done: true, ok: true, err: null, out: "out.mp4" });
    await waitFor(() => {
      expect(screen.getByText(/done — out\.mp4/i)).toBeTruthy();
      expect(screen.queryByText(/rendering/i)).toBeNull();
    });
  });

  it("F-44 — burn error done message shows the error toast", async () => {
    await boot();
    emitBurn({ frac: 0.3, done: true, ok: false, err: "ffmpeg blew up", out: "out.mp4" });
    await waitFor(() => expect(screen.getByText(/burn error: ffmpeg blew up/i)).toBeTruthy());
  });
});
