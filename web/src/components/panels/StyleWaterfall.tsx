// StyleWaterfall.tsx — 3-tier style inspector: GLOBAL · GROUP · CUE
// Ported from design-system/ui_kits/desktop-app/panels.jsx with model-alignment edits.

import React from "react";
import { Icon } from "../icons/Icon";
import { AlignGrid } from "../atoms/AlignGrid";
import { STYLE_KEYS, CUE_STYLE_KEYS } from "../../types";
import type { Project, Token } from "../../types";

// ---- per-prop control metadata ----
const STYLE_META: Record<string, { label: string; kind: string; fmt: (v: unknown) => string; step?: number; min?: number; max?: number; hex?: boolean }> = {
  font:         { label: "Font",        kind: "combo",  fmt: v => String(v) },
  fontsize:     { label: "Size",        kind: "step",   fmt: v => v + " px", step: 2, min: 8 },
  bold:         { label: "Bold",        kind: "toggle", fmt: v => (v ? "On" : "Off") },
  primary:      { label: "Fill",        kind: "color",  fmt: v => String(v) },
  outline:      { label: "Outline",     kind: "color",  fmt: v => String(v) },
  back:         { label: "Box color",   kind: "color",  fmt: v => String(v) },
  back_alpha:   { label: "Box alpha",   kind: "step",   fmt: v => "0x" + v, step: 16, min: 0, max: 255, hex: true },
  outline_w:    { label: "Outline w",   kind: "step",   fmt: v => v + " px", step: 1, min: 0 },
  shadow:       { label: "Shadow",      kind: "step",   fmt: v => v + " px", step: 1, min: 0 },
  border_style: { label: "Border mode", kind: "mode",   fmt: v => (v === 3 ? "Opaque box" : "Outline") },
  align:        { label: "Alignment",   kind: "align",  fmt: v => `${ALIGN_SHORT[Number(v)] ?? "?"} (${v})` },
};

// numpad anchor short names (1..9)
const ALIGN_SHORT: Record<number, string> = {
  1: "Bot-Left", 2: "Bot-Center", 3: "Bot-Right",
  4: "Mid-Left", 5: "Center", 6: "Mid-Right",
  7: "Top-Left", 8: "Top-Center", 9: "Top-Right",
};

const COLOR_OPTS = ["#FFFFFF", "#FF3DA6", "#8A5BFF", "#3DE0FF", "#000000", "#4DE0C2", "#FFC24D"];

function clampStep(pkey: string, v: unknown, dir: number): number | string {
  const m = STYLE_META[pkey];
  if (m.hex) {
    const n = Math.max(0, Math.min(255, (parseInt(String(v), 16) || 0) + dir * (m.step ?? 1)));
    return n.toString(16).padStart(2, "0").toUpperCase();
  }
  let n = (typeof v === "number" ? v : 0) + dir * (m.step ?? 1);
  if (m.min != null) n = Math.max(m.min, n);
  if (m.max != null) n = Math.min(m.max, n);
  return n;
}

// what each tier inherits from
function inheritMap(project: Project, gi: number | null, scope: "global" | "group" | "cue"): Record<string, { value: unknown; src: string }> {
  const g = gi != null ? project.layout[gi] : null;
  const out: Record<string, { value: unknown; src: string }> = {};
  STYLE_KEYS.forEach(k => {
    if (scope === "cue" && g && g.style && g.style[k as keyof typeof g.style] != null) {
      out[k] = { value: g.style[k as keyof typeof g.style], src: "group" };
    } else {
      out[k] = { value: project.global_style[k as keyof typeof project.global_style], src: "global" };
    }
  });
  return out;
}

// ---- Toggle (inline to avoid import cycle) ----
function Toggle({ on, onClick }: { on: boolean; onClick?: () => void }) {
  return (
    <div className={"toggle " + (on ? "on" : "off")} onClick={onClick}>
      <div className="knob" />
    </div>
  );
}

// ---- PropRow ----
interface PropRowProps {
  pkey: string;
  isGlobal?: boolean;
  inheritFrom: { value: unknown; src: string };
  overridden: { value: unknown } | null;
  onSet: (pkey: string, v: unknown) => void;
  onClear: (pkey: string) => void;
}

