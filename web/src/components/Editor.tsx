import { useState, useEffect } from "react";
import { useProjectStore } from "../api/useProjectStore";
import { TopBar } from "./TopBar";
import { Icon } from "./icons/Icon";

export function Editor({ projectName, onHome }: { projectName: string; onHome: () => void }) {
  const store = useProjectStore();
  const P = store.project;
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  // selection state (client-only); used by panels in later tasks
  const [sel, setSel] = useState<{ scope: "global" | "group" | "cue"; gi: number; tok: { li: number; ti: number } | null }>({ scope: "group", gi: 0, tok: null });
  const [railTab, setRailTab] = useState<"style" | "inspector">("inspector");
  const [dockTab, setDockTab] = useState<"timeline" | "lanes">("lanes");

  if (!P) return <div className="app"><div className="connecting">Connecting…</div></div>;

  const dur = Math.max(8, ...P.words.map((w) => w.end)) + 1.5;
  return (
    <div className="app">
      <TopBar project={projectName} time={time} dur={dur} playing={playing}
        onPlay={() => setPlaying((p) => !p)} onSeekRel={(d) => setTime((t) => Math.max(0, Math.min(dur, t + d)))}
        onHome={onHome} onExport={() => {}} onUndo={store.undo} onRedo={store.redo} canUndo canRedo />
      {store.connected && <span className="ai-pill">AI agent · live</span>}
      <div className="body">
        <aside className="rail">
          <div className="rail-tabs">
            <button
              className={"rail-tab" + (railTab === "style" ? " on" : "")}
              onClick={() => setRailTab("style")}
            >
              <Icon name="sliders" size={14} />Project
            </button>
            <button
              className={"rail-tab" + (railTab === "inspector" ? " on" : "")}
              onClick={() => setRailTab("inspector")}
            >
              <Icon name="layers" size={14} />Inspector
            </button>
          </div>
          <div className="rail-body">
            {/* StyleWaterfall / ControlsRail wired in later tasks */}
          </div>
        </aside>
        <main className="center">{/* PreviewStage wired in Task 10 */}</main>
      </div>
      <section className="dock">
        <div className="dock-tabs">
          <button
            className={"dock-tab" + (dockTab === "timeline" ? " on" : "")}
            onClick={() => setDockTab("timeline")}
          >
            <Icon name="waveform" size={13} />Timeline
          </button>
          <button
            className={"dock-tab" + (dockTab === "lanes" ? " on" : "")}
            onClick={() => setDockTab("lanes")}
          >
            <Icon name="layers" size={13} />Cue lanes
          </button>
        </div>
        <div className="dock-body">
          <div className="lanes">
            {P.layout.map((g, gi) => (
              <div
                key={gi}
                className={"lane-evt" + (sel.gi === gi ? " sel" : "")}
                onClick={() => setSel({ scope: "group", gi, tok: null })}
              >
                {g.label}
              </div>
            ))}
          </div>
        </div>
      </section>
      {store.lastExternal > 0 && <ExternalToast key={store.lastExternal} />}
    </div>
  );
}

function ExternalToast() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, []);
  return show ? <div className="toast ai">AI agent updated the project</div> : null;
}
