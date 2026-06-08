// bidi.ts — base-direction resolution for the live caption overlay.
//
// The jassub canvas renders bidi-correct pixels via FriBidi already; this only
// drives the transparent DOM selection overlay's `dir` so its span geometry
// visually matches libass. Spans stay in LOGICAL (reading) order in the DOM —
// `dir="rtl"` reorders only the visuals, so per-span onClick keeps selecting the
// right logical wid (no visual->logical mapping needed).

import type { TextDirection } from "../types";

// First strong-directional char -> direction. RTL covers Hebrew (U+0590-05FF),
// Arabic (U+0600-06FF) + Syriac/supplements/presentation forms. Neutrals
// (digits, punctuation, spaces) fall through; pure-neutral text -> ltr.
function isRtlStrong(cp: number): boolean {
  return (
    (cp >= 0x0590 && cp <= 0x05ff) || // Hebrew
    (cp >= 0x0600 && cp <= 0x06ff) || // Arabic
    (cp >= 0x0700 && cp <= 0x074f) || // Syriac
    (cp >= 0x0750 && cp <= 0x077f) || // Arabic Supplement
    (cp >= 0x08a0 && cp <= 0x08ff) || // Arabic Extended-A
    (cp >= 0xfb1d && cp <= 0xfb4f) || // Hebrew presentation forms
    (cp >= 0xfb50 && cp <= 0xfdff) || // Arabic presentation forms-A
    (cp >= 0xfe70 && cp <= 0xfeff)    // Arabic presentation forms-B
  );
}
function isLtrStrong(cp: number): boolean {
  return (
    (cp >= 0x0041 && cp <= 0x005a) || // A-Z
    (cp >= 0x0061 && cp <= 0x007a) || // a-z
    (cp >= 0x00c0 && cp <= 0x024f) || // Latin-1 supplement / extended
    (cp >= 0x0370 && cp <= 0x03ff) || // Greek
    (cp >= 0x0400 && cp <= 0x04ff)    // Cyrillic
  );
}

/** Detect base direction from the first strong-directional char in `text`. */
export function detectDir(text: string): "ltr" | "rtl" {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isRtlStrong(cp)) return "rtl";
    if (isLtrStrong(cp)) return "ltr";
  }
  return "ltr";
}

/** Resolve the concrete overlay direction from the project setting + caption text.
 *  "auto" (or undefined) auto-detects from the first strong char of `text`. */
export function resolveDir(setting: TextDirection | undefined, text: string): "ltr" | "rtl" {
  if (setting === "rtl" || setting === "ltr") return setting;
  return detectDir(text);
}
