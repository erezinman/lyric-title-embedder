// events.ts — shared constants + view-model for the Events panel.
// SEC_BASE: the fixed section enum ("—" = none). PALETTE: the 8 brand colors.

export const SEC_BASE = ["—", "Intro", "Verse", "Pre-chorus", "Chorus", "Bridge", "Outro", "Hook"] as const;

export const PALETTE = [
  "#FF3DA6", "#8A5CF6", "#36E2FF", "#37E29A", "#FFC24B", "#FF6B6B", "#A88BFF", "#4DE0C2",
] as const;

/** One row in the Events panel, projected from a layout group. */
export interface EventRow {
  gi: number;
  label: string;
  section: string;
  color: string;
  win_start: number;
  win_end: number;
  linger: number;
  cueCount: number;
}

/** Collapse pasted/typed line breaks to spaces and trim (single-line rule §6). */
export function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}
