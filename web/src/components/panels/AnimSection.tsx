// AnimSection.tsx — the Inspector animations block (append-override model).
// Ported from ui_kits/desktop-app/anims.jsx (kit zip 13). One append-style tier
// per scope (GLOBAL base / GROUP / CUE). Each tier:
//   - a collapsible per-tier timeline PREVIEW (representative cue, type-coded strips)
//   - own rows (.ov-row.anim-ov): the whole line toggles an inline edit panel
//     (rotating chevron) → mini-preview + Enabled + TimingModePicker + either the
//     free-form CustomEditor (custom anims) or the SegmentTiming window (presets)
//   - inherited rows: a clickable REDIRECT (») that opens the anim in its owning tier
//   - tombstone rows: "removed here" + restore ↺
//   - ＋ Add animation ▾ → preset grid (8 presets + a ＋ Custom tile); adding ANY
//     animation opens its row expanded. Add-row on every tier incl. global.
//
// Custom animations carry `custom: true` + a real timing mode; the editor controls
// live inside the row (controlled CustomEditor → onEditCustom rebuilds the records).
// Color values reuse the shared DS ColorPicker (mode="field").
//
// Dispatch contract (handlers wired by Editor):
//   onAdd / onRemove / onRestore / onSetProps / onEditCustom / onSelectCues
import { useState, useEffect, useRef, useCallback } from "react";
import { Icon } from "../icons/Icon";
import { TimingModePicker } from "./TimingModePicker";
import { ColorPicker } from "../pickers/ColorPicker";
import { EditableNum } from "../controls/EditableNum";
import type { Project, Animation, AnimChannel, AnimTime, AnimSegment } from "../../types";
import { globalRows, groupRows, cueRows, inheritedCount, type AnimRow } from "../../model/animRows";
import { PRESETS, buildPreset, freshAnimId, type PresetKey } from "../../model/animPresets";
import {
  CUSTOM_CHANNELS, CB_EASE, DEFAULT_CUSTOM, isCustomAnim, buildCustom, customCfgOf,
  anchorSec, type CustomCfg, type CustomChannel,
} from "../../model/animCustom";

export type AnimScope = "global" | "group" | "cue";

/** The shared "open animation" across tiers: scope it belongs to + lead id + a
 *  nonce bumped on each open so the focus-scroll + flash re-fire on re-open. */
interface OpenState { scope: AnimScope | "global" | "group" | "tag"; id: string; nonce: number; }

export interface AnimSectionProps {
  project: Project;
  scope: AnimScope | null;
  gi: number | null;
  /** selected cue word id (CUE scope only). */
  selWid: number | null;
  onAdd: (scope: AnimScope, ref: number | number[] | null, anim: Animation) => void;
  onRemove: (scope: AnimScope, ref: number | number[] | null, anim_id: string) => void;
  onRestore: (scope: AnimScope, ref: number | number[] | null, anim_id: string) => void;
  onSetProps: (scope: AnimScope, ref: number | number[] | null, anim_id: string, partial: Record<string, unknown>) => void;
  /** rebuild a custom animation's records from the editor cfg (preserves lead id). */
  onEditCustom: (scope: AnimScope, ref: number | number[] | null, anim_id: string, cfg: CustomCfg) => void;
  /** select all cues a tag spans (the "N cues" chip). */
  onSelectCues: (ids: number[]) => void;
}

// ---- ref for a tier scope (the dispatch's `ref` arg) ----
function refFor(tierScope: AnimScope, gi: number | null, selWid: number | null, row?: AnimRow): number | number[] | null {
  if (tierScope === "global") return null;
  // group tier is gated on gi != null upstream; null here is unreachable but we
  // return null (a no-op ref) rather than ever resolving to layout[0].
  if (tierScope === "group") return gi != null ? gi : null;
  if (row?.tag) return [...row.tag.ids];
  return selWid != null ? [selWid] : [];
}

function tierLabel(tierScope: AnimScope, project: Project, gi: number | null, selWid: number | null): string {
  if (tierScope === "global") return "defaults";
  if (tierScope === "group") return gi != null ? (project.layout[gi]?.label ?? "") : "";
  return selWid != null ? `"${project.words[selWid]?.text ?? ""}"` : "";
}

interface StyleCtx { text: string; font?: string; fill?: string; }

