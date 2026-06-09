// animCustom.ts — free-form "Custom" animation model helpers (zip-13). A custom
// animation sets a style property at a time relative to cue start/end (e.g.
// End −30ms → red / slant). Builds ONE segment on any animatable channel. Ported
// faithfully from the shipped web app's anims.jsx helpers.
import type { Animation, AnimChannel, AnimTime } from "../types";
import { time, seg } from "./animPresets";

export interface CustomChannel {
  ch: AnimChannel;
  tag: string;
  label: string;
  kind: "color" | "num";
  def: string | number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  pair?: AnimChannel;
}

// Non-animatable toggles (italic/bold/underline) aren't \t-able in libass, so we
// offer shear_x "Slant" as the faux-italic stand-in.
export const CUSTOM_CHANNELS: CustomChannel[] = [
  { ch: "primary",  tag: "fill",      label: "Fill color",          kind: "color", def: "#FF3DA6" },
  { ch: "outline",  tag: "outline",   label: "Outline color",       kind: "color", def: "#3DE0FF" },
  { ch: "fontsize", tag: "size",      label: "Size",                kind: "num", unit: "px", def: 84,  step: 2, min: 8 },
  { ch: "scale_x",  tag: "scale",     label: "Scale",               kind: "num", unit: "%",  def: 120, step: 5, min: 10, pair: "scale_y" },
  { ch: "shear_x",  tag: "slant",     label: "Slant (faux-italic)", kind: "num", unit: "",   def: 0.2, step: 0.05, min: -1, max: 1 },
  { ch: "blur",     tag: "blur",      label: "Blur",                kind: "num", unit: "px", def: 6,   step: 1, min: 0 },
  { ch: "border_w", tag: "outline w", label: "Outline width",       kind: "num", unit: "px", def: 6,   step: 1, min: 0 },
  { ch: "rot_z",    tag: "rotate",    label: "Rotate",              kind: "num", unit: "°",  def: 8,   step: 2 },
  { ch: "spacing",  tag: "spacing",   label: "Letter spacing",      kind: "num", unit: "px", def: 4,   step: 1 },
];

export const CB_EASE = { linear: "Linear", out: "Decelerate", in: "Accelerate" } as const;

const cbChMeta = (ch: string): CustomChannel =>
  CUSTOM_CHANNELS.find((m) => m.ch === ch) || CUSTOM_CHANNELS[0];

// the cfg the editor speaks.
export interface CustomCfg {
  ch: string;
  anchor: AnimTime["anchor"];
  offset: number;
  mode: "snap" | "ramp";
  dur: number;
  ease: keyof typeof CB_EASE;
  value: string | number;
}

export const DEFAULT_CUSTOM: CustomCfg = {
  ch: "primary", anchor: "cue_end", offset: -30, mode: "snap", dur: 200, ease: "out", value: "#FF3DA6",
};

// timing defaults for a freshly-built custom animation (its sequencing mode is a
// real timing mode like any preset — the custom flag marks it as free-form).
export interface CustomTiming {
  mode: Animation["mode"];
  step: number | null;
  step_unit: Animation["step_unit"];
  enabled: boolean;
}

export const CUSTOM_TIMING: CustomTiming = { mode: "percue", step: null, step_unit: null, enabled: true };

export const isCustomAnim = (anim: Animation | null | undefined): boolean =>
  !!(anim && (anim.custom || anim.mode === "custom"));

export function buildCustom(
  cfg: CustomCfg,
  nextId: () => string,
  timing?: Partial<CustomTiming>,
): Animation[] {
  const tm: CustomTiming = { ...CUSTOM_TIMING, ...(timing || {}) };
  const mode = tm.mode === "custom" || !tm.mode ? "percue" : tm.mode;
  const meta = cbChMeta(cfg.ch);
  const accel = cfg.mode === "ramp" ? (cfg.ease === "out" ? 0.5 : cfg.ease === "in" ? 2 : 1) : 1;
  const t0 = time(cfg.anchor, Math.round(cfg.offset), "ms");
  const t1 = time(cfg.anchor, Math.round(cfg.mode === "ramp" ? cfg.offset + cfg.dur : cfg.offset), "ms");
  const chans: AnimChannel[] = meta.pair ? [meta.ch, meta.pair] : [meta.ch];
  const lead = nextId();
  const gid = meta.pair ? lead : null;
  return chans.map((ch, i) => ({
    id: i === 0 ? lead : nextId(),
    name: meta.tag,
    group_id: gid,
    channel: ch,
    custom: true,
    mode,
    step: tm.step,
    step_unit: tm.step_unit,
    segments: [seg(t0, t1, null, cfg.value, accel)],
    enabled: tm.enabled !== false,
  }));
}

// reconstruct the editor cfg from a stored custom-animation lead record (the
// inverse of buildCustom).
export function customCfgOf(anim: Animation | null | undefined): CustomCfg {
  const s = (anim && anim.segments && anim.segments[0]) || ({} as Partial<Animation["segments"][number]>);
  const t0 = (s.t0 || {}) as Partial<AnimTime>;
  const t1 = (s.t1 || {}) as Partial<AnimTime>;
  const offset = t0.offset || 0;
  const isRamp = t1.offset != null && t1.offset !== t0.offset;
  const accel = s.accel;
  return {
    ch: (anim && anim.channel) || "primary",
    anchor: (t0.anchor as AnimTime["anchor"]) || "cue_end",
    offset,
    mode: isRamp ? "ramp" : "snap",
    dur: isRamp ? ((t1.offset as number) - offset) : 200,
    ease: accel === 0.5 ? "out" : accel === 2 ? "in" : "linear",
    value: s.to as string | number,
  };
}

// preview-only nominal-cue resolver: project an AnimTime onto a [start,end] span.
export function anchorSec(span: [number, number], t: AnimTime): number {
  const base = /_end$/.test(t.anchor) ? span[1] : span[0];
  const off = t.offset || 0;
  return t.unit === "frac" ? base + off * (span[1] - span[0]) : base + off / 1000;
}
