import type { Project, Token } from "../types";

export interface TimeUpdate { wid: number; start: number; end: number; }

export function cueSpan(project: Project, tok: Token): { start: number; end: number } {
  const ws = tok.ids.map((id) => project.words[id]);
  return { start: Math.min(...ws.map((w) => w.start)), end: Math.max(...ws.map((w) => w.end)) };
}

export function computeMove(project: Project, toks: Token[], dt: number): TimeUpdate[] {
  const wids = toks.flatMap((t) => t.ids);
  const minStart = Math.min(...wids.map((id) => project.words[id].start));
  const d = Math.max(dt, -minStart);
  return wids.map((id) => ({ wid: id, start: project.words[id].start + d, end: project.words[id].end + d }));
}

export function computeResize(project: Project, tok: Token, edge: "start" | "end", dt: number, minSpan = 0.05): TimeUpdate[] {
  const span = cueSpan(project, tok);
  if (edge === "start") {
    const id = tok.ids.reduce((a, b) => (project.words[a].start <= project.words[b].start ? a : b));
    const wEnd = project.words[id].end;
    const ns = Math.max(0, Math.min(span.start + dt, wEnd - minSpan));
    return [{ wid: id, start: ns, end: wEnd }];
  }
  const id = tok.ids.reduce((a, b) => (project.words[a].end >= project.words[b].end ? a : b));
  const wStart = project.words[id].start;
  const ne = Math.max(wStart + minSpan, span.end + dt);
  return [{ wid: id, start: wStart, end: ne }];
}

export function dragMode(localX: number, width: number, edge = 6): "resize-start" | "resize-end" | "move" {
  if (width < 22) return "move";
  if (localX <= edge) return "resize-start";
  if (localX >= width - edge) return "resize-end";
  return "move";
}