// ════════════════════ preview strip geometry (representative cue) ════════════════════
const CH_COLOR: Record<string, string> = {
  alpha: "#3DE0FF", karaoke_fill: "#FFC24D", primary: "#FF3DA6", outline: "#9AA3B2",
  scale_x: "#8A5BFF", scale_y: "#8A5BFF", fontsize: "#8A5BFF",
  clip_rect: "#4DE0C2", blur: "#5AA0FF", move: "#FF8A3D",
  shear_x: "#8A5BFF", rot_z: "#FF8A3D", spacing: "#9AA3B2", border_w: "#9AA3B2",
};
const apColor = (ch: string): string => CH_COLOR[ch] || "#3DE0FF";
const CH_TYPE: Record<string, string> = {
  alpha: "alpha", karaoke_fill: "wipe", primary: "color", outline: "color",
  scale_x: "size", scale_y: "size", fontsize: "size",
  clip_rect: "type", blur: "glow", move: "move",
};
function apStripStyle(channel: string, seg: Partial<AnimSegment>): React.CSSProperties {
  const c = apColor(channel);
  switch (CH_TYPE[channel] || "bar") {
    case "color": {
      const from = (typeof seg.from === "string" && /^#/.test(seg.from)) ? seg.from : "#FFFFFF";
      const to = (typeof seg.to === "string" && /^#/.test(seg.to)) ? seg.to : c;
      return { background: `linear-gradient(90deg, ${from}, ${to})` };
    }
    case "alpha": {
      const isIn = String(seg.from).toUpperCase() === "FF";
      return { background: isIn ? `linear-gradient(90deg, ${c}22, ${c})` : `linear-gradient(90deg, ${c}, ${c}22)` };
    }
    case "wipe": return { background: `linear-gradient(90deg, ${c}, ${c} 55%, ${c}33 55%)` };
    case "size": return { background: `linear-gradient(90deg, ${c}33, ${c})`, clipPath: "polygon(0 100%,100% 0,100% 100%)" };
    case "type": return { background: `repeating-linear-gradient(90deg, ${c} 0 3px, ${c}33 3px 6px)` };
    case "glow": return { background: `radial-gradient(120% 180% at 60% 50%, ${c}, ${c}22 70%, transparent)` };
    case "move": return { background: `linear-gradient(90deg, ${c}11, ${c})` };
    default: return { background: c };
  }
}
const NOMINAL_CUE = 1.0; // seconds — the representative cue the preview lays out against
const SPAN: [number, number] = [0, NOMINAL_CUE];

const apSgn = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n);
function apTiming(seg: Partial<AnimSegment> | undefined): string {
  if (!seg || !seg.t0) return "";
  const t0 = seg.t0, t1 = seg.t1 || seg.t0;
  const base0 = /_end$/.test(t0.anchor) ? "end" : "start";
  const base1 = /_end$/.test(t1.anchor) ? "end" : "start";
  const unit = (t0.unit === "frac" || t1.unit === "frac") ? "%" : "ms";
  const v = (t: AnimTime) => (t.unit === "frac" ? Math.round((t.offset || 0) * 100) : (t.offset || 0));
  const v0 = v(t0), v1 = v(t1);
  if (base0 === base1) {
    if (v0 === v1) return base0 + (v0 ? " " + apSgn(v0) + unit : "");
    if (v0 === 0) return base0 + " +" + Math.abs(v1) + unit;
    return base0 + " " + apSgn(v0) + "→" + apSgn(v1) + unit;
  }
  return base0 + (v0 ? " " + apSgn(v0) + unit : "") + "→" + base1 + (v1 ? " " + apSgn(v1) + unit : "");
}

interface ApItem { anim: Animation; s: number; e: number; seg: Partial<AnimSegment>; }
interface ApBounds { items: ApItem[]; pct: (t: number) => number; cueL: number; cueW: number; }
function apBounds(animList: Animation[]): ApBounds {
  const items: ApItem[] = animList.map((a) => {
    let s = Infinity, e = -Infinity;
    for (const g of a?.segments ?? []) {
      const x = anchorSec(SPAN, g.t0), y = anchorSec(SPAN, g.t1);
      s = Math.min(s, x, y); e = Math.max(e, x, y);
    }
    if (!isFinite(s)) { s = 0; e = NOMINAL_CUE; }
    return { anim: a, s, e, seg: (a?.segments ?? [])[0] || {} };
  });
  let lo = 0, hi = NOMINAL_CUE;
  for (const i of items) { lo = Math.min(lo, i.s); hi = Math.max(hi, i.e); }
  const pad = Math.max(0.04, (hi - lo) * 0.06);
  const T0 = lo - pad, T1 = hi + pad, W = (T1 - T0) || 1;
  const pct = (t: number) => ((t - T0) / W) * 100;
  return { items, pct, cueL: pct(0), cueW: pct(NOMINAL_CUE) - pct(0) };
}

// ════════════════════ CustomEditor (controlled, in-row) ════════════════════
function CustomEditor({ cfg, onChange, ctx }: { cfg: CustomCfg; onChange: (cfg: CustomCfg) => void; ctx: StyleCtx }) {
  const meta: CustomChannel = CUSTOM_CHANNELS.find((m) => m.ch === cfg.ch) ?? CUSTOM_CHANNELS[0];
  const set = (patch: Partial<CustomCfg>) => onChange({ ...cfg, ...patch });
  const pickCh = (c: AnimChannel) => {
    const m = CUSTOM_CHANNELS.find((x) => x.ch === c) ?? CUSTOM_CHANNELS[0];
    onChange({ ...cfg, ch: c, value: m.def });
  };
  const bumpOff = (d: number) => set({ offset: cfg.offset + d * 10 });
  const bumpVal = (d: number) => {
    let v = (Number(cfg.value) || 0) + d * (meta.step || 1);
    if (meta.min != null) v = Math.max(meta.min, v);
    if (meta.max != null) v = Math.min(meta.max, v);
    set({ value: +v.toFixed(2) });
  };
  const offLabel = (cfg.anchor === "cue_start" ? "Start " : "End ") + (cfg.offset >= 0 ? "+" : "−") + Math.abs(cfg.offset) + " ms";
  return (
    <div className="custom-editor">
      <div className="cb-row">
        <span className="cb-l" title="Which style property changes — fill/outline color, size, scale, slant (faux-italic), blur, outline width, rotate, or letter spacing.">Property</span>
        <span className="cb-select-wrap">
          <select className="cb-select" value={cfg.ch} onChange={(e) => pickCh(e.target.value as AnimChannel)}>
            {CUSTOM_CHANNELS.map((m) => <option key={m.ch} value={m.ch}>{m.label}</option>)}
          </select>
          <Icon name="chevDown" size={12} />
        </span>
      </div>
      <div className="cb-row">
        <span className="cb-l" title="When the change happens, measured from the cue's Start or End plus an offset in milliseconds.">When</span>
        <span className="cb-seg" title="Anchor the time to the cue's Start or End.">
          <button type="button" className={cfg.anchor === "cue_start" ? "on" : ""} onClick={() => set({ anchor: "cue_start" })}>Start</button>
          <button type="button" className={cfg.anchor === "cue_end" ? "on" : ""} onClick={() => set({ anchor: "cue_end" })}>End</button>
        </span>
        <span className="cb-step" title="Offset from the anchor. Negative = before, positive = after (e.g. End -30 ms = 30 ms before the cue ends).">
          <span className="pm" onClick={() => bumpOff(-1)}>−</span>
          <EditableNum
            display={(cfg.offset >= 0 ? "+" : "−") + Math.abs(cfg.offset) + " ms"} value={cfg.offset} step={10}
            parse={(s) => { const n = parseFloat(s); return isNaN(n) ? null : Math.round(n); }}
            onCommit={(n) => set({ offset: n })}
          />
          <span className="pm" onClick={() => bumpOff(1)}>+</span>
        </span>
      </div>
      <div className="cb-row">
        <span className="cb-l" title="The target value the property animates to (the color, size, angle, etc. it reaches).">Value</span>
        {meta.kind === "color"
          ? (
            <span className="cb-cp">
              <ColorPicker
                mode="field" align="right" value={String(cfg.value).toUpperCase()} label={meta.label}
                previewText={ctx.text || "Karaoke"} previewFont={ctx.font}
                previewRole={meta.ch === "outline" ? "outline" : "fill"} previewFill={ctx.fill}
                onChange={(c) => set({ value: c.toUpperCase() })}
              />
            </span>
          )
          : (
            <span className="cb-step">
              <span className="pm" onClick={() => bumpVal(-1)}>−</span>
              <EditableNum
                display={String(cfg.value) + (meta.unit ?? "")} value={Number(cfg.value)} step={meta.step || 1}
                parse={(s) => { let n = parseFloat(s); if (isNaN(n)) return null; if (meta.min != null) n = Math.max(meta.min, n); if (meta.max != null) n = Math.min(meta.max, n); return +n.toFixed(2); }}
                onCommit={(n) => set({ value: n })}
              />
              <span className="pm" onClick={() => bumpVal(1)}>+</span>
            </span>
          )}
      </div>
      <div className="cb-row">
        <span className="cb-l" title="How the value is reached: Snap changes it instantly at that time; Ramp eases into it over a duration.">Transition</span>
        <span className="cb-seg" title="Snap = instant change; Ramp = eased over a duration.">
          <button type="button" className={cfg.mode === "snap" ? "on" : ""} onClick={() => set({ mode: "snap" })}>Snap</button>
          <button type="button" className={cfg.mode === "ramp" ? "on" : ""} onClick={() => set({ mode: "ramp" })}>Ramp</button>
        </span>
        {cfg.mode === "ramp" && (
          <>
            <span className="cb-step" title="How long the ramp takes, in milliseconds.">
              <span className="pm" onClick={() => set({ dur: Math.max(0, cfg.dur - 50) })}>−</span>
              <EditableNum display={cfg.dur + " ms"} value={cfg.dur} step={50}
                parse={(s) => { const n = parseFloat(s); return isNaN(n) ? null : Math.max(0, Math.round(n)); }}
                onCommit={(n) => set({ dur: n })} />
              <span className="pm" onClick={() => set({ dur: cfg.dur + 50 })}>+</span>
            </span>
            <span className="cb-select-wrap sm" title="Easing curve for the ramp: Linear = constant speed; Decelerate = fast then slow (ease-out); Accelerate = slow then fast (ease-in).">
              <select className="cb-select" value={cfg.ease} onChange={(e) => set({ ease: e.target.value as CustomCfg["ease"] })}>
                {Object.keys(CB_EASE).map((k) => <option key={k} value={k}>{CB_EASE[k as keyof typeof CB_EASE]}</option>)}
              </select>
              <Icon name="chevDown" size={12} />
            </span>
          </>
        )}
      </div>
      <div className="cb-foot">
        <span className="cb-preview">
          <i className="cb-dot" style={{ background: meta.kind === "color" ? String(cfg.value) : "var(--cyan)" }} />
          {meta.tag} · {offLabel}{meta.kind === "color" ? "" : " → " + cfg.value + (meta.unit ?? "")}{cfg.mode === "ramp" ? " · " + cfg.dur + "ms" : ""}
        </span>
      </div>
    </div>
  );
}

// ════════════════════ SegmentTiming (preset timing window) ════════════════════
function SegmentTiming({ anim, onChange }: { anim: Animation; onChange: (partial: Record<string, unknown>) => void }) {
  const seg = anim.segments?.[0] ?? ({} as AnimSegment);
  const t0: AnimTime = seg.t0 ?? { anchor: "cue_start", offset: 0, unit: "ms" };
  const t1: AnimTime = seg.t1 ?? { anchor: "cue_start", offset: 0, unit: "ms" };
  const setPt = (key: "t0" | "t1", patch: Partial<AnimTime>) => {
    const nt0 = key === "t0" ? { ...t0, ...patch } : t0;
    const nt1 = key === "t1" ? { ...t1, ...patch } : t1;
    onChange({ segments: [{ ...seg, t0: nt0, t1: nt1 }, ...(anim.segments ?? []).slice(1)] });
  };
  // a render FUNCTION (not a nested component) so the live input is not remounted
  // on a re-render mid-edit (focus-loss guard, per HANDOFF).
  const pointRow = (label: string, t: AnimTime, k: "t0" | "t1") => {
    const frac = t.unit === "frac";
    const unit = frac ? "%" : "ms";
    const val = frac ? Math.round((t.offset || 0) * 100) : Math.round(t.offset || 0);
    const bump = (d: number) => setPt(k, { offset: frac ? +(((t.offset || 0) + d * 0.05).toFixed(2)) : (t.offset || 0) + d * 10 });
    const isEnd = /_end$/.test(t.anchor);
    return (
      <div className="cb-row" key={k}>
        <span className="cb-l" title="Where this point sits: anchored to the cue's Start or End, plus an offset.">{label}</span>
        <span className="cb-seg" title="Anchor to the cue's Start or End.">
          <button type="button" className={!isEnd ? "on" : ""} onClick={() => setPt(k, { anchor: "cue_start" })}>Start</button>
          <button type="button" className={isEnd ? "on" : ""} onClick={() => setPt(k, { anchor: "cue_end" })}>End</button>
        </span>
        <span className="cb-step" title="Offset from the anchor. Negative = before, positive = after.">
          <span className="pm" onClick={() => bump(-1)}>−</span>
          <EditableNum display={(val >= 0 ? "+" : "−") + Math.abs(val) + " " + unit} value={val} step={frac ? 5 : 10}
            parse={(s) => { const n = parseFloat(s); if (isNaN(n)) return null; return frac ? +(n / 100).toFixed(2) : Math.round(n); }}
            onCommit={(n) => setPt(k, { offset: n })} />
          <span className="pm" onClick={() => bump(1)}>+</span>
        </span>
      </div>
    );
  };
  const durMs = Math.round((anchorSec(SPAN, t1) - anchorSec(SPAN, t0)) * 1000);
  return (
    <div className="seg-timing">
      <div className="ce-h"><Icon name="clock" size={11} />Timing window<span className="st-dur">{durMs === 0 ? "instant" : (durMs > 0 ? durMs + "ms" : "ends before start")}</span></div>
      {pointRow("From", t0, "t0")}
      {pointRow("To", t1, "t1")}
    </div>
  );
}

// ════════════════════ previews ════════════════════
const AP_MAX = 3, AP_ROWH = 15, AP_GAP = 3;
function AnimPreview({ rows, tierScope, open, onFocus }: {
  rows: AnimRow[]; tierScope: AnimScope; open: OpenState | null;
  onFocus: (owner: OpenState["scope"], id: string) => void;
}) {
  const all = rows.filter((r) => r.kind !== "tombstone" && r.anim);
  const [collapsed, setCollapsed] = useState(false);
  const [stackExp, setStackExp] = useState(false);
  const { items, pct, cueL, cueW } = apBounds(all.map((r) => r.anim));
  const lanes = items.map((it, i) => ({ ...it, r: all[i] }));
  const ownerOf = (r: AnimRow): OpenState["scope"] => (r.kind === "own" ? tierScope : r.src);
  const overflow = lanes.length > AP_MAX && !stackExp;
  const shown = overflow ? lanes.slice(0, AP_MAX - 1) : lanes;
  const hidden = overflow ? lanes.slice(AP_MAX - 1) : [];
  const rowCount = Math.max(1, overflow ? AP_MAX : lanes.length);
  const stageH = rowCount * AP_ROWH + 4;
  const barTop = (i: number) => 2 + i * AP_ROWH;
  const barH = AP_ROWH - AP_GAP;
  return (
    <div className={"anim-preview" + (collapsed ? " collapsed" : "")} style={{ "--cue-l": cueL + "%", "--cue-w": cueW + "%" } as React.CSSProperties}>
      <button type="button" className="ap-h" onClick={() => setCollapsed((c) => !c)} title={collapsed ? "Show preview" : "Hide preview"}>
        <span className="ap-chev"><Icon name="chevDown" size={11} stroke={2} /></span>
        <Icon name="clock" size={11} />Preview
        <span className="ap-count">{lanes.length || "none"}</span>
        <span className="ap-hint">representative cue · click a strip to focus</span>
      </button>
      {!collapsed && (
        <div className="ap-stage" style={{ height: stageH + "px" }}>
          <span className="ap-cue"><span className="ap-cue-l">cue</span></span>
          {lanes.length === 0 && <span className="ap-none">no animations on this {tierScope === "cue" ? "cue" : tierScope}</span>}
          {shown.map((l, i) => {
            const owner = ownerOf(l.r);
            const foc = !!open && open.scope === owner && open.id === l.r.id;
            const c = apColor(l.r.channel);
            return (
              <button key={l.r.id} type="button"
                className={"ap-bar k-" + l.r.kind + (foc ? " foc" : "") + (l.r.anim.enabled === false ? " off" : "")}
                style={{ left: pct(l.s) + "%", width: Math.max(0, pct(l.e) - pct(l.s)) + "%", top: barTop(i) + "px", height: barH + "px", "--ch": c, ...apStripStyle(l.r.channel, l.seg) } as React.CSSProperties}
                title={l.r.name.replace(/_/g, " ") + " · " + apTiming(l.seg) + (l.r.kind === "own" ? " · this " + tierScope : " · from " + l.r.src)}
                onClick={() => onFocus(owner, l.r.id)}>
                {l.r.kind !== "own" && <i className="ap-bar-src" />}
              </button>
            );
          })}
          {overflow && (() => {
            const oS = Math.min(...hidden.map((h) => h.s)), oE = Math.max(...hidden.map((h) => h.e));
            return (
              <button type="button" className="ap-bar ap-ovf" title={hidden.length + " more animations — click to expand"}
                style={{ left: pct(oS) + "%", width: Math.max(0, pct(oE) - pct(oS)) + "%", top: barTop(AP_MAX - 1) + "px", height: barH + "px" }}
                onClick={() => setStackExp(true)}><span className="ap-ovn">+{hidden.length}</span></button>
            );
          })()}
          {stackExp && lanes.length > AP_MAX && (
            <button type="button" className="ap-collapse" title="Collapse stack" onClick={() => setStackExp(false)}>✕</button>
          )}
        </div>
      )}
    </div>
  );
}

function AnimStripPreview({ anim }: { anim: Animation }) {
  const { items, pct, cueL, cueW } = apBounds([anim]);
  const it = items[0];
  return (
    <div className="ap-mini" style={{ "--cue-l": cueL + "%", "--cue-w": cueW + "%", "--ch": apColor(anim.channel) } as React.CSSProperties}>
      <span className="ap-mini-lbl">on cue</span>
      <span className="ap-mini-track">
        <span className="ap-mini-cue" />
        <span className="ap-mini-strip" style={{ left: pct(it.s) + "%", width: Math.max(0, pct(it.e) - pct(it.s)) + "%", ...apStripStyle(anim.channel, it.seg) }} />
      </span>
      <span className="ap-mini-t">{apTiming(it.seg)}</span>
    </div>
  );
}

// ════════════════════ rows ════════════════════
function PresetPicker({ tierScope, onPick, onCustom }: { tierScope: AnimScope; onPick: (k: PresetKey) => void; onCustom: () => void }) {
  return (
    <div className="preset-picker preset-row">
      {PRESETS.map((p) => {
        const disabled = !!p.groupGlobalOnly && tierScope === "cue";
        return (
          <button key={p.key} type="button" className="preset" disabled={disabled}
            title={disabled ? "Group-level only" : p.label} onClick={() => { if (!disabled) onPick(p.key); }}>
            <span className="pv-ic"><Icon name={p.icon} size={18} /></span>
            <span className="pv-nm">{p.label}</span>
          </button>
        );
      })}
      <button type="button" className="preset custom" title="Add a custom animation, then tune it in its details below" onClick={onCustom}>
        <span className="pv-ic"><Icon name="sliders" size={18} /></span>
        <span className="pv-nm">＋ Custom</span>
      </button>
    </div>
  );
}

interface RowHandlers {
  onRemove: AnimSectionProps["onRemove"];
  onSetProps: AnimSectionProps["onSetProps"];
  onEditCustom: AnimSectionProps["onEditCustom"];
  onSelectCues: AnimSectionProps["onSelectCues"];
}

function AnimOwnRow({
  row, tierScope, gi, selWid, editing, flashKey, ctx, onToggleEdit, onRemove, onSetProps, onEditCustom, onSelectCues,
}: {
  row: AnimRow; tierScope: AnimScope; gi: number | null; selWid: number | null; editing: boolean;
  flashKey: number; ctx: StyleCtx; onToggleEdit: () => void;
} & RowHandlers) {
  const ref = refFor(tierScope, gi, selWid, row);
  const custom = isCustomAnim(row.anim);
  return (
    <div className={"ov-row anim-ov" + (editing ? " editing" : "")}>
      {editing && flashKey ? <span key={flashKey} className="ov-flash" aria-hidden="true" /> : null}
      <div className="ov-line" onClick={onToggleEdit} title={editing ? "Collapse properties" : "Edit properties"}>
        <span className="ov-chev"><Icon name="chevDown" size={11} stroke={2} /></span>
        <span className="ov-ic cyan"><Icon name={custom ? "sliders" : "sparkles"} size={13} /></span>
        <span className="ov-main">
          <b>{row.name}</b>{custom && <span className="ov-sub custom-tag">custom</span>}
          {row.cueCount > 1 && (
            <button type="button" className="chip cues-chip" onClick={(e) => { e.stopPropagation(); if (row.tag) onSelectCues([...row.tag.ids]); }}>{row.cueCount} cues</button>
          )}
        </span>
        <button type="button" className="ov-act" title="Remove animation" aria-label="Remove animation" onClick={(e) => { e.stopPropagation(); onRemove(tierScope, ref, row.id); }}>✕</button>
      </div>
      {editing && (
        <div className="ov-edit">
          <AnimStripPreview anim={row.anim} />
          <button type="button" className={"en-toggle" + (row.anim.enabled ? " on" : "")} aria-label={row.anim.enabled ? "Disable" : "Enable"}
            onClick={() => onSetProps(tierScope, ref, row.id, { enabled: !row.anim.enabled })}>
            {row.anim.enabled ? "Enabled" : "Disabled"}
          </button>
          <TimingModePicker anim={row.anim} onChange={(partial) => onSetProps(tierScope, ref, row.id, partial)} />
          {custom ? (
            <div className="ce-block">
              <div className="ce-h"><Icon name="sliders" size={11} />Custom property</div>
              <CustomEditor cfg={customCfgOf(row.anim)} ctx={ctx} onChange={(cfg) => onEditCustom(tierScope, ref, row.id, cfg)} />
            </div>
          ) : (
            <SegmentTiming anim={row.anim} onChange={(partial) => onSetProps(tierScope, ref, row.id, partial)} />
          )}
        </div>
      )}
    </div>
  );
}

function AnimInheritedRow({
  row, tierScope, gi, selWid, onRemove, onRestore, onOpen,
}: {
  row: AnimRow; tierScope: AnimScope; gi: number | null; selWid: number | null;
  onRemove: AnimSectionProps["onRemove"]; onRestore: AnimSectionProps["onRestore"];
  onOpen: (src: AnimRow["src"], id: string) => void;
}) {
  const ref = refFor(tierScope, gi, selWid, row);
  if (row.kind === "tombstone") {
    return (
      <div className="ov-row tomb">
        <div className="ov-line">
          <span className="ov-ic"><Icon name="close" size={13} /></span>
          <span className="ov-main"><b>{row.name}</b> <span className="tomb-lbl">removed here</span></span>
          <button type="button" className="ov-act" title="Restore inherited" aria-label="Restore" onClick={() => onRestore(tierScope, ref, row.id)}>↺</button>
        </div>
      </div>
    );
  }
  return (
    <div className="ov-row inherited">
      <div className="ov-line clickable" title={"Edit in " + row.src + " — opens where it's defined"} onClick={() => onOpen(row.src, row.id)}>
        <span className="ov-ic"><Icon name="sparkles" size={13} /></span>
        <span className="ov-main"><b>{row.name}</b> <span className="ov-sub">{row.src}</span>
          <span className="ov-redir" title="Defined upstream — opens there"><Icon name="chevRight" size={11} stroke={2} /><Icon name="chevRight" size={11} stroke={2} /></span>
        </span>
        <button type="button" className="ov-act" title="Remove animation" aria-label="Remove animation" onClick={(e) => { e.stopPropagation(); onRemove(tierScope, ref, row.id); }}>✕</button>
      </div>
    </div>
  );
}

// ════════════════════ tier ════════════════════
function AnimTier({
  tierScope, project, gi, selWid, ctx, open, setOpen, onAdd, onRemove, onRestore, onSetProps, onEditCustom, onSelectCues,
}: {
  tierScope: AnimScope; project: Project; gi: number | null; selWid: number | null; ctx: StyleCtx;
  open: OpenState | null; setOpen: (next: { scope: OpenState["scope"]; id: string } | null) => void;
  onAdd: AnimSectionProps["onAdd"]; onRemove: AnimSectionProps["onRemove"]; onRestore: AnimSectionProps["onRestore"];
  onSetProps: AnimSectionProps["onSetProps"]; onEditCustom: AnimSectionProps["onEditCustom"]; onSelectCues: AnimSectionProps["onSelectCues"];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discOpen, setDiscOpen] = useState(false);
  const rows: AnimRow[] =
    tierScope === "global" ? globalRows(project)
    : tierScope === "group" ? groupRows(project, gi ?? -1)
    : cueRows(project, gi ?? -1, selWid ?? -1);
  const own = rows.filter((r) => r.kind === "own");
  const inherited = rows.filter((r) => r.kind !== "own");
  const tag = tierScope === "global" ? "GLOBAL" : tierScope === "group" ? "GROUP" : "CUE";
  const isGlobal = tierScope === "global";
  const isOpen = (id: string) => !!open && open.scope === tierScope && open.id === id;
  const toggleOpen = (id: string) => setOpen(isOpen(id) ? null : { scope: tierScope, id });

  const takenIds = (): Set<string> => {
    const s = new Set<string>();
    for (const a of project.globals.animations) s.add(a.id);
    for (const g of project.layout) for (const a of g.animations) s.add(a.id);
    for (const t of project.anim_tags) for (const a of t.anims) s.add(a.id);
    return s;
  };
  const addPreset = (key: PresetKey) => {
    setPickerOpen(false);
    const taken = takenIds();
    const next = () => { const id = freshAnimId(taken); taken.add(id); return id; };
    const recs = buildPreset(key, () => next());
    for (const rec of recs) onAdd(tierScope, refFor(tierScope, gi, selWid), rec);
    if (recs[0]) setOpen({ scope: tierScope, id: recs[0].id });
  };
  // ＋ Custom adds a sensible default immediately and opens its details — the free-form
  // controls live inside the row, not in a separate builder panel.
  const addCustom = () => {
    setPickerOpen(false);
    const taken = takenIds();
    const next = () => { const id = freshAnimId(taken); taken.add(id); return id; };
    const recs = buildCustom(DEFAULT_CUSTOM, next);
    for (const rec of recs) onAdd(tierScope, refFor(tierScope, gi, selWid), rec);
    if (recs[0]) setOpen({ scope: tierScope, id: recs[0].id });
  };
  const addBtn = (
    <>
      <div className="add-row">
        <button type="button" className="add-btn cyan" onClick={() => setPickerOpen((o) => !o)}>＋ Add animation <span className="caret">▾</span></button>
      </div>
      {pickerOpen && <PresetPicker tierScope={tierScope} onPick={addPreset} onCustom={addCustom} />}
    </>
  );
  return (
    <div className={"tier append " + tierScope} data-anim-tier={tierScope}>
      <div className="tier-h">
        <span className={"ttag " + tierScope}>{tag}</span>
        {tierLabel(tierScope, project, gi, selWid)}
      </div>
      <div className="tier-body">
        <AnimPreview rows={rows} tierScope={tierScope} open={open} onFocus={(owner, id) => setOpen({ scope: owner, id })} />
        {own.length === 0 && !isGlobal && (
          <div className="empty-row">Inherits everything from {tierScope === "cue" ? "group" : "global"}</div>
        )}
        {own.map((r) => (
          <AnimOwnRow
            key={r.id} row={r} tierScope={tierScope} gi={gi} selWid={selWid} ctx={ctx}
            editing={isOpen(r.id)} flashKey={isOpen(r.id) && open ? open.nonce : 0} onToggleEdit={() => toggleOpen(r.id)}
            onRemove={onRemove} onSetProps={onSetProps} onEditCustom={onEditCustom} onSelectCues={onSelectCues}
          />
        ))}
        {!isGlobal && (
          <>
            {addBtn}
            <button type="button" className="inh-disc" onClick={() => setDiscOpen((o) => !o)}>
              {discOpen ? "▾" : "▸"} Inherited ({inheritedCount(rows)})
            </button>
            {discOpen && inherited.map((r) => (
              <AnimInheritedRow key={r.src + r.id} row={r} tierScope={tierScope} gi={gi} selWid={selWid}
                onRemove={onRemove} onRestore={onRestore} onOpen={(src, id) => setOpen({ scope: src, id })} />
            ))}
          </>
        )}
        {isGlobal && addBtn}
      </div>
    </div>
  );
}

export function AnimSection({ project, scope, gi, selWid, onAdd, onRemove, onRestore, onSetProps, onEditCustom, onSelectCues }: AnimSectionProps) {
  // one "open animation" across all tiers: {scope, id, nonce}. Clicking an inherited
  // row sets it to the owning scope so the row expands where it's defined; the bumped
  // nonce both re-runs the focus-scroll and re-triggers the flash pulse.
  const [open, setOpenRaw] = useState<OpenState | null>(null);
  const setOpen = useCallback((next: { scope: OpenState["scope"]; id: string } | null) => {
    setOpenRaw((cur) => (next ? { scope: next.scope, id: next.id, nonce: (cur?.nonce ?? 0) + 1 } : null));
  }, []);
  const secRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !secRef.current) return;
    const raf = requestAnimationFrame(() => {
      const row = secRef.current?.querySelector(".anim-ov.editing") as HTMLElement | null;
      if (!row) return;
      let scroller = row.parentElement;
      while (scroller && scroller !== document.body) {
        const cs = getComputedStyle(scroller);
        if (/(auto|scroll)/.test(cs.overflowY) && scroller.scrollHeight > scroller.clientHeight + 2) break;
        scroller = scroller.parentElement;
      }
      if (!scroller || scroller === document.body) return;
      const r = row.getBoundingClientRect(), s = scroller.getBoundingClientRect();
      if (r.top < s.top + 12) scroller.scrollTop += (r.top - s.top) - 12;
      else if (r.bottom > s.bottom - 12) scroller.scrollTop += (r.bottom - s.bottom) + 12;
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // light style context for the in-row color picker's live preview.
  const gs = project.global_style ?? ({} as Project["global_style"]);
  const grpStyle = (gi != null && project.layout[gi]?.style) || {};
  const word = selWid != null ? project.words[selWid] : null;
  const resolved = { ...gs, ...grpStyle };
  const ctx: StyleCtx = { text: word?.text || "Karaoke", font: resolved.font, fill: resolved.primary };

  const tierProps = { project, gi, selWid, ctx, open, setOpen, onAdd, onRemove, onRestore, onSetProps, onEditCustom, onSelectCues };
  return (
    <div className="anim-section" ref={secRef}>
      <div className="sec-t cyan"><Icon name="sparkles" size={13} /> Animation</div>
      <div className="sec-sub">Same global → group → cue waterfall as style. Tiers append only what they override.</div>
      {selWid != null && <AnimTier tierScope="cue" {...tierProps} />}
      {scope !== "global" && gi != null && <AnimTier tierScope="group" {...tierProps} />}
      <AnimTier tierScope="global" {...tierProps} />
    </div>
  );
}
