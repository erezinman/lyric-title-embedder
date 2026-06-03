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

export function resolveFade(project: Project, gi: number): { fade_in_ms: number; fade_out_ms: number } {
  const f = project.layout[gi]?.fade ?? {};
  return {
    fade_in_ms: f.fade_in_ms != null ? f.fade_in_ms : project.globals.fade_in_ms,
    fade_out_ms: f.fade_out_ms != null ? f.fade_out_ms : project.globals.fade_out_ms,
  };
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

type FadeTagOpt = { ids: number[]; trigger: number | null } | null;
function tagFor(project: Project, kind: "in" | "out", wid: number): FadeTagOpt {
  const arr = kind === "in" ? project.fin_tags : project.fout_tags;
  return arr.find((t) => t.ids.includes(wid)) ?? null;
}

export interface WordSched {
  start_s: number; fin_ms: number; fout_at: number | null; fout_ms: number;
  inFin: boolean; inFout: boolean;
}

export function wordSchedule(project: Project, gi: number, wid: number): WordSched {
  const g = project.layout[gi];
  const [winS] = eventWindow(project, gi);
  const w = project.words[wid];
  const { fade_in_ms, fade_out_ms } = resolveFade(project, gi);

  let start_s = w.start;
  if (g.accumulate === "lines") {
    const line = g.lines.find((l) => l.toks.some((t) => t.ids.includes(wid)));
    const ids = line ? line.toks.filter((t) => !t.del).flatMap((t) => t.ids) : [wid];
    start_s = Math.min(...ids.map((id) => project.words[id].start));
  } else if (g.accumulate === "off") {
    start_s = winS;
  }

  const fin = tagFor(project, "in", wid);
  if (fin) {
    start_s = fin.trigger != null ? fin.trigger : Math.min(...fin.ids.map((id) => project.words[id].start));
  }
  const fout = tagFor(project, "out", wid);
  let fout_at: number | null = null;
  if (fout) fout_at = fout.trigger != null ? fout.trigger : Math.max(...fout.ids.map((id) => project.words[id].end));

  return { start_s, fin_ms: fade_in_ms, fout_at, fout_ms: fade_out_ms, inFin: !!fin, inFout: !!fout };
}
