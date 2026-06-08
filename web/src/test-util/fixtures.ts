// test-util/fixtures.ts — composable Project fixture builders for audit tests.
// The base fixture is rich enough for every interaction: 2 groups, the first
// with 2 lines (4 + 3 single-word tokens), the second with 1 line of 2 tokens,
// distinct timings so selection/merge/timeline tests all have material.
//
// Animations model: the legacy fin_tags/fout_tags/group.fade/globals.fade_*_ms/
// accumulate are GONE. Carriers are globals.animations / layout[gi].animations +
// suppress / anim_tags (test design §1.2).
import type { Project, GlobalStyle, Placement, LayoutGroup, Animation, AnimTag } from "../types";
import { fadeInAnim, fadeOutAnim, anim, seg, time } from "../model/animPresets";

export const GLOBAL_STYLE: GlobalStyle = {
  font: "Space Grotesk", fontsize: 64, bold: true, primary: "#FFFFFF", outline: "#000000",
  back: "#000000", back_alpha: "80", outline_w: 3, shadow: 0, border_style: 1, align: 2,
};

export const PLACEMENT: Placement = {
  align: 2, play_w: 1920, play_h: 1080, margin_l: 80, margin_r: 80, margin_v: 60,
  pos: null, use_pos: true,
};

// shared anim literal builders (re-exported so tests can author records)
export { anim, seg, time };

const tok = (id: number) => ({ ids: [id], sep: "", del: false, style: {} });

function ev(label: string, lines: number[][]): LayoutGroup {
  return {
    label, win_start: null, win_end: null, linger: null,
    del: false, style: {}, animations: [], suppress: [],
    lines: lines.map((ids) => ({ toks: ids.map(tok) })),
  };
}

/** 2 groups; group 0 = "Verse 1" with lines [0..3] and [4..6]; group 1 = "Chorus" with [7,8]. */
export function baseProject(): Project {
  const texts = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india"];
  return {
    words: texts.map((text, i) => ({ text, start: 0.5 + i, end: 1.2 + i })),
    layout: [ev("Verse 1", [[0, 1, 2, 3], [4, 5, 6]]), ev("Chorus", [[7, 8]])],
    anim_tags: [],
    globals: { linger: 0, animations: [] },
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

// ── withAnimations(p, spec) — the headline builder (test design §1.2-1.3) ────
// spec keys (all optional):
//   global:   Animation[]            -> p.globals.animations
//   group:    {gi: Animation[]}      -> p.layout[gi].animations
//   suppress: {gi: anim_id[]}        -> p.layout[gi].suppress
//   tags:     AnimTag[]              -> p.anim_tags
export interface AnimSpec {
  global?: Animation[];
  group?: Record<number, Animation[]>;
  suppress?: Record<number, string[]>;
  tags?: AnimTag[];
}
export function withAnimations(p: Project, spec: AnimSpec): Project {
  return mutate(p, (d) => {
    if (spec.global) d.globals.animations = JSON.parse(JSON.stringify(spec.global));
    for (const [gi, anims] of Object.entries(spec.group ?? {})) {
      d.layout[Number(gi)].animations = JSON.parse(JSON.stringify(anims));
    }
    for (const [gi, ids] of Object.entries(spec.suppress ?? {})) {
      d.layout[Number(gi)].suppress = [...ids];
    }
    if (spec.tags) d.anim_tags = JSON.parse(JSON.stringify(spec.tags));
  });
}

/**
 * Animations-based replacement for the legacy withFadeTags: words 0-3 carry a
 * fade_in preset (auto trigger), words 4-6 carry a fade_out preset. Mirrors the
 * old fin/fout-tag membership the audit tests asserted, now via anim_tags.
 */
export const withFadeAnims = (p: Project): Project =>
  withAnimations(p, {
    tags: [
      { ids: [0, 1, 2, 3], anims: [fadeInAnim("a1")], suppress: [] },
      { ids: [4, 5, 6], anims: [fadeOutAnim("a2")], suppress: [] },
    ],
  });

// ── withResolved — attach per-cue resolved animation lists ───────────────────
// The daemon fills tok.anims_resolved (flat per-cue list the strips consume).
// This builder lets audit tests place resolved lists on a cue keyed by its lead
// word id, without re-deriving anchors. Shape mirrors engine.anim.resolve_animations:
//   ResolvedAnim = {id,name,channel,group_id,segments:[{start_s,end_s,...}],src,warning}
import type { ResolvedAnim } from "../types";

/** Build a ResolvedAnim with one segment over [start_s, end_s]. */
export function resolved(
  p: Partial<ResolvedAnim> & { id: string; channel: ResolvedAnim["channel"] },
  start_s: number,
  end_s: number,
): ResolvedAnim {
  return {
    id: p.id,
    name: p.name ?? "custom",
    group_id: p.group_id ?? null,
    channel: p.channel,
    segments: p.segments ?? [{ start_s, end_s, from: null, to: 1, accel: 1 }],
    src: p.src ?? "tag",
    warning: p.warning ?? null,
  };
}

/** Attach a resolved animation list to the cue whose lead word id is `wid`. */
export function withResolved(p: Project, byWid: Record<number, ResolvedAnim[]>): Project {
  return mutate(p, (d) => {
    for (const g of d.layout) {
      for (const ln of g.lines) {
        for (const tok of ln.toks) {
          const list = byWid[tok.ids[0]];
          if (list) tok.anims_resolved = JSON.parse(JSON.stringify(list));
        }
      }
    }
  });
}

export const withPos = (p: Project, pos: [number, number] = [960, 540]): Project =>
  mutate(p, (d) => { d.placement.pos = pos; d.placement.use_pos = true; });

export const withVideo = (
  p: Project,
  path = "/abs/clip.mp4",
  meta: { w?: number | null; h?: number | null; duration_s?: number | null } = {},
): Project =>
  mutate(p, (d) => {
    d.video = {
      path,
      w: meta.w ?? 1920,
      h: meta.h ?? 1080,
      duration_s: meta.duration_s ?? 42.18,
    };
  });

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
