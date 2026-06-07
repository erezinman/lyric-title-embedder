/**
 * snap.ts — pure timeline magnet engine.
 *
 * Edges (in seconds) magnetize to candidate times: neighbour block edges, the
 * playhead, event/group boundaries, optional animation-strip edges, and the
 * track start/end. All distances are expressed in *pixels* (so the pull feels
 * the same at any horizontal zoom) and converted to seconds via `pxPerSec`.
 *
 * Ported near-verbatim from the kit prototype (stage.jsx snapEdge/nearLines and
 * tl-anim.js snapCandidates), restructured into a typed, side-effect-free API.
 */

export const SNAP_PX = 9; // pull distance — sticky but not grabby
export const REVEAL_PX = 40; // candidate lines fade in within this distance

export type SnapKind = "edge" | "playhead" | "event" | "block" | "anim";

export interface SnapTarget {
  sec: number;
  kind: SnapKind;
}

export interface NearLine {
  sec: number;
  kind: SnapKind;
  opacity: number; // 0..1, scales with proximity (1 = right on the target)
}

export interface SnapResult {
  sec: number; // the (possibly snapped) value
  target: SnapTarget | null; // the locked candidate, if any
  nearLines: NearLine[]; // soft-preview candidates within REVEAL_PX
}

export interface SnapOpts {
  enabled: boolean; // magnet on?
  altHeld: boolean; // Alt momentarily inverts the current mode
}

interface Bounds {
  start: number;
  end: number;
}

interface SecSpan {
  s: number;
  e: number;
}

/**
 * Collect every candidate snap time on the track.
 *
 * @param blocks       word blocks (their start/end become 'block' targets)
 * @param playhead     current time (a 'playhead' target)
 * @param eventBounds  event/group spans (start+end become 'event' targets)
 * @param trackBounds  track start/end (the [0, dur] 'edge' targets)
 * @param exclude      block wids to skip (so a dragged edge never snaps to itself)
 * @param includePlayhead drop the playhead target when false (e.g. scrubbing)
 * @param strips       optional animation strip spans ('anim' targets)
 */
export function collectTargets(
  blocks: { wid: number; s: number; e: number }[],
  playhead: number,
  eventBounds: SecSpan[],
  trackBounds: Bounds,
  exclude?: Set<number>,
  includePlayhead = true,
  strips?: SecSpan[],
): SnapTarget[] {
  const out: SnapTarget[] = [
    { sec: trackBounds.start, kind: "edge" },
    { sec: trackBounds.end, kind: "edge" },
  ];
  if (includePlayhead) out.push({ sec: playhead, kind: "playhead" });
  for (const b of eventBounds) {
    out.push({ sec: b.s, kind: "event" }, { sec: b.e, kind: "event" });
  }
  for (const b of blocks) {
    if (exclude?.has(b.wid)) continue;
    out.push({ sec: b.s, kind: "block" }, { sec: b.e, kind: "block" });
  }
  if (strips) {
    for (const s of strips) out.push({ sec: s.s, kind: "anim" }, { sec: s.e, kind: "anim" });
  }
  return out;
}

/** Effective magnet state: Alt inverts whatever the toggle says. */
const isOn = (opts: SnapOpts) => opts.enabled !== opts.altHeld;

/**
 * Snap a pointer time to the nearest in-range candidate.
 * Returns the snapped value, the locked target (or null), and the soft-preview
 * near-lines. When the magnet is (effectively) off, this is a passthrough with
 * an empty nearLines list.
 */
export function snap(
  pointerSec: number,
  targets: SnapTarget[],
  pxPerSec: number,
  opts: SnapOpts,
): SnapResult {
  if (!isOn(opts)) return { sec: pointerSec, target: null, nearLines: [] };

  const tol = SNAP_PX / pxPerSec;
  let hit: SnapTarget | null = null;
  let best = tol + 1e-9;
  for (const c of targets) {
    const d = Math.abs(c.sec - pointerSec);
    if (d <= best) {
      best = d;
      hit = c;
    }
  }

  const reveal = REVEAL_PX / pxPerSec;
  const seen = new Set<string>();
  const nearLines: NearLine[] = [];
  for (const c of targets) {
    const d = Math.abs(c.sec - pointerSec);
    if (d > reveal) continue;
    const k = c.sec.toFixed(4);
    if (seen.has(k)) continue;
    seen.add(k);
    nearLines.push({ sec: c.sec, kind: c.kind, opacity: Math.max(0, 1 - d / reveal) });
  }

  return { sec: hit ? hit.sec : pointerSec, target: hit, nearLines };
}

/**
 * Zoom anchored on the playhead: compute the new scrollLeft that keeps the
 * playhead at the same on-screen x after a pxPerSec change. If the playhead is
 * currently off-screen, re-pin it to the viewport center.
 *
 * Ported from tl-anim.js zoom handler.
 */
export function zoomAnchorScroll(
  oldPxPerSec: number,
  newPxPerSec: number,
  playheadSec: number,
  scrollLeft: number,
  viewportW: number,
): number {
  let anchor = playheadSec * oldPxPerSec - scrollLeft; // playhead's current screen x
  if (anchor < 0 || anchor > viewportW) anchor = viewportW / 2; // off-screen → center
  return Math.max(0, playheadSec * newPxPerSec - anchor);
}
