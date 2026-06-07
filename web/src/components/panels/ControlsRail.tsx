// ControlsRail.tsx — source/output (real names) + placement (alignment editable,
// \pos toggle). The old "Animation presets — Coming soon" stub was removed: the
// engine now has animations and the real entry is the Inspector AnimSection.
import { Icon } from "../icons/Icon";
import { AlignGrid } from "../atoms/AlignGrid";
import type { Project } from "../../types";
import { posActive } from "../../model/bbox";

export interface ControlsRailProps {
  project: Project;
  projectName: string;
  onSetGlobal: (key: string, value: number) => void;
  onTogglePos: (on: boolean) => void;
}

export function ControlsRail({ project, projectName, onSetGlobal, onTogglePos }: ControlsRailProps) {
  const pl = project.placement;
  const videoName = project.video ? project.video.split("/").pop() : "—";
  const posOn = posActive(pl);
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
        <AlignGrid value={pl.align} onPick={(n) => onSetGlobal("align", n)} disabled={posOn} />
      </div>
      <div className="ctl">
        <label>Free placement (\pos)</label>
        <div role="switch" aria-checked={posOn} aria-label="Free placement"
             className={"toggle " + (posOn ? "on" : "off")}
             onClick={() => onTogglePos(!posOn)}>
          <div className="knob" />
        </div>
      </div>
      <p className="rail-note">
        <Icon name="align" size={11} />
        {posOn
          ? "Pin coordinate comes from dragging the preview box."
          : "Margins come from dragging the preview box edges."}
      </p>
    </div>
  );
}
