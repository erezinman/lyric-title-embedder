// FadeGroupPanel.tsx — fade-group membership editor (trigger-only; duration is read-only).
// Ported from design-system/ui_kits/desktop-app/app.jsx with MODEL-ALIGNMENT edits:
//   - trigger stepper only (no dur editing — tags have no dur field)
//   - duration displayed as read-only text from resolveFade(project, gi) with "(group/global)" note
//   - Props use typed Project/FadeTag; onSet(kind, trigger) not onSet(kind, patch)

import { Icon } from "../icons/Icon";
import { resolveFade } from "../../model/resolve";
import type { Project, FadeTag } from "../../types";

export interface FadeGroupPanelProps {
  project: Project;
  gi: number;
  finTag: FadeTag | null;
  foutTag: FadeTag | null;
  onSet: (kind: "in" | "out", trigger: number | null) => void;
  onClear: (kind: "in" | "out") => void;
}

function FadeRow({
  kind,
  tag,
  durMs,
  durSrc,
  onSet,
  onClear,
}: {
  kind: "in" | "out";
  tag: FadeTag;
  durMs: number;
  durSrc: "group" | "global";
  onSet: (kind: "in" | "out", trigger: number | null) => void;
  onClear: (kind: "in" | "out") => void;
}) {
  const trigDef = tag.trigger == null;
  const trigVal = tag.trigger ?? 0;

  return (
    <div className="fg-row">
      <span className="fg-k">
        <span className="fg-band" />
        Fade-{kind}
        <span className="fg-n">{tag.ids.length} words</span>
      </span>
      <div className="fg-fields">
        <span className={"fg-f" + (trigDef ? " inh" : " ovr")}>
          trig <b>{trigDef ? "auto" : trigVal.toFixed(2) + "s"}</b>
          <span className="pm" onClick={() => onSet(kind, Math.max(0, trigVal - 0.5))}>−</span>
          <span className="pm" onClick={() => onSet(kind, trigVal + 0.5)}>+</span>
          {!trigDef && (
            <span className="pm x" onClick={() => onSet(kind, null)}>auto</span>
          )}
        </span>
        <span className="fg-f inh">
          dur <b>{durMs}ms</b>
          <span className="fg-src">({durSrc})</span>
        </span>
      </div>
      <button className="minibtn" onClick={() => onClear(kind)}>
        <Icon name="close" size={11} />Clear
      </button>
    </div>
  );
}

export function FadeGroupPanel({ project, gi, finTag, foutTag, onSet, onClear }: FadeGroupPanelProps) {
  if (!finTag && !foutTag) return null;

  const resolved = resolveFade(project, gi);
  const g = project.layout[gi];
  const inDurMs = resolved.fade_in_ms;
  const outDurMs = resolved.fade_out_ms;
  const inDurSrc: "group" | "global" = (g?.fade?.fade_in_ms != null) ? "group" : "global";
  const outDurSrc: "group" | "global" = (g?.fade?.fade_out_ms != null) ? "group" : "global";

  return (
    <div className="fg-panel">
      <div className="fg-head">
        <Icon name="sparkles" size={13} />Fade group
        <span className="fg-hint">grey = inherits global</span>
      </div>
      {finTag && (
        <FadeRow
          kind="in"
          tag={finTag}
          durMs={inDurMs}
          durSrc={inDurSrc}
          onSet={onSet}
          onClear={onClear}
        />
      )}
      {foutTag && (
        <FadeRow
          kind="out"
          tag={foutTag}
          durMs={outDurMs}
          durSrc={outDurSrc}
          onSet={onSet}
          onClear={onClear}
        />
      )}
    </div>
  );
}
