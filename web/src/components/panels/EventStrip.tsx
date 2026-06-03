// EventStrip.tsx — per-event layout props strip (accumulate / linger / window).
// Ported from design-system/ui_kits/desktop-app/app.jsx.

import { Icon } from "../icons/Icon";
import type { LayoutGroup } from "../../types";

export interface EventStripProps {
  g: LayoutGroup;
  onSet: (patch: Partial<{
    accumulate: "words" | "lines" | "off";
    linger: number;
    win_start: number | null;
    win_end: number | null;
  }>) => void;
}

export function EventStrip({ g, onSet }: EventStripProps) {
  return (
    <div className="evt-strip">
      <span className="es-l">
        <Icon name="layers" size={12} />{g.label}
      </span>
      <span className="es-grp">
        Accumulate
        <span className="seg2 sm">
          {(["words", "lines", "off"] as const).map((m) => (
            <button
              key={m}
              className={g.accumulate === m ? "on" : ""}
              onClick={() => onSet({ accumulate: m })}
            >
              {m}
            </button>
          ))}
        </span>
      </span>
      <span className="es-grp">
        Linger
        <span className="pv-step sm">
          <span className="pm" onClick={() => onSet({ linger: Math.max(0, (g.linger ?? 0) - 0.1) })}>−</span>
          <span className="v">{(g.linger ?? 0).toFixed(1)}s</span>
          <span className="pm" onClick={() => onSet({ linger: (g.linger ?? 0) + 0.1 })}>+</span>
        </span>
      </span>
      <span className="es-note">
        window auto · {g.win_start == null ? "first word" : g.win_start + "s"}{" → "}
        {g.win_end == null ? "last + linger" : g.win_end + "s"}
      </span>
    </div>
  );
}
