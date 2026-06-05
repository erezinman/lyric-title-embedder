// test-util/fixtures.ts — composable Project fixture builders for audit tests.
// The base fixture is rich enough for every interaction: 2 groups, the first
// with 2 lines (4 + 3 single-word tokens), the second with 1 line of 2 tokens,
// distinct timings so selection/merge/timeline/fade tests all have material.
import type { Project, GlobalStyle, Placement, LayoutGroup } from "../types";

export const GLOBAL_STYLE: GlobalStyle = {
  font: "Space Grotesk", fontsize: 64, bold: true, primary: "#FFFFFF", outline: "#000000",
  back: "#000000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2,
};

export const PLACEMENT: Placement = {
  align: 2, play_w: 1920, play_h: 1080, margin_l: 80, margin_r: 80, margin_v: 60,
  pos: null, use_pos: true,
};

const tok = (id: number) => ({ ids: [id], sep: "", del: false, style: {} });

function ev(label: string, lines: number[][]): LayoutGroup {
  return {
    label, accumulate: "words", win_start: null, win_end: null, linger: null,
    del: false, style: {}, fade: {},
    lines: lines.map((ids) => ({ toks: ids.map(tok) })),
  };
}

/** 2 groups; group 0 = "Verse 1" with lines [0..3] and [4..6]; group 1 = "Chorus" with [7,8]. */
export function baseProject(): Project {
  const texts = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india"];
  return {
    words: texts.map((text, i) => ({ text, start: 0.5 + i, end: 1.2 + i })),
    layout: [ev("Verse 1", [[0, 1, 2, 3], [4, 5, 6]]), ev("Chorus", [[7, 8]])],
    fin_tags: [], fout_tags: [],
    globals: { fade_in_ms: 250, fade_out_ms: 1000, linger: 0 },
    global_style: { ...GLOBAL_STYLE },
    placement: { ...PLACEMENT },
    video: null,
  };
}

/** Deep-clone + apply a mutator — for building "expected next state" echoes. */
export function mutate(p: Project, fn: (draft: Project) => void): Project {
  const next = JSON.parse(JSON.stringify(p)) as Project;
  fn(next);
  return next;
}

export const withFadeTags = (p: Project): Project =>
  mutate(p, (d) => {
    d.fin_tags = [{ ids: [0, 1, 2, 3], trigger: null }];
    d.fout_tags = [{ ids: [4, 5, 6], trigger: 2.5 }];
  });

export const withPos = (p: Project, pos: [number, number] = [960, 540]): Project =>
  mutate(p, (d) => { d.placement.pos = pos; d.placement.use_pos = true; });

export const withVideo = (p: Project, path = "/abs/clip.mp4"): Project =>
  mutate(p, (d) => { d.video = path; });

export const withMergedTok = (p: Project): Project =>
  mutate(p, (d) => {
    // merge words 0+1 into one token on line 0 of group 0
    d.layout[0].lines[0].toks = [
      { ids: [0, 1], sep: " ", del: false, style: {} },
      tok(2), tok(3),
    ];
  });

export const withGroupStyle = (p: Project, gi: number, style: Record<string, unknown>): Project =>
  mutate(p, (d) => { d.layout[gi].style = { ...d.layout[gi].style, ...style }; });

export const withCueStyle = (p: Project, gi: number, li: number, ti: number, style: Record<string, unknown>): Project =>
  mutate(p, (d) => { d.layout[gi].lines[li].toks[ti].style = { ...style }; });
