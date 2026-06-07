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

export const MIN_PX = 26;   // below this rendered width → glyph chip
export const MAX_BARS = 3;  // cap of stacked bars per cue

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

/** Inline fill style for a real strip, by visual type (ported from tl-anim.js stripStyle). */
export function stripStyle(vt: VisualType, c: string): React.CSSProperties {
  switch (vt) {
    case "color": return { background: `linear-gradient(90deg, #fff, ${c})` };
    case "alpha": return { background: `linear-gradient(90deg, ${c}00, ${c})` };
    case "size":  return { background: `linear-gradient(90deg, ${c}22, ${c})`, clipPath: "polygon(0 100%,100% 0,100% 100%)" };
    case "type":  return { background: `repeating-linear-gradient(90deg, ${c} 0 3px, ${c}33 3px 7px)` };
    case "move":  return { background: `linear-gradient(90deg, ${c}11, ${c})` };
    case "glow":  return { background: `radial-gradient(120% 180% at 60% 50%, ${c}, ${c}22 70%, transparent)`, filter: "blur(.4px)" };
  }
}

/** Time bounds of a resolved anim (min start, max end across its segments). */
export function animBounds(a: ResolvedAnim): { s: number; e: number } {
  const starts = a.segments.map((s) => s.start_s);
  const ends = a.segments.map((s) => s.end_s);
  return { s: Math.min(...starts), e: Math.max(...ends) };
}

export interface StripLayout {
  kind: "bar" | "glyph" | "overflow" | "collapse";
  aid: string;        // anim id (or "over"/"collapse")
  vt: VisualType;
  src: ResolvedAnim["src"];
  warning: string | null;
  /** px left relative to the cue block. */
  left: number;
  /** px width (real/overflow bars only). */
  width: number;
  /** vertical slot top %, height % (within the cue block). */
  top: number;
  height: number;
  /** overflow only: stripe gradient + count. */
  stripes?: string;
  count?: number;
}

export interface StripsResult {
  strips: StripLayout[];
  /** cue block height in px (grows when expanded). */
  cueHeight: number;
  exp: boolean;
}

/**
 * Lay out the strips for one cue. `cueStartS` is the cue's start (px origin).
 * `pxPerSec` maps seconds → px. `expanded` shows all bars + a collapse chip.
 */
export function layoutStrips(
  anims: ResolvedAnim[],
  cueStartS: number,
  pxPerSec: number,
  expanded: boolean,
): StripsResult {
  const xOf = (sec: number) => (sec - cueStartS) * pxPerSec;
  const all = anims;
  const isExp = expanded && all.length > MAX_BARS;
  const over = all.length > MAX_BARS && !isExp;
  const shown = over ? all.slice(0, MAX_BARS - 1) : all;
  const slots = over ? MAX_BARS : Math.max(all.length, 1);
  const BAND = isExp ? 60 : 42;
  const slotH = BAND / slots;

  const strips: StripLayout[] = shown.map((a, i) => {
    const { s, e } = animBounds(a);
    const left = xOf(s);
    const width = (e - s) * pxPerSec;
    const vt = typeForChannel(a.channel);
    const top = 100 - BAND + i * slotH;
    return {
      kind: width < MIN_PX ? "glyph" : "bar",
      aid: a.id, vt, src: a.src ?? "tag", warning: a.warning ?? null,
      left, width, top, height: slotH,
    };
  });

  if (over) {
    const hidden = all.slice(MAX_BARS - 1);
    const oS = Math.min(...hidden.map((a) => animBounds(a).s));
    const oE = Math.max(...hidden.map((a) => animBounds(a).e));
    const stripes = hidden
      .map((a, k) => `${typeColor(typeForChannel(a.channel))} ${(k * 100) / hidden.length}% ${((k + 1) * 100) / hidden.length}%`)
      .join(",");
    strips.push({
      kind: "overflow", aid: "over", vt: "glow", src: "tag", warning: null,
      left: xOf(oS), width: Math.max(MIN_PX, (oE - oS) * pxPerSec),
      top: 100 - BAND + (slots - 1) * slotH, height: slotH,
      stripes, count: hidden.length,
    });
  }

  if (isExp) {
    strips.push({
      kind: "collapse", aid: "collapse", vt: "glow", src: "tag", warning: null,
      left: 0, width: 0, top: 0, height: 0,
    });
  }

  const cueHeight = isExp ? 54 + (all.length - MAX_BARS) * 13 : 54;
  return { strips, cueHeight, exp: isExp };
}

/** ANIMATION-column marker for a cue, from its resolved list + suppress carriers. */
export type AnimColMarker = "none" | "inh" | "ovr" | "supp";
export function animColMarker(anims: ResolvedAnim[], suppressed: boolean): AnimColMarker {
  if (anims.length === 0) return suppressed ? "supp" : "none";
  // override (solid) if any tag-sourced anim is present; else inherited (grey).
  return anims.some((a) => a.src === "tag") ? "ovr" : "inh";
}
