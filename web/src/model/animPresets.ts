// animPresets.ts — preset Animation records the foundation still writes.
// The full preset picker + Inspector animation UI arrive in later phases; for now
// the OpsToolbar "Group fade-in/out" shortcuts write these fade preset records onto
// an anim_tag over the selection (reconciliation §3 — fade buttons survive as preset
// shortcuts writing animation records).
import type { Animation, AnimSegment, AnimTime } from "../types";

export const time = (anchor: AnimTime["anchor"], offset = 0, unit: AnimTime["unit"] = "ms"): AnimTime =>
  ({ anchor, offset, unit });

export const seg = (
  t0: AnimTime, t1: AnimTime, from: unknown | null = null, to: unknown = 1, accel: number | "inout" = 1,
): AnimSegment => ({ t0, t1, from, to, accel });

/** Sane-default Animation literal (mirrors the test-design anim(partial) builder). */
export function anim(p: Partial<Animation> & { id: string }): Animation {
  return {
    id: p.id,
    name: p.name ?? "custom",
    group_id: p.group_id ?? null,
    channel: p.channel ?? "alpha",
    segments: p.segments ?? [seg(time("cue_start"), time("cue_start", 250), null, 1)],
    mode: p.mode,
    step: p.step,
    step_unit: p.step_unit,
    stagger: p.stagger,
    enabled: p.enabled ?? true,
  };
}

/** The fade-in preset: alpha FF→00 anchored cue_start+0..+250ms, percue. */
export function fadeInAnim(id: string): Animation {
  return {
    id, name: "fade_in", group_id: null, channel: "alpha", mode: "percue",
    segments: [seg(time("cue_start", 0), time("cue_start", 250), "FF", "00")],
    enabled: true,
  };
}

/** The fade-out preset: alpha 00→FF anchored cue_end..cue_end+250ms, percue. */
export function fadeOutAnim(id: string): Animation {
  return {
    id, name: "fade_out", group_id: null, channel: "alpha", mode: "percue",
    segments: [seg(time("cue_end", 0), time("cue_end", 250), "00", "FF")],
    enabled: true,
  };
}

export const fadeAnimName = (kind: "in" | "out") => (kind === "in" ? "fade_in" : "fade_out");

/** Fresh, collision-free anim id given the ids already present anywhere. */
export function freshAnimId(existing: Iterable<string>): string {
  const taken = new Set(existing);
  for (let i = 1; ; i++) { const id = "a" + i; if (!taken.has(id)) return id; }
}

// ── Canonical v1 preset set (reconciliation §5 / HANDOFF §4.1) ───────────────
// Each preset instantiates one or more channel records. Multi-channel presets
// (Pop, Blur in) emit sibling records sharing a group_id (SPEC-GAP-2 ruling) —
// remove/restore/suppress act on the whole group; the UI renders one row per
// group_id keyed on the lead anim id.
export type PresetKey =
  | "fade_in" | "fade_out" | "sweep" | "pop" | "color_flash"
  | "wipe_in" | "blur_in" | "slide";

export interface PresetDef {
  key: PresetKey;
  /** Human label shown in the picker. */
  label: string;
  /** Icon name (Icon.tsx). */
  icon: string;
  /** Channels this preset writes (1 = single record; >1 = sibling group). */
  channels: AnimChannel[];
  /** Default timing mode (HANDOFF §4.1 table). */
  mode: import("../types").TimingMode;
  /** Slide/move is model-enforced group/global only — disabled at cue/tag scope. */
  groupGlobalOnly?: boolean;
}

import type { AnimChannel } from "../types";

export const PRESETS: PresetDef[] = [
  { key: "fade_in",     label: "Fade in",     icon: "sparkles", channels: ["alpha"],                 mode: "percue" },
  { key: "fade_out",    label: "Fade out",    icon: "sparkles", channels: ["alpha"],                 mode: "percue" },
  { key: "sweep",       label: "Sweep",       icon: "waveform", channels: ["karaoke_fill"],          mode: "percue" },
  { key: "pop",         label: "Pop",         icon: "sparkles", channels: ["scale_x", "scale_y"],    mode: "percue" },
  { key: "color_flash", label: "Color flash", icon: "sparkles", channels: ["primary"],               mode: "percue" },
  { key: "wipe_in",     label: "Wipe in",     icon: "type",     channels: ["clip_rect"],             mode: "typewriter" },
  { key: "blur_in",     label: "Blur in",     icon: "sparkles", channels: ["blur"],                  mode: "percue" },
  { key: "slide",       label: "Slide",       icon: "fwd",      channels: ["move"],                  mode: "together", groupGlobalOnly: true },
];

export const presetByKey = (k: PresetKey): PresetDef => PRESETS.find((p) => p.key === k)!;

/**
 * Build the Animation record(s) for a preset. `nextId(i)` yields fresh, unique
 * ids for each channel record. Multi-channel presets share a group_id (= the
 * lead record's id). Returns the array of sibling records (length = channels).
 */
export function buildPreset(key: PresetKey, nextId: (i: number) => string): Animation[] {
  const def = presetByKey(key);
  const multi = def.channels.length > 1;
  const leadId = nextId(0);
  const groupId = multi ? leadId : null;
  return def.channels.map((channel, i) => {
    const id = i === 0 ? leadId : nextId(i);
    return {
      id,
      name: def.key,
      group_id: groupId,
      channel,
      mode: def.mode,
      step: def.mode === "cascade" || def.mode === "typewriter" ? 80 : null,
      step_unit: def.mode === "cascade" || def.mode === "typewriter" ? ("ms" as const) : null,
      segments: presetSegments(channel),
      enabled: true,
    } as Animation;
  });
}

function presetSegments(channel: AnimChannel): AnimSegment[] {
  switch (channel) {
    case "alpha":        return [seg(time("cue_start", 0), time("cue_start", 250), "FF", "00")];
    case "scale_x":
    case "scale_y":      return [seg(time("cue_start", 0), time("cue_start", 180), 1, 1.18)];
    case "primary":      return [seg(time("cue_start", 0), time("cue_start", 200), null, 1)];
    case "clip_rect":    return [seg(time("cue_start", 0), time("cue_start", 300), 0, 1)];
    case "blur":         return [seg(time("cue_start", 0), time("cue_start", 250), 8, 0)];
    case "karaoke_fill": return [seg(time("cue_start", 0), time("cue_end", 0), null, 1)];
    case "move":         return [seg(time("cue_start", 0), time("cue_start", 300), 0, 1)];
    default:             return [seg(time("cue_start", 0), time("cue_start", 250), null, 1)];
  }
}