function PropRow({ pkey, isGlobal, inheritFrom, overridden, onSet, onClear }: PropRowProps) {
  const meta = STYLE_META[pkey];
  const solid = isGlobal || overridden != null;
  const val = solid
    ? (isGlobal ? (overridden?.value ?? inheritFrom.value) : overridden!.value)
    : inheritFrom.value;

  const ctrl = () => {
    if (meta.kind === "toggle") {
      // ADJ-12: toggling to a value that equals the inherited value clears the
      // override (returns to inherited) instead of writing an explicit override,
      // so toggle×2 round-trips back to inherited. Equality-clears applies ONLY
      // to the toggle kind; steppers/colors keep explicit sets. The GLOBAL tier
      // has no inherited source, so it always writes.
      const next = !val;
      const handleToggle = () => {
        if (!isGlobal && next === inheritFrom.value) onClear(pkey);
        else onSet(pkey, next);
      };
      return (
        <span className="pv-ctl" onClick={handleToggle}>
          <Toggle on={!!val} />
        </span>
      );
    }
    if (meta.kind === "color") {
      return (
        <span className="pv-ctl swrow2">
          {COLOR_OPTS.map(c => (
            <i
              key={c}
              className={"sw-dot" + (c.toUpperCase() === String(val).toUpperCase() ? " on" : "")}
              style={{ background: c }}
              onClick={() => onSet(pkey, c)}
            />
          ))}
        </span>
      );
    }
    if (meta.kind === "mode") {
      return (
        <span className="seg2">
          <button className={val === 1 ? "on" : ""} onClick={() => onSet(pkey, 1)}>Outline</button>
          <button className={val === 3 ? "on" : ""} onClick={() => onSet(pkey, 3)}>Box</button>
        </span>
      );
    }
    if (meta.kind === "align") {
      // same 3x3 numpad selector as the Project tab
      return <AlignGrid value={Number(val) || 2} onPick={(n) => onSet(pkey, n)} />;
    }
    // step / combo — render as stepper
    return (
      <span className="pv-step">
        <span className="pm" onClick={() => onSet(pkey, clampStep(pkey, val, -1))}>−</span>
        <span className="v">{meta.fmt(val)}</span>
        <span className="pm" onClick={() => onSet(pkey, clampStep(pkey, val, +1))}>+</span>
      </span>
    );
  };

  return (
    <div className={"prow" + (solid ? " over" : " inh")}>
      <span className="pl">{meta.label}</span>
      <span className="pv">{ctrl()}</span>
      {isGlobal
        ? <span className="psrc base">base</span>
        : overridden != null
          ? <button className="pclear" title="Clear override (inherit)" onClick={() => onClear(pkey)}><Icon name="close" size={11} /></button>
          : <span className="psrc" title={"inherited from " + inheritFrom.src}>{inheritFrom.src === "group" ? "grp" : "glob"}</span>
      }
    </div>
  );
}

// ---- FadeRow — step control for fade_in_ms / fade_out_ms in GROUP tier ----
interface FadeRowProps {
  fadeKey: "fade_in_ms" | "fade_out_ms";
  label: string;
  groupValue: number | null | undefined;
  globalValue: number;
  onSet: (key: "fade_in_ms" | "fade_out_ms", value: number) => void;
  onClear: (key: "fade_in_ms" | "fade_out_ms") => void;
}

function FadeRow({ fadeKey, label, groupValue, globalValue, onSet, onClear }: FadeRowProps) {
  const overridden = groupValue != null;
  const val = overridden ? groupValue : globalValue;

  const stepUp = () => onSet(fadeKey, Math.max(0, (val ?? 0) + 50));
  const stepDown = () => onSet(fadeKey, Math.max(0, (val ?? 0) - 50));

  return (
    <div className={"prow" + (overridden ? " over" : " inh")}>
      <span className="pl">{label}</span>
      <span className="pv">
        <span className="pv-step">
          <span className="pm" onClick={stepDown}>−</span>
          <span className="v">{val} ms</span>
          <span className="pm" onClick={stepUp}>+</span>
        </span>
      </span>
      {overridden
        ? <button className="pclear" title="Clear override (inherit)" onClick={() => onClear(fadeKey)}><Icon name="close" size={11} /></button>
        : <span className="psrc" title="inherited from global">glob</span>
      }
    </div>
  );
}

// ---- Tier ----
type TierScope = "global" | "group" | "cue";

interface TierProps {
  /** CSS class suffix (e.g. "word", "group", "global") */
  tierClass: string;
  /** Logical scope key passed to callbacks ("cue", "group", "global") */
  scope: TierScope;
  title: string;
  badge?: React.ReactNode;
  keys: readonly string[];
  styleDict: Record<string, unknown>;
  isGlobal?: boolean;
  inherit: Record<string, { value: unknown; src: string }>;
  selected: boolean;
  onSelect: () => void;
  onSet: (tier: TierScope, pk: string, v: unknown) => void;
  onClear: (tier: TierScope, pk: string) => void;
  aiHot?: boolean;
  // optional GROUP-tier fade props
  fadeRows?: React.ReactNode;
}

