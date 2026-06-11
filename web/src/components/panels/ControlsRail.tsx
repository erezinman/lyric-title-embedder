// ControlsRail.tsx — source/output (real names) + placement (alignment editable,
// \pos toggle). The old "Animation presets — Coming soon" stub was removed: the
// engine now has animations and the real entry is the Inspector AnimSection.
import { Icon } from "../icons/Icon";
import { AlignGrid } from "../atoms/AlignGrid";
import { VideoControl } from "./VideoControl";
import { EventsPanel } from "./EventsPanel";
import type { EventRow } from "../../model/events";
import type { Project, TextDirection } from "../../types";
import { posActive } from "../../model/bbox";

// Numpad 1–9 alignment names (index = numpad position). Used for the current-value
// caption beside the Alignment grid. Full names so the caption reads "Bottom-Center (2)".
const ALIGN_NAMES: Record<number, string> = {
  1: "Bottom-Left", 2: "Bottom-Center", 3: "Bottom-Right",
  4: "Middle-Left", 5: "Center", 6: "Middle-Right",
  7: "Top-Left", 8: "Top-Center", 9: "Top-Right",
};

const POS_DISABLED_TITLE = "Disabled — free placement (\\pos) overrides alignment";

const DIR_OPTS: { value: TextDirection; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "ltr", label: "LTR" },
  { value: "rtl", label: "RTL" },
];

export interface ControlsRailProps {
  project: Project;
  projectName: string;
  /** Set a project global via set_globals {partial:{[key]:value}}. Numeric for
   *  align; string for text_direction; boolean for bidi_marks. */
  onSetGlobal: (key: string, value: number | string | boolean) => void;
  onTogglePos: (on: boolean) => void;
  /** Attach/swap the project video (multipart upload → /api/video). */
  onUploadVideo: (file: File) => Promise<void>;
  /** Clear the project video (DELETE /api/video). Cues/styling are kept. */
  onClearVideo: () => Promise<void>;
  /** Switch the rail to the Inspector tab (where the real AnimSection lives).
   *  The "Coming soon" animation stub was removed; this points at the live entry. */
  onOpenInspector?: () => void;
  // ── Events panel (Project rail) ──
  events?: EventRow[];
  focusedGi?: number | null;
  onSetEventLabel?: (gi: number, label: string) => void;
  onSetEventSection?: (gi: number, section: string) => void;
  onSetEventColor?: (gi: number, color: string) => void;
  onSetEventLinger?: (gi: number, linger: number) => void;
  onMergeEvents?: (gidxs: number[]) => void;
  onSplitEvent?: (gi: number) => void;
}

export function ControlsRail({ project, projectName, onSetGlobal, onTogglePos,
  onUploadVideo, onClearVideo, onOpenInspector,
  events, focusedGi = null, onSetEventLabel, onSetEventSection, onSetEventColor,
  onSetEventLinger, onMergeEvents, onSplitEvent }: ControlsRailProps) {
  const pl = project.placement;
  const posOn = posActive(pl);
  const dir: TextDirection = project.globals.text_direction ?? "auto";
  const bidiOn = project.globals.bidi_marks ?? true;
  return (
    <div>
      {events && (
        <>
          <div className="sec-t"><Icon name="layers" size={13} />Events</div>
          <EventsPanel
            events={events}
            focusedGi={focusedGi}
            onSetLabel={(gi, l) => onSetEventLabel?.(gi, l)}
            onSetSection={(gi, s) => onSetEventSection?.(gi, s)}
            onSetColor={(gi, c) => onSetEventColor?.(gi, c)}
            onSetLinger={(gi, v) => onSetEventLinger?.(gi, v)}
            onMerge={(gidxs) => onMergeEvents?.(gidxs)}
            onSplit={(gi) => onSplitEvent?.(gi)}
          />
        </>
      )}

      <div className="sec-t spacer"><Icon name="film" size={13} />Source &amp; output</div>
      <div className="ctl">
        <label>Lyrics</label>
        <div className="text-inp" style={{ maxWidth: 168 }}>
          <span className="path">{projectName}/lyrics.json</span>
        </div>
      </div>
      <VideoControl video={project.video} onUpload={onUploadVideo} onClear={onClearVideo} />

      <div className="sec-t spacer"><Icon name="align" size={13} />Placement (global)</div>
      <div className="ctl">
        <label>Canvas</label>
        <div className="text-inp mono" style={{ maxWidth: 120, justifyContent: "center" }}>
          {pl.play_w || 1920}×{pl.play_h || 1080}
        </div>
      </div>
      <div className="ctl">
        <label>
          Alignment
          <span className="ctl-cap">{ALIGN_NAMES[pl.align || 2] ?? "?"} ({pl.align || 2})</span>
        </label>
        <AlignGrid value={pl.align} onPick={(n) => onSetGlobal("align", n)} disabled={posOn}
          title={posOn ? POS_DISABLED_TITLE : ""} />
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

      <div className="sec-t spacer"><Icon name="align" size={13} />Text direction (global)</div>
      <div className="ctl">
        <label>Direction</label>
        <div className="seg" role="group" aria-label="Text direction">
          {DIR_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={"seg-b" + (dir === o.value ? " on" : "")}
              aria-pressed={dir === o.value}
              onClick={() => onSetGlobal("text_direction", o.value)}
            >
              <span className="sb-l">{o.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="ctl">
        <label>Insert bidi marks</label>
        <div role="switch" aria-checked={bidiOn} aria-label="Bidi marks"
             className={"toggle " + (bidiOn ? "on" : "off")}
             onClick={() => onSetGlobal("bidi_marks", !bidiOn)}>
          <div className="knob" />
        </div>
      </div>
      <p className="rail-note">
        <Icon name="align" size={11} />
        {dir === "rtl"
          ? "RTL: libass reorders via FriBidi; words stay in logical order. Default \\an flips to right."
          : dir === "ltr"
            ? "Forced left-to-right base direction."
            : "Auto: base direction inferred from the caption text."}
      </p>

      {/* The "Animation presets — Coming soon" stub was removed; the real entry is
          the Inspector's AnimSection. Point at it rather than leaving a dead gap. */}
      <div className="sec-t spacer"><Icon name="sparkles" size={13} />Animations</div>
      <button type="button" className="rail-link" onClick={() => onOpenInspector?.()}
        title="Open the Inspector to edit animations">
        <Icon name="sparkles" size={13} />
        Edit animations
        <Icon name="fwd" size={12} />
      </button>
    </div>
  );
}
