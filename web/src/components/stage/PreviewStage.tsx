import { getFrameUrl } from "../../api/client";

export interface CapWord {
  wid: number;
  text: string;
  live: boolean;
  pending: boolean;
  sel: boolean;
  fill: string | null;
}

interface PreviewStageProps {
  capWords: CapWord[];
  time: number;
  mode: "live" | "exact";
  onMode: (m: "live" | "exact") => void;
  onRenderExact: () => void;
  onSelectWord: (wid: number) => void;
}

export function PreviewStage({ capWords, time, mode, onMode, onRenderExact, onSelectWord }: PreviewStageProps) {
  return (
    <div className="stage-col">
      <div className="stage-mode-bar">
        <button
          className={"seg-btn" + (mode === "live" ? " active" : "")}
          onClick={() => onMode("live")}
        >
          Live
        </button>
        <button
          className={"seg-btn" + (mode === "exact" ? " active" : "")}
          onClick={() => onMode("exact")}
        >
          Exact
        </button>
      </div>
      <div className="stage">
        <div className="scan" />
        <div className="tag">1920 × 1080 · 24fps</div>
        {mode === "live" ? (
          <>
            <div className="live-badge"><span className="pulse" />LIVE</div>
            <div className="cap">
              <div>
                {capWords.map((w) => {
                  const cls =
                    "w" +
                    (w.live ? " live" : "") +
                    (w.pending ? " pending" : "") +
                    (w.sel ? " sel" : "");
                  return (
                    <span
                      key={w.wid}
                      className={cls}
                      style={w.fill ? { color: w.fill } : undefined}
                      onClick={() => onSelectWord(w.wid)}
                    >
                      {w.text}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="approx-badge">CSS approx</div>
          </>
        ) : (
          <>
            <div className="libass-badge">libass</div>
            <img src={getFrameUrl(time)} alt="frame" />
            <button className="btn sm" onClick={onRenderExact}>
              Render exact frame @ t
            </button>
          </>
        )}
        <div className="bbox">
          {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => (
            <i key={h} className={h} />
          ))}
        </div>
      </div>
      <div className="stage-help">
        Drag inside the box to <b>move</b> · drag a handle to <b>resize</b> · click a word to edit its bounds &amp; effects.
      </div>
    </div>
  );
}
