// ControlsRail.tsx — source/output (real names) + placement (alignment editable,
// \pos toggle) + disabled animation presets (engine lacks them).
import { Icon } from "../icons/Icon";
import type { Project } from "../../types";

const ALIGN: Record<number, string> = {
  1: "Bottom-Left (1)", 2: "Bottom-Center (2)", 3: "Bottom-Right (3)",
  4: "Mid-Left (4)",    5: "Center (5)",         6: "Mid-Right (6)",
  7: "Top-Left (7)",    8: "Top-Center (8)",      9: "Top-Right (9)",
};

export interface ControlsRailProps {
  project: Project;
  projectName: string;
  onSetGlobal: (key: string, value: number) => void;
  onTogglePos: (on: boolean) => void;
}

export function ControlsRail({ project, projectName, onSetGlobal, onTogglePos }: ControlsRailProps) {
  const pl = project.placement;
  const videoName = project.video ? project.video.split("/").pop() : "—";
  const posOn = pl.pos != null;
  return (
    <div>
      <div className="sec-t"><Icon name="film" size={13} />Source &amp; output</div>
      <div className="ctl">
        <label>Lyrics</label>
        <div className="text-inp" style={{ maxWidth: 168 }}>
          <span className="path">{projectName}/lyrics.json</span>
        </div>
      </div>
      <div className="ctl">
        <label>Video</label>
        <div className="text-inp" style={{ maxWidth: 168 }}>
          <span className="path">{videoName}</span>
        </div>
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
        <select className="select" aria-label="Alignment" value={pl.align}
                onChange={(e) => onSetGlobal("align", Number(e.target.value))}>
          {Object.entries(ALIGN).map(([n, label]) => (
            <option key={n} value={n}>{label}</option>
          ))}
        </select>
      </div>
      <div className="ctl">
        <label>Free placement (\pos)</label>
        <div role="switch" aria-checked={posOn} aria-label="Free placement"
             className={"toggle " + (posOn ? "on" : "off")}
             onClick={() => onTogglePos(!posOn)}>
          <div className="knob" />
        </div>
      </div>
      <p className="wf-note" style={{ textAlign: "left", marginTop: 2, marginBottom: 2, lineHeight: 1.5 }}>
        Drag the dashed box on the preview to move/resize. With \pos on, the box
        pins an absolute coordinate; off, it sets the margins.
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
