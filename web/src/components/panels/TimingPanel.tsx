import { useState, useEffect } from "react";
import { Icon } from "../icons/Icon";
import { cueSpan } from "../../model/edit";
import type { Project, Token } from "../../types";

export interface TimingPanelProps {
  tok: Token | null;
  project: Project;
  unlocked: boolean;
  onToggleLock: () => void;
  onSetTime: (start: number, end: number) => void;
  onSetText: (text: string) => void;
}

export function TimingPanel({ tok, project, unlocked, onToggleLock, onSetTime, onSetText }: TimingPanelProps) {
  if (!tok) return null;
  const span = cueSpan(project, tok);
  const text = tok.ids.map((id) => project.words[id].text).join(tok.sep || " ");
  const merged = tok.ids.length > 1;
  return (
    <div className="timing">
      <div className="locked-h">
        <Icon name="clock" size={13} />Timing
        <button className="lock-pill" onClick={onToggleLock} aria-label={unlocked ? "Lock timings" : "Unlock timings"} title={unlocked ? "Lock timings" : "Unlock timings"}>
          <Icon name="settings" size={10} />{unlocked ? "unlocked" : "locked"}
        </button>
      </div>
      <NumField label="Start" value={span.start} disabled={!unlocked || merged} step={0.05}
        onCommit={(v) => onSetTime(Math.max(0, Math.min(v, span.end - 0.01)), span.end)} />
      <NumField label="End" value={span.end} disabled={!unlocked || merged} step={0.05}
        onCommit={(v) => onSetTime(span.start, Math.max(span.start + 0.01, v))} />
      <label className="timing-text">
        <span>Text</span>
        <input aria-label="text" defaultValue={text} disabled={merged}
          onBlur={(e) => onSetText(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSetText((e.target as HTMLInputElement).value); }} />
      </label>
      {merged && <p className="locked-note">Merged cue — un-merge to edit timing/text per word.</p>}
    </div>
  );
}

function NumField({ label, value, disabled, step, onCommit }: { label: string; value: number; disabled: boolean; step: number; onCommit: (v: number) => void; }) {
  const [v, setV] = useState(value.toFixed(3));
  useEffect(() => { setV(value.toFixed(3)); }, [value]);
  const commit = (raw: string) => { const n = parseFloat(raw); if (!Number.isNaN(n)) onCommit(n); };
  return (
    <div className={"locked-row" + (disabled ? " ro" : "")}>
      <span>{label}</span>
      <input aria-label={label} className="mono num" disabled={disabled} value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          const cur = parseFloat(v) || 0;
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          else if (e.key === "ArrowUp") { e.preventDefault(); const n = cur + step * (e.shiftKey ? 5 : 1); setV(n.toFixed(3)); onCommit(n); }
          else if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.max(0, cur - step * (e.shiftKey ? 5 : 1)); setV(n.toFixed(3)); onCommit(n); }
        }}
        onBlur={(e) => commit(e.target.value)} />
      <span className="unit">s</span>
    </div>
  );
}
