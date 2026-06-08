// ColorPicker.tsx — Karaoke Subtitle Studio
// Ported verbatim (logic + markup + CSS classes) from
// design-system/handoff-pickers/components/ColorPicker.jsx.txt — converted to
// TS/React (named hook imports, typed props per ColorPicker.d.ts). Solid color
// picker: HSV spectrum (saturation/value square + hue slider) + hex + optional
// alpha, named preset palettes, and a localStorage-backed queue of recently
// picked custom colors — all with a live caption preview. Pairs with pickers.css.

import React, { useRef, useCallback, useState, useEffect } from "react";

/* ---- color math ---------------------------------------------------------- */
export function kspHexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = String(hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 255, g: 255, b: 255 };
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function kspRgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
  return "#" + (c(r) + c(g) + c(b)).toUpperCase();
}
function kspRgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
function kspHsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
export function kspHsvToHex(h: number, s: number, v: number): string { const { r, g, b } = kspHsvToRgb(h, s, v); return kspRgbToHex(r, g, b); }

export interface ColorPalette { name: string; colors: string[]; }

export const KSP_BRAND_SWATCHES = ["#FFFFFF", "#FF3DA6", "#8A5BFF", "#3DE0FF", "#4DE0C2", "#FFC24D", "#FF6B6B", "#000000"];

// Named preset palettes — pick one to swap the swatch row. Caption-appropriate.
export const KSP_PALETTES: ColorPalette[] = [
  { name: "Brand", colors: ["#FFFFFF", "#FF3DA6", "#8A5BFF", "#3DE0FF", "#4DE0C2", "#FFC24D", "#FF6B6B", "#000000"] },
  { name: "Neon",  colors: ["#39FF14", "#FE00FE", "#00F0FF", "#FFE600", "#FF073A", "#00FFD1", "#FF6FD8", "#B5FF00"] },
  { name: "Warm",  colors: ["#FFF3E0", "#FFD166", "#FF9F45", "#FF6B6B", "#E63946", "#C1121F", "#7A1F2B", "#3D0A11"] },
  { name: "Cool",  colors: ["#EAF6FF", "#9BE3FF", "#3DE0FF", "#4DA3FF", "#5B7BFF", "#8A5BFF", "#5B3F9E", "#1B1450"] },
  { name: "Mono",  colors: ["#FFFFFF", "#E6E1EF", "#C7BFD6", "#9C94AD", "#6E6780", "#4A4458", "#2A2536", "#000000"] },
];

/* ---- drag helper: maps a pointer to 0..1 within an element ---------------- */
function kspUseDrag(onMove: (x: number, y: number) => void, onEnd?: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const start = useCallback((e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const emit = (ev: PointerEvent | TouchEvent | React.PointerEvent) => {
      const t = (ev as TouchEvent).touches;
      const px = t ? t[0].clientX : (ev as PointerEvent).clientX;
      const py = t ? t[0].clientY : (ev as PointerEvent).clientY;
      onMove(
        Math.max(0, Math.min(1, (px - rect.left) / rect.width)),
        Math.max(0, Math.min(1, (py - rect.top) / rect.height)),
      );
    };
    emit(e);
    const up = () => {
      window.removeEventListener("pointermove", emit as EventListener);
      window.removeEventListener("pointerup", up);
      if (onEnd) onEnd();
    };
    window.addEventListener("pointermove", emit as EventListener);
    window.addEventListener("pointerup", up);
    e.preventDefault();
  }, [onMove, onEnd]);
  return [ref, start] as const;
}

/* ---- recent-colors queue (shared across instances, localStorage-backed) --- */
const KSP_RECENTS_KEY = "kss.recentColors";
const KSP_RECENTS_MAX = 10;
const kspRecentStore = (() => {
  let list: string[] = [];
  try { const raw = window.localStorage.getItem(KSP_RECENTS_KEY); if (raw) list = JSON.parse(raw) || []; } catch { /* ignore */ }
  const subs = new Set<(l: string[]) => void>();
  const save = () => { try { window.localStorage.setItem(KSP_RECENTS_KEY, JSON.stringify(list)); } catch { /* ignore */ } };
  return {
    get: () => list,
    add(hex: string) {
      if (!hex || typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
      const v = hex.toUpperCase();
      list = [v, ...list.filter((c) => c.toUpperCase() !== v)].slice(0, KSP_RECENTS_MAX);
      save(); subs.forEach((fn) => fn(list));
    },
    subscribe(fn: (l: string[]) => void) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
})();
function kspUseRecents(controlled?: string[], onAdd?: (hex: string) => void) {
  const [list, setList] = useState<string[]>(controlled || kspRecentStore.get());
  useEffect(() => {
    if (controlled) { setList(controlled); return; }
    return kspRecentStore.subscribe(setList);
  }, [controlled]);
  const add = useCallback((hex: string) => {
    if (onAdd) onAdd(hex);
    if (!controlled) kspRecentStore.add(hex);
  }, [controlled, onAdd]);
  return [controlled || list, add] as const;
}

function kspIcon(name: "drop" | "chev", size?: number) {
  const p = {
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
  }[name];
  return (
    <svg width={size || 14} height={size || 14} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: p }} />
  );
}

export interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  alpha?: number;
  onAlphaChange?: (alpha: number) => void;
  swatches?: string[];
  presets?: ColorPalette[];
  recent?: string[];
  onAddRecent?: (hex: string) => void;
  previewText?: string;
  previewFont?: string;
  previewRole?: "fill" | "outline" | "box";
  previewFill?: string;
  label?: string;
  mode?: "panel" | "field";
  align?: "left" | "right";
  up?: boolean;
  flat?: boolean;
}

/* ---- the picker panel ---------------------------------------------------- */
export function ColorPanel({ value, onChange, alpha, onAlphaChange, swatches, presets, recent, onAddRecent, previewText, previewFont, previewRole, previewFill, label, flat }: ColorPickerProps) {
  const palettes = swatches && swatches.length ? null : (presets && presets.length ? presets : KSP_PALETTES);
  const [presetIdx, setPresetIdx] = useState(0);
  const list = swatches && swatches.length ? swatches : palettes![Math.min(presetIdx, palettes!.length - 1)].colors;
  const [recents, addRecent] = kspUseRecents(recent, onAddRecent);
  const showAlpha = typeof alpha === "number" && typeof onAlphaChange === "function";
  const a = showAlpha ? Math.max(0, Math.min(100, alpha!)) : 100;

  // internal HSV keeps hue stable while at grayscale; resync when value changes externally
  const [hsv, setHsv] = useState(() => { const { r, g, b } = kspHexToRgb(value); return kspRgbToHsv(r, g, b); });
  useEffect(() => {
    if (kspHsvToHex(hsv.h, hsv.s, hsv.v).toLowerCase() !== String(value).toLowerCase()) {
      const { r, g, b } = kspHexToRgb(value);
      const nh = kspRgbToHsv(r, g, b);
      setHsv((p) => ({ h: nh.s < 0.001 && p ? p.h : nh.h, s: nh.s, v: nh.v }));
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const [hexDraft, setHexDraft] = useState(value);
  useEffect(() => setHexDraft(value), [value]);

  const push = (nh: { h: number; s: number; v: number }) => { setHsv(nh); onChange(kspHsvToHex(nh.h, nh.s, nh.v)); };
  const commitRecent = useCallback(() => addRecent(kspHsvToHex(hsv.h, hsv.s, hsv.v)), [addRecent, hsv]);
  const [svRef, svDown] = kspUseDrag((x, y) => push({ h: hsv.h, s: x, v: 1 - y }), commitRecent);
  const [hueRef, hueDown] = kspUseDrag((x) => push({ h: x * 360, s: hsv.s, v: hsv.v }), commitRecent);
  const [alphaRef, alphaDown] = kspUseDrag((x) => onAlphaChange && onAlphaChange(Math.round(x * 100)));

  const hueColor = kspHsvToHex(hsv.h, 1, 1);
  const rgb = kspHexToRgb(value);
  const previewRgba = `rgba(${rgb.r},${rgb.g},${rgb.b},${a / 100})`;

  const commitHex = () => {
    let h = hexDraft.replace("#", "").trim();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (/^[0-9a-fA-F]{6}$/.test(h)) { const { r, g, b } = kspHexToRgb(h); push(kspRgbToHsv(r, g, b)); addRecent("#" + h.toUpperCase()); }
    else setHexDraft(value);
  };
  const pickSwatch = (c: string) => { const { r, g, b } = kspHexToRgb(c); push(kspRgbToHsv(r, g, b)); };

  return (
    <div className="ksp ksp-color">
      <div className={"ksp-panel" + (flat ? " flat" : "")}>
        <div className="ksp-head">{kspIcon("drop", 13)}{label || "Color"}
          <span className="ksp-tag">{String(value).toUpperCase()}{showAlpha ? " · " + a + "%" : ""}</span>
        </div>

        <div className="ksp-preview">
          <span className="ksp-pv-label">preview</span>
          {(() => {
            const fam = previewFont || "var(--font-display)";
            const base = previewFill || "#FFFFFF";
            const txt = previewText || "Karaoke";
            if (previewRole === "outline")
              // fill stays the real fill color; the picked color is the stroke around it
              return <span className="ksp-cap" style={{ fontFamily: fam, color: base, WebkitTextStrokeWidth: "3px", WebkitTextStrokeColor: previewRgba, paintOrder: "stroke fill", textShadow: "none" } as React.CSSProperties}>{txt}</span>;
            if (previewRole === "box")
              // text in the real fill, sitting on a box of the picked color
              return <span className="ksp-cap" style={{ fontFamily: fam, color: base, background: previewRgba, padding: ".06em .32em", borderRadius: ".1em", WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone", textShadow: "none" } as React.CSSProperties}>{txt}</span>;
            return <span className="ksp-cap" style={{ fontFamily: fam, color: previewRgba }}>{txt}</span>;
          })()}
        </div>

        <div className="ksp-sv" ref={svRef} style={{ "--ksp-hue": hueColor } as React.CSSProperties} onPointerDown={svDown}>
          <span className="ksp-sv-thumb" style={{ left: hsv.s * 100 + "%", top: (1 - hsv.v) * 100 + "%", background: value }} />
        </div>

        <div className="ksp-track hue" ref={hueRef} onPointerDown={hueDown}>
          <span className="ksp-track-thumb" style={{ left: (hsv.h / 360) * 100 + "%", background: hueColor }} />
        </div>

        {showAlpha && (
          <div className="ksp-track alpha" ref={alphaRef} onPointerDown={alphaDown}
            style={{ "--ksp-alpha-grad": `linear-gradient(to right, transparent, ${value})` } as React.CSSProperties}>
            <span className="ksp-track-thumb" style={{ left: a + "%", background: previewRgba }} />
          </div>
        )}

        <div className="ksp-inputs">
          <span className="ksp-chip"><span className="ksp-chip-fill" style={{ background: previewRgba }} /></span>
          <input className="ksp-hex" value={hexDraft} spellCheck={false}
            onChange={(e) => setHexDraft(e.target.value)} onBlur={commitHex}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
          {showAlpha && (
            <>
              <input className="ksp-num" type="number" min={0} max={100} value={a}
                onChange={(e) => onAlphaChange!(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))} />
              <span className="ksp-unit">%</span>
            </>
          )}
        </div>

        <div>
          <div className="ksp-prow">
            <span className="ksp-sub">Palette</span>
            {palettes && palettes.length > 1 && (
              <span className="ksp-presets">
                {palettes.map((p, i) => (
                  <button type="button" key={p.name} className={"ksp-preset" + (presetIdx === i ? " on" : "")}
                    onClick={() => setPresetIdx(i)}>{p.name}</button>
                ))}
              </span>
            )}
          </div>
          <div className="ksp-swatches">
            {list.map((c) => (
              <span key={c} className={"ksp-dot" + (c.toLowerCase() === String(value).toLowerCase() ? " on" : "")}
                style={{ background: c }} title={c} onClick={() => pickSwatch(c)} />
            ))}
          </div>
        </div>

        {recents && recents.length > 0 && (
          <div>
            <div className="ksp-prow"><span className="ksp-sub">Recent</span><span className="ksp-recent-n mono">{recents.length}</span></div>
            <div className="ksp-swatches">
              {recents.map((c, i) => (
                <span key={c + i} className={"ksp-dot" + (c.toLowerCase() === String(value).toLowerCase() ? " on" : "")}
                  style={{ background: c }} title={c} onClick={() => pickSwatch(c)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- anchored popover (fixed position; escapes scroll/overflow parents) --- */
interface PopState { left: number; top: number; up: boolean; right: boolean; }
function kspUsePopover(panelH?: number) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<PopState | null>(null);
  const place = useCallback(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const PW = 292, PH = panelH || 380, gap = 6;
    let left = r.left;
    let right = false;
    if (left + PW > window.innerWidth - 8) { left = Math.max(8, r.right - PW); right = true; }
    let top = r.bottom + gap, up = false;
    if (top + PH > window.innerHeight - 8 && r.top - gap - PH > 8) { top = r.top - gap - PH; up = true; }
    top = Math.max(8, Math.min(top, window.innerHeight - PH - 8));
    setPos({ left, top, up, right });
  }, [panelH]);
  useEffect(() => {
    if (!open) return;
    const f = () => place();
    window.addEventListener("resize", f);
    window.addEventListener("scroll", f, true);
    return () => { window.removeEventListener("resize", f); window.removeEventListener("scroll", f, true); };
  }, [open, place]);
  const toggle = () => { if (!open) place(); setOpen((o) => !o); };
  return { open, setOpen, ref, pos, toggle };
}

/* ---- field-mode wrapper (trigger + popover) ------------------------------ */
export function ColorField(props: ColorPickerProps) {
  const showAlpha = typeof props.alpha === "number";
  // preset pills + recent row make the panel tall; reserve room so it flips up when needed
  const panelH = showAlpha ? 500 : 444;
  const { open, setOpen, ref, pos, toggle } = kspUsePopover(panelH);
  const rgb = kspHexToRgb(props.value);
  const fill = `rgba(${rgb.r},${rgb.g},${rgb.b},${showAlpha ? props.alpha! / 100 : 1})`;
  return (
    <span className="ksp ksp-anchor">
      <button type="button" ref={ref} className={"ksp-field" + (open ? " open" : "")} onClick={toggle}>
        <span className="ksp-field-sw"><span className="ksp-chip-fill" style={{ background: fill }} /></span>
        <span className="ksp-field-val mono">{String(props.value).toUpperCase()}</span>
        <span className="ksp-caret">{kspIcon("chev", 14)}</span>
      </button>
      {open && pos && (
        <>
          <span className="ksp-backdrop" onClick={() => setOpen(false)} />
          <span className={"ksp-pop fixed" + (pos.up ? " up" : "")} style={{ top: pos.top, left: pos.left }}>
            <ColorPanel {...props} flat />
          </span>
        </>
      )}
    </span>
  );
}

export function ColorPicker(props: ColorPickerProps) {
  return props.mode === "field" ? <ColorField {...props} /> : <ColorPanel {...props} />;
}
