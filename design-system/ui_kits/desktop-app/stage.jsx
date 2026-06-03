// stage.jsx — TopBar, PreviewStage, Timeline (Waveform + WordTrack).
const WAVE_BARS = [12,18,28,22,38,46,34,54,66,50,36,26,42,60,74,56,40,48,64,52,32,22,38,54,68,84,62,46,34,26,42,58,72,54,36,24,18,30,46,60,48,34,26,20,36,52,66,54,40,30,22,34,48,62,40,28];

function fmt(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60);
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

function TopBar({ project, time, dur, playing, onPlay, onSeekRel, onHome, onExport, onUndo, onRedo, canUndo, canRedo }) {
  return (
    <div className="topbar">
      <div className="brand" onClick={onHome} title="Back to projects">
        <img src="../../assets/logo-mark.svg" alt="" />
        <span className="word">Karaoke Subtitle Studio</span>
        <span className="ver">v3</span>
      </div>
      <div className="crumb"><Icon name="chevDown" size={14} /><b>{project}</b></div>
      <div className="flex" />
      <div className="transport">
        <button className="tbtn" onClick={() => onSeekRel(-2)}><Icon name="skipBack" size={16} /></button>
        <button className="tbtn play" onClick={onPlay}><Icon name={playing ? "pause" : "play"} size={18} /></button>
        <button className="tbtn" onClick={() => onSeekRel(2)}><Icon name="skipFwd" size={16} /></button>
        <span className="time">{fmt(time)}<span className="d"> / {fmt(dur)}</span></span>
      </div>
      <div className="flex" />
      <button className="btn ghost sm" title="Undo" onClick={onUndo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : .4 }}><Icon name="undo" size={15} /></button>
      <button className="btn ghost sm" title="Redo" onClick={onRedo} disabled={!canRedo} style={{ opacity: canRedo ? 1 : .4 }}><Icon name="redo" size={15} /></button>
      <button className="btn primary" onClick={onExport}><Icon name="download" size={15} />Export</button>
    </div>
  );
}

function PreviewStage({ lines, time, liveId, selId, preset, onSelectWord }) {
  const animClass = preset === "Karaoke Bounce" ? " anim-bounce" : preset === "Pop" ? " anim-pop" : "";
  return (
    <div className="stage-col">
      <div className="stage">
        <div className="scan" />
        <div className="tag">1920 × 1080 · 24fps</div>
        <div className="live-badge"><span className="pulse" />LIVE</div>
        <div className="cap">
          {lines.map((line, li) => (
            <div key={li}>
              {line.map((w) => {
                const live = w.id === liveId;
                const pending = w.s > time + 0.001 && !live;
                const cls = "w" + (live ? " live" + animClass : "") + (pending ? " pending" : "") + (w.id === selId ? " sel" : "");
                return <span key={w.id} className={cls} onClick={() => onSelectWord(w.id)}>{w.text}</span>;
              })}
            </div>
          ))}
        </div>
        <div className="bbox">
          {["nw","n","ne","e","se","s","sw","w"].map(h => <i key={h} className={h} />)}
        </div>
      </div>
      <div className="stage-help">Drag inside the box to <b>move</b> · drag a handle to <b>resize</b> · click a word to edit its bounds &amp; effects.</div>
    </div>
  );
}

function Waveform({ dur, time, onSeek, height = 56, ruler = true }) {
  const progress = dur ? time / dur : 0;
  const seek = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur);
  };
  const marks = Array.from({ length: 6 }, (_, i) => fmt((dur / 5) * i).replace(/\.\d+$/, ""));
  return (
    <div className="wave-wrap">
      {ruler && <div className="ruler">{marks.map((m, i) => <span key={i}>{m}</span>)}</div>}
      <div className="wave" style={{ height }} onClick={seek}>
        {WAVE_BARS.map((b, i) => {
          const on = (i / WAVE_BARS.length) <= progress;
          return <span key={i} className={"bar" + (on ? " on" : "")} style={{ height: `${b}%` }} />;
        })}
        <div className="playhead" style={{ left: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

function WordTrack({ words, dur, time, liveId, selId, onSelect }) {
  const progress = dur ? time / dur : 0;
  return (
    <div className="track">
      {words.map((w) => {
        const left = (w.s / dur) * 100;
        const width = ((w.e - w.s) / dur) * 100;
        const cls = "block" + (w.id === liveId ? " live" : "") + (w.id === selId ? " sel" : "") + (w.del ? " del" : "") + (w.frac ? " frac" : "");
        return (
          <div key={w.id} className={cls} style={{ left: `${left}%`, width: `${width}%`, background: `var(--cue-${(w.gi % 10) + 1})` }}
            onClick={() => onSelect(w.id)} title={`${w.text} · ${w.s.toFixed(2)}–${w.e.toFixed(2)}s`}>
            <span className="fade in" /><span style={{ padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis" }}>{w.text}</span><span className="fade out" />
          </div>
        );
      })}
      <div className="playhead" style={{ left: `${progress * 100}%` }} />
    </div>
  );
}

Object.assign(window, { TopBar, PreviewStage, Waveform, WordTrack, fmt });
