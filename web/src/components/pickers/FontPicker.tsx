// FontPicker.tsx — Karaoke Subtitle Studio
// Ported from design-system/handoff-pickers/components/FontPicker.jsx.txt →
// TS/React. Logic, markup and ksp* classes reproduced as directly as possible.
// Adaptations: typed props (FontPicker.d.ts), named hook imports, and the
// custom-font upload path now ALSO uploads to the daemon (POST /api/fonts/upload)
// so an uploaded face actually burns at render time — not just FontFace preview.

import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { fonts as fontsApi } from "../../api/client";

// Curated caption-friendly faces. The Google ones are loaded by pickers.css;
// the rest are web-safe. `cat` is just a tiny descriptor shown in the row.
export interface FontOption { name: string; cat?: string; }
export const KSP_FONTS: FontOption[] = [
  { name: "Space Grotesk", cat: "brand" },
  { name: "Anton", cat: "display" },
  { name: "Bebas Neue", cat: "condensed" },
  { name: "Oswald", cat: "condensed" },
  { name: "Montserrat", cat: "geometric" },
  { name: "Archivo Black", cat: "heavy" },
  { name: "Hanken Grotesk", cat: "clean" },
  { name: "Impact", cat: "classic" },
  { name: "Georgia", cat: "serif" },
  { name: "Courier New", cat: "mono" },
  // RTL-friendly defaults (Hebrew/Arabic coverage). Names only — they may or may
  // not be installed on the render host; that's fine (passive suggestion).
  { name: "Heebo", cat: "hebrew" },
  { name: "Noto Sans Hebrew", cat: "hebrew" },
  { name: "Noto Sans Arabic", cat: "arabic" },
];

type FIconName = "search" | "check" | "chev" | "type" | "bold" | "italic" | "underline" | "upload" | "x";
function kspFIcon(name: FIconName, size?: number) {
  const p = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    type: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    italic: '<line x1="19" y1="5" x2="11" y2="5"/><line x1="13" y1="19" x2="5" y2="19"/><line x1="15" y1="5" x2="9" y2="19"/>',
    underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4"/><line x1="5" y1="20" x2="19" y2="20"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/>',
    x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  }[name];
  return (
    <svg width={size || 14} height={size || 14} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: p }} />
  );
}

