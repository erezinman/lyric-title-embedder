// animStrips.ts — pure helpers for the timeline animation strips (cluster AT).
// Ports tl-anim.js (stripStyle, typeColor, typeGlyph) + the cap/overflow/glyph
// layout logic, adapted to the settled animation model: strips consume the flat
// per-cue resolved list (ResolvedAnim) the daemon fills into tok.anims_resolved.
//
// HANDOFF_animations §3: fill encodes the *visual type*, derived from the
// animation channel via typeForChannel. The prototype's `type` strings map to:
//   color  ← primary/outline/back
//   alpha  ← alpha
//   size   ← scale_x/scale_y/fontsize
//   type   ← clip_rect/karaoke_fill
//   move   ← move
//   glow   ← blur (and anything else)
import type { AnimChannel, ResolvedAnim } from "../types";

export type VisualType = "color" | "alpha" | "size" | "type" | "move" | "glow";

/** Channel → visual type (HANDOFF §3 table). */
export function typeForChannel(channel: AnimChannel): VisualType {
  switch (channel) {
    case "alpha": return "alpha";
    case "primary": return "color";
    case "scale_x":
    case "scale_y": return "size";
    case "clip_rect":
    case "karaoke_fill": return "type";
    case "move": return "move";
    case "blur": return "glow";
    default: return "glow";
  }
}

/** Representative color per visual type (overflow stripes / glyph accents). */
export function typeColor(vt: VisualType): string {
  return { color: "#FF3DA6", alpha: "#36E2FF", size: "#37E29A", type: "#8A5CF6", move: "#FFC24B", glow: "#36E2FF" }[vt];
}

/** Glyph per visual type (glyph chip + overflow). */
export function typeGlyph(vt: VisualType): string {
  return { color: "◑", alpha: "◧", size: "▲", type: "⌨", move: "→", glow: "✦" }[vt];
}

/** Time bounds of a resolved anim (min start, max end across its segments). */
export function animBounds(a: ResolvedAnim): { s: number; e: number } {
  const starts = a.segments.map((s) => s.start_s);
  const ends = a.segments.map((s) => s.end_s);
  return { s: Math.min(...starts), e: Math.max(...ends) };
}

// ── Phase 2: constant-height bars ────────────────────────────────────────────
// Ports the Strips-Refined.html prototype: bar HEIGHT is fixed (BAR_H); WIDTH
// still encodes duration. Bars stack at constant px tops; overflow past
// MAX_VISIBLE is surfaced as a count (the +N disc / overlay) rather than by
// squishing bars into a fixed band. layoutStrips above is unchanged.
export const TEXT_H = 22, BAR_H = 6, GAP = 4, PAD_B = 7, MAX_VISIBLE = 3, TINY_PX = 18;
/** Fixed cue-block height with up to MAX_VISIBLE stacked bars. */
export const BLOCK_H = TEXT_H + MAX_VISIBLE * BAR_H + (MAX_VISIBLE - 1) * GAP + PAD_B;
/** Full block height for n bars (overlay that shows every bar). */
export const fullBlockH = (n: number) => TEXT_H + n * BAR_H + (n - 1) * GAP + PAD_B;

/** Bounds for a bar. Reads the resolved start_s/end_s; tolerant of the raw
 *  t0/t1 endpoint shape so callers needn't pre-flatten. */
function barBounds(a: ResolvedAnim): { s: number; e: number } {
  const seg = a.segments as unknown as Array<{ start_s?: number; end_s?: number; t0?: number; t1?: number }>;
  const starts = seg.map((s) => s.start_s ?? s.t0 ?? 0);
  const ends = seg.map((s) => s.end_s ?? s.t1 ?? 0);
  return { s: Math.min(...starts), e: Math.max(...ends) };
}

export interface Bar {
  topPx: number;
  heightPx: number;
  leftPx: number;
  widthPx: number;
  kind: "bar" | "glyph";
  vt: VisualType;
  fill: string;
  glyph: string;
  /** size bars render as a wedge. */
  clip?: string;
  src: ResolvedAnim["src"];
  warning: string | null;
}

/** Per-type bar-fill gradient (ports prototype stripBg). `groupColor` is the
 *  cue group's representative color (the prototype's `c`); falls back to the
 *  visual type's color. The `size` wedge also needs `WEDGE_CLIP`. */
export const WEDGE_CLIP = "polygon(0 100%,100% 0,100% 100%)";
export function barFill(anim: ResolvedAnim, groupColor?: string): string {
  const vt = typeForChannel(anim.channel);
  const c = groupColor ?? typeColor(vt);
  const seg0 = anim.segments[0] as unknown as { from?: unknown; to?: unknown } | undefined;
  switch (vt) {
    case "color": {
      const from = (typeof seg0?.from === "string" && seg0.from) || "#fff";
      const to = (typeof seg0?.to === "string" && seg0.to) || c;
      return `linear-gradient(90deg, ${from}, ${to})`;
    }
    case "alpha":
      // prototype keys on dir ('out' reverses); resolved anims don't carry dir,
      // so default to the fade-in gradient.
      return `linear-gradient(90deg, ${c}00, ${c})`;
    case "size":
      return `linear-gradient(90deg, ${c}33, ${c})`;
    case "type":
      return `repeating-linear-gradient(90deg, ${c} 0 3px, ${c}33 3px 7px)`;
    case "move":
      return `linear-gradient(90deg, ${c}22, ${c})`;
    case "glow":
      return `radial-gradient(120% 180% at 60% 50%, ${c}, ${c}33 70%, ${c}11)`;
  }
}

/**
 * Constant-height bar layout for one cue's resolved anims. `cueStartS` is the
 * cue start (px origin); `pxPerSec` maps seconds → px. By default only the
 * first MAX_VISIBLE bars are emitted and `overflowCount` reports the rest;
 * pass `{ all: true }` for the full overlay (every bar, no cap).
 */
export function layoutBars(
  anims: ResolvedAnim[],
  cueStartS: number,
  pxPerSec: number,
  opts?: { all?: boolean; groupColor?: string },
): { bars: Bar[]; overflowCount: number; fullCount: number } {
  const shown = opts?.all ? anims : anims.slice(0, MAX_VISIBLE);
  const bars: Bar[] = shown.map((a, i) => {
    const { s, e } = barBounds(a);
    const leftPx = (s - cueStartS) * pxPerSec;
    const widthPx = (e - s) * pxPerSec;
    const vt = typeForChannel(a.channel);
    return {
      topPx: TEXT_H + i * (BAR_H + GAP),
      heightPx: BAR_H,
      leftPx,
      widthPx,
      kind: widthPx < TINY_PX ? "glyph" : "bar",
      vt,
      fill: barFill(a, opts?.groupColor),
      glyph: typeGlyph(vt),
      clip: vt === "size" ? WEDGE_CLIP : undefined,
      src: a.src ?? "tag",
      warning: a.warning ?? null,
    };
  });
  return {
    bars,
    overflowCount: opts?.all ? 0 : Math.max(0, anims.length - MAX_VISIBLE),
    fullCount: anims.length,
  };
}

/** ANIMATION-column marker for a cue, from its resolved list + suppress carriers. */
export type AnimColMarker = "none" | "inh" | "ovr" | "supp";
export function animColMarker(anims: ResolvedAnim[], suppressed: boolean): AnimColMarker {
  if (anims.length === 0) return suppressed ? "supp" : "none";
  // override (solid) if any tag-sourced anim is present; else inherited (grey).
  return anims.some((a) => a.src === "tag") ? "ovr" : "inh";
}
