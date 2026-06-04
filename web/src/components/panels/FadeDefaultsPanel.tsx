// FadeDefaultsPanel.tsx — project-wide fade defaults (always visible in the inspector).
// Ported from design-system/ui_kits/desktop-app/app.jsx `FadeDefaultsPanel` (~line 273).
// Three steppers (fade_in_ms / fade_out_ms ±50ms, linger ±0.1s) that dispatch via onSet.

import { Icon } from "../icons/Icon";

export interface FadeDefaultsPanelProps {
  globals: { fade_in_ms: number; fade_out_ms: number; linger: number };
  onSet: (key: "fade_in_ms" | "fade_out_ms" | "linger", value: number) => void;
}

export function FadeDefaultsPanel({ globals, onSet }: FadeDefaultsPanelProps) {
  return (
    <div className="fg-panel defaults">
      <div className="fg-head">
        <Icon name="clock" size={13} />Fade defaults
        <span className="fg-hint">project-wide · global</span>
      </div>
      {([["fade_in_ms", "Fade-in", 50, "ms"], ["fade_out_ms", "Fade-out", 50, "ms"],
         ["linger", "Linger", 0.1, "s"]] as const).map(([key, label, step, unit]) => {
        const cur = globals[key] ?? 0;
        const next = (d: number) => Math.max(0, Math.round((cur + d) * 1000) / 1000);
        return (
          <div className="fd-row" key={key}>
            <span className="fd-l">{label}</span>
            <span className="pv-step sm">
              <span className="pm" onClick={() => onSet(key, next(-step))}>−</span>
              <span className="v">{cur}{unit}</span>
              <span className="pm" onClick={() => onSet(key, next(step))}>+</span>
            </span>
          </div>
        );
      })}
      <p className="fd-note">Per-group fade rows inherit these unless overridden (the “global” source tag).</p>
    </div>
  );
}
