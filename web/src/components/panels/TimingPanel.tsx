// TimingPanel.tsx — locked read-only timing inspector for a selected token.
// Ported from design-system/ui_kits/desktop-app/panels.jsx.
// Start = Math.min of all word starts; Stop = Math.max of all word ends. Read-only.

import { Icon } from "../icons/Icon";
import type { Project, Token } from "../../types";

export interface TimingPanelProps {
  tok: Token | null;
  project: Project;
}

export function TimingPanel({ tok, project }: TimingPanelProps) {
  if (!tok) return null;
  const live = tok.ids.map((id) => project.words[id]).filter(Boolean);
  const s = Math.min(...live.map((w) => w.start));
  const e = Math.max(...live.map((w) => w.end));
  return (
    <div className="locked">
      <div className="locked-h">
        <Icon name="clock" size={13} />Timing
        <span className="lock-pill">
          <Icon name="settings" size={10} />locked
        </span>
      </div>
      <div className="locked-row">
        <span>Start</span>
        <b className="mono">{s.toFixed(2)}s</b>
      </div>
      <div className="locked-row">
        <span>Stop</span>
        <b className="mono">{e.toFixed(2)}s</b>
      </div>
      <p className="locked-note">
        Word text &amp; timing are locked to the source alignment — editing coming soon.
      </p>
    </div>
  );
}