/* ---- uploaded fonts (shared, persisted, FontFace-registered) -------------- */
// A custom font dropped in here is registered with the FontFace API on the whole
// document — so it renders in every picker preview AND in the live caption stage.
// Persisted as data URLs in localStorage and re-registered on load.
const KSP_FONTS_KEY = "kss.customFonts";
export function kspLoadFontFace(family: string, url: string): Promise<FontFace> {
  if (!family || !url || typeof window.FontFace !== "function") return Promise.reject();
  try {
    const ff = new window.FontFace(family, "url(" + url + ")");
    return ff.load().then((f) => { document.fonts.add(f); return f; });
  } catch (e) { return Promise.reject(e); }
}
function kspFamilyFromFile(filename: string): string {
  const n = String(filename || "").replace(/\.(ttf|otf|woff2?|ttc)$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return n || "Custom Font";
}

interface StoredFont { name: string; url: string; cat?: string; }
export const kspFontStore = (() => {
  let list: StoredFont[] = [];
  try { const raw = window.localStorage.getItem(KSP_FONTS_KEY); if (raw) list = JSON.parse(raw) || []; } catch { /* ignore */ }
  list.forEach((f) => kspLoadFontFace(f.name, f.url).catch(() => { /* ignore */ })); // re-register persisted faces
  const subs = new Set<(l: StoredFont[]) => void>();
  const save = () => { try { window.localStorage.setItem(KSP_FONTS_KEY, JSON.stringify(list)); } catch { /* ignore */ } };
  return {
    get: () => list,
    add(name: string, url: string) {
      list = [{ name, url, cat: "custom" }, ...list.filter((f) => f.name !== name)];
      save(); subs.forEach((fn) => fn(list));
    },
    remove(name: string) { list = list.filter((f) => f.name !== name); save(); subs.forEach((fn) => fn(list)); },
    subscribe(fn: (l: StoredFont[]) => void) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
})();
function kspUseUploadedFonts(): StoredFont[] {
  const [list, setList] = useState<StoredFont[]>(kspFontStore.get());
  useEffect(() => kspFontStore.subscribe(setList), []);
  return list;
}

interface ListFont { name: string; cat?: string; custom?: boolean; }
function kspFontList(fonts?: (string | FontOption)[]): ListFont[] {
  if (!fonts || !fonts.length) return KSP_FONTS;
  return fonts.map((f) => (typeof f === "string" ? { name: f, cat: "" } : f));
}

export interface FontPickerProps {
  value: string;
  onChange: (font: string) => void;
  fonts?: (string | FontOption)[];
  previewText?: string;
  color?: string;
  label?: string;
  search?: boolean;
  typo?: { bold?: boolean; italic?: boolean; underline?: boolean };
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  onTypo?: (key: "bold" | "italic" | "underline", value: boolean) => void;
  allowUpload?: boolean;
  onUploadFont?: (font: { name: string; file: File }) => void;
  mode?: "panel" | "field";
  align?: "left" | "right";
  up?: boolean;
  flat?: boolean;
  /** Show a passive RTL coverage hint (set when the project text_direction is
   *  RTL). Full glyph-coverage detection is out of scope — this just nudges the
   *  user toward an RTL-covering face. */
  rtlHint?: boolean;
}

// normalize the typography-flags contract (bold / italic / underline)
function kspTypo(props: Pick<FontPickerProps, "typo" | "bold" | "italic" | "underline">) {
  const t = props.typo || {};
  return {
    bold: props.bold != null ? !!props.bold : !!t.bold,
    italic: props.italic != null ? !!props.italic : !!t.italic,
    underline: props.underline != null ? !!props.underline : !!t.underline,
  };
}

function TypoToggles({ typo, onTypo }: { typo: ReturnType<typeof kspTypo>; onTypo?: FontPickerProps["onTypo"] }) {
  if (!onTypo) return null;
  const flags: [keyof ReturnType<typeof kspTypo>, string][] = [["bold", "Bold"], ["italic", "Italic"], ["underline", "Underline"]];
  return (
    <div className="ksp-typo" role="group" aria-label="Type style">
      {flags.map(([k, label]) => (
        <button key={k} type="button" title={label} aria-pressed={!!typo[k]}
          className={"ksp-typo-btn" + (typo[k] ? " on" : "")}
          onClick={() => onTypo(k, !typo[k])}>{kspFIcon(k as FIconName, 15)}</button>
      ))}
    </div>
  );
}

export function FontPanel({ value, onChange, fonts, previewText, color, label, search = true, flat, onTypo, allowUpload = true, onUploadFont, rtlHint, ...rest }: FontPickerProps) {
  const uploaded = kspUseUploadedFonts();
  const base = kspFontList(fonts);
  const list: ListFont[] = base.slice();
  uploaded.forEach((u) => { if (!list.some((f) => f.name === u.name)) list.push({ name: u.name, cat: u.cat || "custom", custom: true }); });
  const typo = kspTypo({ onTypo, ...rest } as FontPickerProps);
  const [q, setQ] = useState("");
  const filtered = q ? list.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())) : list;

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Per-uploaded-family burn-confirm hint state: "uploading" while the daemon POST
  // is in flight, "preview" if it failed (preview-only, won't burn), null when the
  // daemon confirmed persistence (it WILL burn — drop the hint).
  const [hint, setHint] = useState<null | "uploading" | "preview">(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setErr(null); setBusy(true); setHint(null);
    const family = kspFamilyFromFile(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      kspLoadFontFace(family, reader.result as string).then(() => {
        kspFontStore.add(family, reader.result as string);
        setBusy(false); onChange(family);
        if (onUploadFont) onUploadFont({ name: family, file });
        // Also upload to the daemon so the face burns at render time. Show a
        // transient "uploading…" then drop the hint on success; keep preview +
        // show the "install on render host" hint if the upload fails.
        setHint("uploading");
        fontsApi.upload(file, family)
          .then(() => setHint(null))
          .catch(() => setHint("preview"));
      }).catch(() => { setBusy(false); setErr("Couldn’t load that font file."); });
    };
    reader.onerror = () => { setBusy(false); setErr("Couldn’t read that file."); };
    reader.readAsDataURL(file);
  };
  const removeFont = (name: string) => {
    kspFontStore.remove(name);
    fontsApi.remove(name).catch(() => { /* daemon may not have it; local removal still applies */ });
    if (value === name && base[0]) onChange(base[0].name);
  };

  const capStyle: React.CSSProperties = {
    fontFamily: value, color: color || "#fff",
    fontWeight: typo.bold ? 800 : 600,
    fontStyle: typo.italic ? "italic" : "normal",
    textDecoration: typo.underline ? "underline" : "none",
    textUnderlineOffset: "0.12em",
  };
  // list rows echo weight + slant so you read the actual face (underline stays off — too noisy per row)
  const rowFace = (f: ListFont): React.CSSProperties => ({ fontFamily: f.name, fontWeight: typo.bold ? 700 : 500, fontStyle: typo.italic ? "italic" : "normal" });

  return (
    <div className="ksp ksp-font">
      <div className={"ksp-panel ksp-fpanel" + (flat ? " flat" : "")}>
        <div className="ksp-head">{kspFIcon("type", 13)}{label || "Font"}<span className="ksp-tag">{value}</span></div>

        <div className="ksp-preview">
          <span className="ksp-pv-label">preview</span>
          <span className="ksp-cap" style={capStyle}>{previewText || "Karaoke"}</span>
        </div>

        <TypoToggles typo={typo} onTypo={onTypo} />

        {rtlHint && (
          <div className="ksp-rtl-hint">pick an RTL-covering font (e.g. Heebo, Noto Sans Hebrew/Arabic)</div>
        )}

        {search && (
          <div className="ksp-search">
            {kspFIcon("search", 14)}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fonts" spellCheck={false} />
          </div>
        )}

        {allowUpload && (
          <div className="ksp-upload">
            <button type="button" className="ksp-upload-btn" disabled={busy}
              onClick={() => fileRef.current && fileRef.current.click()}>
              {kspFIcon("upload", 14)}{busy ? "Loading font…" : "Upload custom font"}
            </button>
            <input ref={fileRef} type="file" hidden onChange={onFile}
              accept=".ttf,.otf,.woff,.woff2,.ttc,font/ttf,font/otf,font/woff,font/woff2" />
            {err
              ? <div className="ksp-upload-note err">{err}</div>
              : hint === "uploading"
                ? <div className="ksp-upload-note">uploading…</div>
                : hint === "preview"
                  ? <div className="ksp-upload-note err">preview only · install on render host to burn</div>
                  : <div className="ksp-upload-note">.ttf · .otf · .woff · .woff2</div>}
          </div>
        )}

        <div className="ksp-list">
          {filtered.map((f) => (
            <button key={f.name} type="button" className={"ksp-fitem" + (f.name === value ? " on" : "")} onClick={() => onChange(f.name)}>
              <span className="ksp-fname" style={rowFace(f)}>{f.name}</span>
              {f.cat ? <span className="ksp-fmeta">{f.cat}</span> : null}
              {f.custom
                ? <span className="ksp-frm" role="button" title="Remove custom font"
                    onClick={(e) => { e.stopPropagation(); removeFont(f.name); }}>{kspFIcon("x", 13)}</span>
                : <span className="ksp-check">{kspFIcon("check", 15)}</span>}
            </button>
          ))}
          {!filtered.length && <div className="ksp-empty">No fonts match “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}

interface PopState { left: number; top: number; up: boolean; }
function kspUsePopoverF(panelH?: number) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<PopState | null>(null);
  const place = React.useCallback(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const PW = 304, PH = panelH || 420, gap = 6;
    let left = r.left;
    if (left + PW > window.innerWidth - 8) left = Math.max(8, r.right - PW);
    let top = r.bottom + gap, up = false;
    if (top + PH > window.innerHeight - 8 && r.top - gap - PH > 8) { top = r.top - gap - PH; up = true; }
    top = Math.max(8, Math.min(top, window.innerHeight - PH - 8));
    setPos({ left, top, up });
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

export function FontField(props: FontPickerProps) {
  const extra = props.allowUpload === false ? 0 : 66;
  const { open, setOpen, ref, pos, toggle } = kspUsePopoverF((props.onTypo ? 488 : 440) + extra);
  const typo = kspTypo(props);
  const valStyle: React.CSSProperties = {
    fontFamily: props.value,
    fontWeight: typo.bold ? 700 : 500,
    fontStyle: typo.italic ? "italic" : "normal",
    textDecoration: typo.underline ? "underline" : "none",
  };
  return (
    <span className="ksp ksp-anchor">
      <button type="button" ref={ref} className={"ksp-field" + (open ? " open" : "")} onClick={toggle}>
        <span className="ksp-field-val" style={valStyle}>{props.value}</span>
        <span className="ksp-caret">{kspFIcon("chev", 14)}</span>
      </button>
      {open && pos && createPortal(
        // Portal the fixed popover to <body> so it is immune to ancestor
        // opacity/filter/transform/overflow — e.g. the inherited-row dim
        // (`.prow.inh { opacity }`) used to flatten it (the transparency bug).
        <>
          <span className="ksp-backdrop" onClick={() => setOpen(false)} />
          <span className={"ksp-pop fixed" + (pos.up ? " up" : "")} style={{ top: pos.top, left: pos.left }}>
            <FontPanel {...props} flat />
          </span>
        </>,
        document.body,
      )}
    </span>
  );
}

export function FontPicker(props: FontPickerProps) {
  return props.mode === "field" ? <FontField {...props} /> : <FontPanel {...props} />;
}
