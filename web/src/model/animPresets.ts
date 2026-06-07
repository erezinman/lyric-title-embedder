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
