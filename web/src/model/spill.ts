// web/src/model/spill.ts — structural window of a cue + OUTWARD animation spill, for
// the cue-lanes start/end sub-lanes. Web-side: anims_resolved is already the effective
// (post-inheritance, post-suppression) list with resolved segment times.
import type { ResolvedAnim, Word } from "../types";

export interface CueExtent {
  s: number; e: number;                  // structural window (word-atom min start / max end)
  animStart: number; animEnd: number;    // including animation reach
  spillBefore: boolean; spillAfter: boolean;
  beforeDelta: number; afterDelta: number;  // how far past the boundary (>=0)
}

const EPS = 1e-4;

export function cueExtent(words: Pick<Word, "start" | "end">[], animsResolved: ResolvedAnim[]): CueExtent {
  const s = Math.min(...words.map((w) => w.start));
  const e = Math.max(...words.map((w) => w.end));
  let animStart = s, animEnd = e;
  for (const a of animsResolved) {
    for (const seg of a.segments ?? []) {
      animStart = Math.min(animStart, seg.start_s, seg.end_s);
      animEnd = Math.max(animEnd, seg.start_s, seg.end_s);
    }
  }
  return {
    s, e, animStart, animEnd,
    spillBefore: animStart < s - EPS, spillAfter: animEnd > e + EPS,
    beforeDelta: Math.max(0, s - animStart), afterDelta: Math.max(0, animEnd - e),
  };
}
