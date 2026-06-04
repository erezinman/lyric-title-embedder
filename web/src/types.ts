export const STYLE_KEYS = ["font","fontsize","bold","primary","outline","back","back_alpha","outline_w","shadow","border_style"] as const;
export const CUE_STYLE_KEYS = STYLE_KEYS.filter((k) => k !== "border_style");
export const FADE_KEYS = ["fade_in_ms","fade_out_ms"] as const;

export type StyleKey = (typeof STYLE_KEYS)[number];
export interface GlobalStyle {
  font: string; fontsize: number; bold: boolean; primary: string; outline: string;
  back: string; back_alpha: string; outline_w: number; shadow: number; border_style: number;
}
export type StyleOverrides = Partial<GlobalStyle>;
export type CueStyleOverrides = Omit<Partial<GlobalStyle>, "border_style">;
export interface FadeOverrides { fade_in_ms?: number; fade_out_ms?: number; }

export interface Word { text: string; start: number; end: number; }
export interface Token { ids: number[]; sep: string; del: boolean; style: CueStyleOverrides; }
export interface Line { toks: Token[]; }
export interface LayoutGroup {
  label: string; accumulate: "words" | "lines" | "off";
  win_start: number | null; win_end: number | null; linger: number | null; del: boolean;
  style: StyleOverrides; fade: FadeOverrides; lines: Line[];
}
export interface FadeTag { ids: number[]; trigger: number | null; }
export interface Placement {
  align: number; play_w: number; play_h: number;
  margin_l: number; margin_r: number; margin_v: number; pos: [number, number] | null;
}
export interface Globals { fade_in_ms: number; fade_out_ms: number; linger: number; }
export interface Project {
  words: Word[]; layout: LayoutGroup[]; fin_tags: FadeTag[]; fout_tags: FadeTag[];
  globals: Globals; global_style: GlobalStyle; placement: Placement;
  video: string | null;
}
export type FadeKind = "in" | "out";
