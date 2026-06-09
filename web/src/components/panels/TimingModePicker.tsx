// TimingModePicker.tsx — Option B timing-mode control (HANDOFF §4.1).
// 3 inline segments (Per cue · Per line · Together) + a Sequence ▾ cell opening
// a grouped popover (Sequence: cascade/typewriter · Advanced: reverse/centerout/
// jitter), full-width under a "TIMING" label, plus the indented step sub-row
// (only for sequence modes; dashed "not used" placeholder otherwise) with a
// ms⇆% unit toggle. Ported from ui_kits/desktop-app/tm.js / tm.css.
//
// SPEC-GAP-1: emits literal { mode } / { step, step_unit } partials via onChange,
// matching set_animation_props { partial }.
import { useState } from "react";
import { Icon } from "../icons/Icon";
import { EditableNum } from "../controls/EditableNum";
import type { Animation, TimingMode, AnimUnit } from "../../types";

interface ModeDef { id: TimingMode; nm: string; group: "common" | "sequence" | "advanced"; tip: string; step?: boolean; }

const MODES: ModeDef[] = [
  { id: "percue",     nm: "Per cue",    group: "common",   tip: "Each cue animates at its own start time, independently." },
  { id: "perline",    nm: "Per line",   group: "common",   tip: "A whole line animates as one, triggered by its first word." },
  { id: "together",   nm: "Together",   group: "common",   tip: "Every member animates at one shared moment (the group window)." },
  { id: "cascade",    nm: "Cascade",    group: "sequence", tip: "Members enter one after another, staggered by a fixed step.", step: true },
  { id: "typewriter", nm: "Typewriter", group: "sequence", tip: "Members start one after the next — about ordering, not the look.", step: true },
  { id: "reverse",    nm: "Reverse",    group: "advanced", tip: "Cascade order runs last → first instead of reading order.", step: true },
  { id: "centerout",  nm: "Center-out", group: "advanced", tip: "The sequence radiates from the middle of the line outward.", step: true },
  { id: "jitter",     nm: "Jitter",     group: "advanced", tip: "Each start gets a small random offset so it feels organic.", step: true },
];
const byId = (id: TimingMode | null | undefined) => MODES.find((m) => m.id === id) ?? MODES[0];
const GRP: Record<string, string> = { sequence: "Sequence", advanced: "Advanced" };

export interface TimingModePickerProps {
  anim: Pick<Animation, "mode" | "step" | "step_unit">;
  onChange: (partial: Partial<Pick<Animation, "mode" | "step" | "step_unit">>) => void;
}

export function TimingModePicker({ anim, onChange }: TimingModePickerProps) {
  const [seqOpen, setSeqOpen] = useState(false);
  const cur = byId(anim.mode);
  const common = MODES.filter((m) => m.group === "common");
  const seqActive = cur.group !== "common";

  const pickMode = (id: TimingMode) => { setSeqOpen(false); onChange({ mode: id }); };

  const unit: AnimUnit = anim.step_unit === "frac" ? "frac" : "ms";
  const stepVal = anim.step ?? (unit === "frac" ? 0.12 : 80);

  return (
    <div className="tm-row" data-mode={cur.id}>
      <div className="tm-mode-line">
        <span className="ml-lbl"><Icon name="clock" size={12} /> Timing</span>
        <div className="seg">
          {common.map((m) => (
            <button
              key={m.id}
              type="button"
              className={"seg-b" + (m.id === cur.id ? " on" : "")}
              title={`${m.nm} — ${m.tip}`}
              aria-label={`${m.nm} — ${m.tip}`}
              onClick={() => pickMode(m.id)}
            >
              <span className="sb-l">{m.nm}</span>
            </button>
          ))}
          <div className="seq-wrap" style={{ position: "relative", display: "flex" }}>
            <button
              type="button"
              className={"seg-b seq" + (seqActive ? " on" : "")}
              title="Sequence modes: Cascade · Typewriter · Advanced"
              aria-label="Sequence modes: Cascade, Typewriter, Advanced"
              onClick={() => setSeqOpen((o) => !o)}
            >
              <span className="sb-l">{seqActive ? cur.nm : "Sequence"} ▾</span>
            </button>
            {seqOpen && (
              <div className="md-pop" role="menu" style={{ display: "block" }}>
                {(["sequence", "advanced"] as const).map((g) => (
                  <div key={g}>
                    <div className="md-grp">{GRP[g]}</div>
                    {MODES.filter((m) => m.group === g).map((m) => (
                      <div
                        key={m.id}
                        className={"md-item" + (m.id === cur.id ? " on" : "")}
                        role="menuitem"
                        tabIndex={0}
                        title={m.tip}
                        onClick={() => pickMode(m.id)}
                      >
                        <span>{m.nm}</span>
                        {m.id === cur.id && <span className="mi-ck"><Icon name="check" size={13} /></span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <StepSubRow
        mode={cur}
        unit={unit}
        value={stepVal}
        onUnit={(u) => onChange({ step: u === "frac" ? 0.12 : 80, step_unit: u })}
        onStep={(v) => onChange({ step: v, step_unit: unit })}
      />
    </div>
  );
}

function StepSubRow({
  mode, unit, value, onUnit, onStep,
}: {
  mode: ModeDef; unit: AnimUnit; value: number;
  onUnit: (u: AnimUnit) => void; onStep: (v: number) => void;
}) {
  if (!mode.step) {
    return (
      <div className="substep na">
        <span className="ss-lbl"><Icon name="waveform" size={12} /> Step</span>
        <span className="na-txt">— not used by {mode.nm}</span>
      </div>
    );
  }
  const bump = (d: number) => {
    if (unit === "frac") onStep(Math.max(0, Math.min(1, +(value + d * 0.02).toFixed(2))));
    else onStep(Math.max(0, value + d * 10));
  };
  return (
    <div className="substep">
      <span className="ss-lbl"><Icon name="waveform" size={12} /> Step</span>
      <span className="stepper">
        <button type="button" aria-label="decrease step" onClick={() => bump(-1)}>−</button>
        <EditableNum
          className="sv"
          display={unit === "frac" ? `${Math.round(value * 100)}%` : String(value)}
          value={unit === "frac" ? Math.round(value * 100) : value}
          step={unit === "frac" ? 5 : 10}
          parse={(s) => {
            const n = parseFloat(s);
            if (isNaN(n)) return null;
            return unit === "frac" ? Math.max(0, Math.min(1, +(n / 100).toFixed(2))) : Math.max(0, n);
          }}
          onCommit={(n) => onStep(n)}
        />
        <button type="button" aria-label="increase step" onClick={() => bump(1)}>+</button>
      </span>
      <span className="unit">
        <button type="button" className={unit === "ms" ? "on" : ""} onClick={() => onUnit("ms")}>ms</button>
        <button type="button" className={unit === "frac" ? "on" : ""} onClick={() => onUnit("frac")}>%</button>
      </span>
    </div>
  );
}
