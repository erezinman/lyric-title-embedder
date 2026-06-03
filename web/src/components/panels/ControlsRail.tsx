// ControlsRail.tsx — source/output + placement + disabled animation presets.
// Ported from design-system/ui_kits/desktop-app/panels.jsx with model-alignment edits:
//   - Props: { project: Project } — reads placement from project.placement
//   - Free placement = placement.pos != null (not use_pos)

import { Icon } from "../icons/Icon";
import { Select, Toggle } from "../atoms/index";
import type { Project } from "../../types";

const ALIGN: Record<number, string> = {
  1: "Bottom-Left (1)", 2: "Bottom-Center (2)", 3: "Bottom-Right (3)",
  4: "Mid-Left (4)",    5: "Center (5)",         6: "Mid-Right (6)",
  7: "Top-Left (7)",    8: "Top-Center (8)",      9: "Top-Right (9)",
};

export interface ControlsRailProps {
  project: Project;
}

export function ControlsRail({ project }: ControlsRailProps) {
  const pl = project.placement;
  return (
    <div>
      <div className="sec-t"><Icon name="film" size={13} />Source &amp; output</div>
      <div className="ctl">
        <label>Lyrics</label>
        <div className="text-inp" style={{ maxWidth: 168 }}>
          <span className="path">bleating_obsession.json</span>
        </div>
      </div>
      <div className="ctl">
        <label>Video</label>
        <div className="text-inp" style={{ maxWidth: 168 }}>
          <span className="path">bleating_master.mp4</span>
        </div>
      </div>
      <div className="ctl">
        <label>Group lyrics by</label>
        <Select value="section" />
      </div>

      <div className="sec-t spacer"><Icon name="align" size={13} />Placement (global)</div>
      <div className="ctl">
        <label>Canvas</label>
        <div className="text-inp mono" style={{ maxWidth: 120, justifyContent: "center" }}>
          {pl.play_w || 1920}×{pl.play_h || 1080}
        </div>
      </div>
      <div className="ctl">
        <label>Alignment</label>
        <Select value={ALIGN[pl.align] ?? ALIGN[2]} />
      </div>
      <div className="ctl">
        <label>Free placement (\pos)</label>
        <Toggle on={pl.pos != null} />
      </div>
      <p className="wf-note" style={{ textAlign: "left", marginTop: 2, marginBottom: 2, lineHeight: 1.5 }}>
        Placement &amp; canvas are <b>global</b> — edited via{" "}
        <span className="mono">set_globals</span>, not project state.
      </p>

      <div className="sec-t spacer disabled-sec">
        <Icon name="sparkles" size={13} />Animation preset
        <span className="soon">Coming soon</span>
      </div>
      <div className="chips disabled">
        {["Karaoke Bounce", "Pop", "Glow", "Typewriter"].map((p) => (
          <span key={p} className="chip" aria-disabled="true">{p}</span>
        ))}
      </div>
      <p className="wf-note" style={{ textAlign: "left", marginTop: 10, lineHeight: 1.5 }}>
        Per-word entrance animations aren&apos;t in the render engine yet — disabled until then.
      </p>
    </div>
  );
}