function Tier({ tierClass, scope, title, badge, keys, styleDict, isGlobal, inherit, selected, onSelect, onSet, onClear, aiHot, fadeRows }: TierProps) {
  return (
    <div
      className={"tier3 " + tierClass + (selected ? " sel" : "") + (aiHot ? " aihot" : "")}
      onClick={onSelect}
    >
      <div className="t3-h">
        <span className={"tier-tag " + tierClass}>{title}</span>
        {badge}
      </div>
      <div className="t3-body">
        {keys.map(k => (
          <PropRow
            key={k}
            pkey={k}
            isGlobal={isGlobal}
            inheritFrom={inherit[k] ?? { value: undefined, src: "global" }}
            overridden={isGlobal
              ? { value: styleDict[k] }
              : (styleDict && styleDict[k] != null ? { value: styleDict[k] } : null)
            }
            onSet={(pk, v) => onSet(scope, pk, v)}
            onClear={(pk) => onClear(scope, pk)}
          />
        ))}
        {fadeRows}
      </div>
    </div>
  );
}

// ---- StyleWaterfall props ----
export interface StyleWaterfallProps {
  project: Project;
  sel: { scope: "global" | "group" | "cue"; gi: number; tok: Token | null };
  aiTier: "global" | "group" | "cue" | null;
  onSelectTier: (scope: TierScope) => void;
  onSetStyle: (tier: TierScope, key: string, value: unknown) => void;
  onClearStyle: (tier: TierScope, key: string) => void;
  onSetFade: (key: "fade_in_ms" | "fade_out_ms", value: number | null) => void;
}

export function StyleWaterfall({ project, sel, aiTier, onSelectTier, onSetStyle, onClearStyle, onSetFade }: StyleWaterfallProps) {
  const gi = sel.gi;
  const g = gi != null ? project.layout[gi] : null;
  const tok = sel.tok || null;

  const groupFadeRows = g ? (
    <>
      <FadeRow
        fadeKey="fade_in_ms"
        label="Group fade-in"
        groupValue={g.fade?.fade_in_ms ?? null}
        globalValue={project.globals.fade_in_ms}
        onSet={(key, value) => onSetFade(key, value)}
        onClear={(key) => onSetFade(key, null)}
      />
      <FadeRow
        fadeKey="fade_out_ms"
        label="Group fade-out"
        groupValue={g.fade?.fade_out_ms ?? null}
        globalValue={project.globals.fade_out_ms}
        onSet={(key, value) => onSetFade(key, value)}
        onClear={(key) => onSetFade(key, null)}
      />
    </>
  ) : null;

  return (
    <div className="insp">
      <div className="wf-head">
        Style waterfall — <b>cue → group → global</b> · most specific wins
      </div>

      {tok && (
        <Tier
          tierClass="word"
          scope="cue"
          title="CUE"
          badge={<span className="t3-meta">"{project.words[tok.ids[0]]?.text ?? ""}"</span>}
          keys={CUE_STYLE_KEYS}
          styleDict={tok.style as Record<string, unknown>}
          inherit={inheritMap(project, gi, "cue")}
          selected={sel.scope === "cue"}
          aiHot={aiTier === "cue"}
          onSelect={() => onSelectTier("cue")}
          onSet={onSetStyle}
          onClear={onClearStyle}
        />
      )}

      {g && (
        <Tier
          tierClass="group"
          scope="group"
          title="GROUP"
          badge={<span className="t3-meta">{g.label}</span>}
          keys={STYLE_KEYS}
          styleDict={g.style as Record<string, unknown>}
          inherit={inheritMap(project, gi, "group")}
          selected={sel.scope === "group"}
          aiHot={aiTier === "group"}
          onSelect={() => onSelectTier("group")}
          onSet={onSetStyle}
          onClear={onClearStyle}
          fadeRows={groupFadeRows}
        />
      )}

      <Tier
        tierClass="global"
        scope="global"
        title="GLOBAL"
        badge={<span className="t3-meta">defaults</span>}
        keys={STYLE_KEYS}
        styleDict={project.global_style as unknown as Record<string, unknown>}
        isGlobal={true}
        inherit={{}}
        selected={sel.scope === "global"}
        aiHot={aiTier === "global"}
        onSelect={() => onSelectTier("global")}
        onSet={onSetStyle}
        onClear={() => {}}
      />

      <div className="wf-foot">
        <Icon name="layers" size={11} />
        Box mode is a <b>group</b> decision (separate ASS Style). Cue tier omits it.
      </div>
    </div>
  );
}
