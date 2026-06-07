import { STYLE_KEYS, type Project, type Token, type StyleKey } from "../types";

export interface ResolvedStyleEntry { value: unknown; src: "cue" | "group" | "global"; }
export type ResolvedStyle = Record<StyleKey, ResolvedStyleEntry>;

export function resolveStyle(project: Project, gi: number, tok: Token | null): ResolvedStyle {
  const g = project.layout[gi];
  const out = {} as ResolvedStyle;
  for (const k of STYLE_KEYS) {
    const cue = tok?.style as Record<string, unknown> | undefined;
    const grp = g?.style as Record<string, unknown> | undefined;
    if (k !== "border_style" && cue && cue[k] != null) out[k] = { value: cue[k], src: "cue" };
    else if (grp && grp[k] != null) out[k] = { value: grp[k], src: "group" };
    else out[k] = { value: project.global_style[k], src: "global" };
  }
  return out;
}

function liveWids(project: Project, gi: number): number[] {
  return project.layout[gi].lines.flatMap((l) => l.toks.filter((t) => !t.del).flatMap((t) => t.ids));
}

export function eventWindow(project: Project, gi: number): [number, number, number] {
  const g = project.layout[gi];
  const wids = liveWids(project, gi);
  const ws = wids.map((id) => project.words[id]).filter(Boolean);
  const linger = g.linger != null ? g.linger : project.globals.linger;
  const s = g.win_start != null ? g.win_start : (ws.length ? Math.min(...ws.map((w) => w.start)) : 0);
  const e = g.win_end != null ? g.win_end : (ws.length ? Math.max(...ws.map((w) => w.end)) + linger : 0);
  return [s, e, linger];
}

// ── fade membership derived from anim_tags (animations model) ────────────────
// The legacy fin_tags/fout_tags are gone; fade-in/fade-out are now alpha animations
// named "fade_in"/"fade_out" carried on an anim_tag covering the word.
function fadeTagFor(project: Project, kind: "in" | "out", wid: number): { ids: number[] } | null {
  const name = kind === "in" ? "fade_in" : "fade_out";
  for (const t of project.anim_tags ?? []) {
    if (t.ids.includes(wid) && t.anims.some((a) => a.name === name)) return { ids: t.ids };
  }
  return null;
}

export interface WordSched {
  start_s: number; fout_at: number | null;
  inFin: boolean; inFout: boolean;
}

export function wordSchedule(project: Project, _gi: number, wid: number): WordSched {
  const w = project.words[wid];
  // Per-cue appearance (accumulate is gone): the cue appears at its own word start.
  const start_s = w.start;
  const inFin = !!fadeTagFor(project, "in", wid);
  const fout = fadeTagFor(project, "out", wid);
  // fade-out anchors to cue_end (the word's end) in the animations model.
  const fout_at = fout ? w.end : null;
  return { start_s, fout_at, inFin, inFout: !!fout };
}
