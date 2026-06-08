export const STYLE_KEYS = ["font","fontsize","bold","italic","underline","primary","outline","back","back_alpha","outline_w","shadow","border_style","align"] as const;
export const CUE_STYLE_KEYS = STYLE_KEYS.filter((k) => k !== "border_style" && k !== "align");   // group-only keys

export type StyleKey = (typeof STYLE_KEYS)[number];
export interface GlobalStyle {
  font: string; fontsize: number; bold: boolean; italic: boolean; underline: boolean;
  primary: string; outline: string;
  back: string; back_alpha: string; outline_w: number; shadow: number; border_style: number;
  align: number;
}
export type StyleOverrides = Partial<GlobalStyle>;
export type CueStyleOverrides = Omit<Partial<GlobalStyle>, "border_style" | "align">;

// ── Animations model (replaces the legacy fade model) ───────────────────────
// Settled schema (questions §1.2 / reconciliation §2 / engine spec). Modes are a
// stored literal sugar over anchor+stagger (SPEC-GAP-1 ruling 1); "custom"/absent
// means the raw per-endpoint anchors are authoritative.
export type AnimAnchor =
  | "cue_start" | "cue_end" | "line_start" | "line_end"
  | "span_start" | "span_end" | "event_start" | "event_end";
export type AnimUnit = "ms" | "frac";
export type TimingMode =
  | "percue" | "perline" | "together" | "cascade" | "typewriter"
  | "reverse" | "centerout" | "jitter" | "custom";
export type AnimChannel =
  | "alpha" | "scale_x" | "scale_y" | "primary" | "clip_rect"
  | "blur" | "karaoke_fill" | "move";

export interface AnimTime { anchor: AnimAnchor; offset: number; unit: AnimUnit; }
export interface AnimSegment {
  t0: AnimTime; t1: AnimTime;
  from: unknown | null; to: unknown;
  accel: number | "inout";
}
export interface Animation {
  id: string; name: string; group_id?: string | null;
  channel: AnimChannel; mode?: TimingMode | null;
  step?: number | null; step_unit?: AnimUnit | null;
  segments: AnimSegment[];
  stagger?: Record<string, unknown> | null;
  enabled: boolean;
}
export interface AnimTag { ids: number[]; anims: Animation[]; suppress: string[]; }
/** A resolved (flat) animation as it appears in get_project per-cue / get_render. */
export interface ResolvedAnim {
  id: string; name: string; group_id?: string | null; channel: AnimChannel;
  segments: { start_s: number; end_s: number; from: unknown; to: unknown; accel: number | "inout" }[];
  src?: "global" | "group" | "tag";
  warning?: string | null;
}

export interface Word { text: string; start: number; end: number; }
export interface Token {
  ids: number[]; sep: string; del: boolean; style: CueStyleOverrides;
  anims_resolved?: ResolvedAnim[];
}
export interface Line { toks: Token[]; }
export interface LayoutGroup {
  label: string;
  win_start: number | null; win_end: number | null; linger: number | null; del: boolean;
  style: StyleOverrides;
  animations: Animation[]; suppress: string[];
  lines: Line[];
}
export interface Placement {
  align: number; play_w: number; play_h: number;
  margin_l: number; margin_r: number; margin_v: number; pos: [number, number] | null;
  use_pos?: boolean;
  /** RTL support (per-project). text_direction: "auto" detects base direction from
   *  content; "ltr"/"rtl" force it. bidi_marks wraps embedded numbers/Latin in LRM. */
  text_direction?: "auto" | "ltr" | "rtl";
  bidi_marks?: boolean;
}
export type TextDirection = "auto" | "ltr" | "rtl";
export interface Globals {
  linger: number; animations: Animation[];
  /** Base text direction for the project. "auto" lets libass/bidi infer from
   *  content; "ltr"/"rtl" force it. Default "auto". (RTL support.) */
  text_direction: TextDirection;
  /** Insert Unicode bidi marks (LRM/RLM) around numbers & Latin in RTL runs so
   *  they don't reorder unexpectedly. Default true. (RTL support.) */
  bidi_marks: boolean;
}
/** Attached input video: the media pointer plus probed metadata. w/h/duration_s are
 *  null when the probe failed (path still stored — Feature A degrades gracefully). */
export interface VideoMeta {
  path: string;
  w: number | null;
  h: number | null;
  duration_s: number | null;
}
export interface Project {
  words: Word[]; layout: LayoutGroup[]; anim_tags: AnimTag[];
  globals: Globals; global_style: GlobalStyle; placement: Placement;
  video: VideoMeta | null;
}
