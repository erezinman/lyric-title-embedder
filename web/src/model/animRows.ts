// animRows.ts — derive the Inspector append-model rows for an animation tier.
// Mirrors the resolution semantics in HANDOFF_animations §2 + reconciliation §2:
//   GLOBAL tier  = globals.animations (the complete base; all "own").
//   GROUP tier   = layout[gi].animations (own) + inherited globals; a global id
//                  in layout[gi].suppress renders as a tombstone.
//   CUE tier     = anims from every anim_tag containing the selected cue (own,
//                  tag-sourced) + inherited group + inherited global; a
//                  suppressed inherited id (in any covering tag's suppress, or
//                  the group's suppress) renders as a tombstone.
//
// Multi-channel presets share a group_id; the UI shows ONE row per group_id
// (keyed on the lead anim). We collapse siblings here so callers see one row.
import type { Project, Animation, AnimTag } from "../types";

export type RowKind = "own" | "inherited" | "tombstone";

export interface AnimRow {
  /** Lead animation id (the dispatch target; siblings handled server-side). */
  id: string;
  name: string;
  channel: Animation["channel"];
  mode?: Animation["mode"];
  step?: Animation["step"];
  step_unit?: Animation["step_unit"];
  kind: RowKind;
  /** Where the (inherited) row is sourced from. */
  src: "global" | "group" | "tag";
  /** The full animation record (lead of its group_id sibling set). */
  anim: Animation;
  /** For tag-sourced rows: the owning tag (so callers can read ids / "N cues"). */
  tag?: AnimTag;
  /** Number of cues the tag spans (1 for non-tag rows). */
  cueCount: number;
}

/** Collapse sibling records (same non-null group_id) to their lead (first-listed). */
function leads(anims: Animation[]): Animation[] {
  const seen = new Set<string>();
  const out: Animation[] = [];
  for (const a of anims) {
    if (a.group_id) {
      if (seen.has(a.group_id)) continue;
      seen.add(a.group_id);
    }
    out.push(a);
  }
  return out;
}

/** Tags that contain a given cue word id, in project order. */
export function tagsForWid(project: Project, wid: number): AnimTag[] {
  return project.anim_tags.filter((t) => t.ids.includes(wid));
}

/** Rows for the GLOBAL tier: every base animation is "own". */
export function globalRows(project: Project): AnimRow[] {
  return leads(project.globals.animations).map((a) => ({
    id: a.id, name: a.name, channel: a.channel, mode: a.mode, step: a.step, step_unit: a.step_unit,
    kind: "own" as const, src: "global" as const, anim: a, cueCount: 1,
  }));
}

/** Rows for the GROUP tier `gi`: own group anims + inherited globals (suppress→tombstone). */
export function groupRows(project: Project, gi: number): AnimRow[] {
  const g = project.layout[gi];
  const rows: AnimRow[] = [];
  const suppress = new Set(g?.suppress ?? []);
  for (const a of leads(g?.animations ?? [])) {
    rows.push({
      id: a.id, name: a.name, channel: a.channel, mode: a.mode, step: a.step, step_unit: a.step_unit,
      kind: "own", src: "group", anim: a, cueCount: 1,
    });
  }
  for (const a of leads(project.globals.animations)) {
    rows.push({
      id: a.id, name: a.name, channel: a.channel, mode: a.mode, step: a.step, step_unit: a.step_unit,
      kind: suppress.has(a.id) ? "tombstone" : "inherited", src: "global", anim: a, cueCount: 1,
    });
  }
  return rows;
}

/** Rows for the CUE tier (selected word `wid` in group `gi`). */
export function cueRows(project: Project, gi: number, wid: number): AnimRow[] {
  const rows: AnimRow[] = [];
  const tags = tagsForWid(project, wid);
  // tombstones can live on a covering tag OR the inherited group scope
  const tagSuppress = new Set<string>();
  for (const t of tags) for (const s of t.suppress) tagSuppress.add(s);
  const g = project.layout[gi];
  const groupSuppress = new Set(g?.suppress ?? []);

  // own (tag-sourced) rows
  for (const t of tags) {
    for (const a of leads(t.anims)) {
      rows.push({
        id: a.id, name: a.name, channel: a.channel, mode: a.mode, step: a.step, step_unit: a.step_unit,
        kind: "own", src: "tag", anim: a, tag: t, cueCount: t.ids.length,
      });
    }
  }
  // inherited group rows (group anims not suppressed at group scope)
  for (const a of leads(g?.animations ?? [])) {
    rows.push({
      id: a.id, name: a.name, channel: a.channel, mode: a.mode, step: a.step, step_unit: a.step_unit,
      kind: tagSuppress.has(a.id) ? "tombstone" : "inherited", src: "group", anim: a, cueCount: 1,
    });
  }
  // inherited global rows (suppressed at group OR tag scope → tombstone)
  for (const a of leads(project.globals.animations)) {
    const suppressed = tagSuppress.has(a.id) || groupSuppress.has(a.id);
    rows.push({
      id: a.id, name: a.name, channel: a.channel, mode: a.mode, step: a.step, step_unit: a.step_unit,
      kind: suppressed ? "tombstone" : "inherited", src: "global", anim: a, cueCount: 1,
    });
  }
  return rows;
}

/** The count for the ▸ Inherited (n) disclosure: all inherited + tombstone rows. */
export function inheritedCount(rows: AnimRow[]): number {
  return rows.filter((r) => r.kind !== "own").length;
}
