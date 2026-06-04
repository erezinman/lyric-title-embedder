// stage.jsx — TopBar (AI presence + Export), PreviewStage (Live/Exact + functional
// placement drag-box), Waveform, WordTrack.
const WAVE_BARS = [12,18,28,22,38,46,34,54,66,50,36,26,42,60,74,56,40,48,64,52,32,22,38,54,68,84,62,46,34,26,42,58,72,54,36,24,18,30,46,60,48,34,26,20,36,52,66,54,40,30,22,34,48,62,40,28];

function fmt(t) { const m = Math.floor(t / 60); const s = (t % 60); return `${m}:${s.toFixed(2).padStart(5, "0")}`; }
const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ALIGN_BOTTOM = [1, 2, 3], ALIGN_TOP = [7, 8, 9];
const vSign = (a) => (ALIGN_BOTTOM.includes(a) ? 1 : ALIGN_TOP.includes(a) ? -1 : 0);

function TopBar({ project, time, dur, playing, aiConnected, exportOpen, onPlay, onSeekRel, onHome, onExport, onUndo, onRedo, canUndo, canRedo }) {
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
      {aiConnected && <span className="ai-pill" title="An AI agent is connected to this project over MCP — edits sync live"><span className="ai-dot" />AI agent · live</span>}
      <button className="btn ghost sm" title="Undo" onClick={onUndo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : .4 }}><Icon name="undo" size={15} /></button>
      <button className="btn ghost sm" title="Redo" onClick={onRedo} disabled={!canRedo} style={{ opacity: canRedo ? 1 : .4 }}><Icon name="redo" size={15} /></button>
      <button className={"btn primary" + (exportOpen ? " on" : "")} onClick={onExport}><Icon name="download" size={15} />Export</button>
    </div>
  );
}

// caption words: [{wid, text, live, pending, sel, fill}]
function PreviewStage({ capWords, time, mode, onMode, onSelectWord, onRenderExact, placement, onPlacement }) {
  const pl0 = placement || { play_w: 1920, play_h: 1080, margin_l: 60, margin_r: 60, margin_v: 60, align: 2, use_pos: false, pos: null };
  const pinned = !!pl0.use_pos;
  const stageRef = React.useRef(null);
  const [drag, setDrag] = React.useState(null);
  const [local, setLocal] = React.useState(null);
  const [readout, setReadout] = React.useState(null);
  const cur = local || pl0;
  const CW = cur.play_w, CH = cur.play_h, align = cur.align || 2;

  // margin-mode geometry
  const BH = 0.22;
  const left = (cur.margin_l || 0) / CW, right = (cur.margin_r || 0) / CW;
  let top;
  if (ALIGN_TOP.includes(align)) top = (cur.margin_v || 0) / CH;
  else if (align >= 4 && align <= 6) top = 0.5 - BH / 2;
  else top = 1 - BH - (cur.margin_v || 0) / CH;
  const pin = cur.pos || [CW / 2, CH * 0.82];

  const begin = (e, m) => {
    e.preventDefault(); e.stopPropagation();
    const r = stageRef.current.getBoundingClientRect();
    setDrag({ mode: m, x: e.clientX, y: e.clientY, rw: r.width, rh: r.height, orig: { ...cur } });
    setLocal({ ...cur });
    setReadout({ x: e.clientX, y: e.clientY });
  };
  React.useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const dux = (e.clientX - drag.x) * CW / drag.rw, duy = (e.clientY - drag.y) * CH / drag.rh;
      const o = drag.orig, m = drag.mode; let n = { ...o };
      if (pinned) { n.pos = [_clamp((o.pos ? o.pos[0] : CW / 2) + dux, 0, CW), _clamp((o.pos ? o.pos[1] : CH * 0.82) + duy, 0, CH)]; }
      else {
        if (m === "move") { n.margin_l = _clamp(o.margin_l + dux, 0, CW); n.margin_r = _clamp(o.margin_r - dux, 0, CW); n.margin_v = _clamp(o.margin_v - vSign(align) * duy, 0, CH); }
        if (m.includes("w")) n.margin_l = _clamp(o.margin_l + dux, 0, CW);
        if (m.includes("e")) n.margin_r = _clamp(o.margin_r - dux, 0, CW);
        if (m.includes("n") || m.includes("s")) n.margin_v = _clamp(o.margin_v - vSign(align) * duy, 0, CH);
      }
      setLocal(n); setReadout({ x: e.clientX, y: e.clientY });
    };
    const onUp = () => { setLocal(l => { if (l) onPlacement(l); return null; }); setDrag(null); setReadout(null); };
    const onKey = (e) => { if (e.key === "Escape") { setLocal(null); setDrag(null); setReadout(null); } };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("keydown", onKey); };
  }, [drag, pinned, align, CW, CH]);

  const readoutText = pinned ? `pos ${Math.round(pin[0])}, ${Math.round(pin[1])}` : `L ${Math.round(cur.margin_l)} · R ${Math.round(cur.margin_r)} · V ${Math.round(cur.margin_v)}`;

  return (
    <div className="stage-col">
      <div ref={stageRef} className={"stage" + (mode === "exact" ? " exact" : "") + (drag ? " dragging" : "")}>
        <div className="scan" />
        <div className="tag">{CW} × {CH} · 24fps</div>
        <div className="pv-mode">
          <span className="seg2 pv">
            <button className={mode === "live" ? "on" : ""} onClick={() => onMode("live")}>Live</button>
            <button className={mode === "exact" ? "on" : ""} onClick={() => onMode("exact")}>Exact</button>
          </span>
          <span className={"pv-src " + mode}>{mode === "live" ? "CSS approx" : "libass"}</span>
        </div>
        <div className="cap">
          <div>
            {capWords.map((w) => {
              const cls = "w" + (w.live ? " live" : "") + (w.pending ? " pending" : "") + (w.sel ? " sel" : "");
              return <span key={w.wid} className={cls} style={w.live && w.fill ? { color: w.fill, textShadow: `0 0 24px ${w.fill}66, 0 2px 0 rgba(0,0,0,.6)` } : null} onClick={() => onSelectWord(w.wid)}>{w.text}</span>;
            })}
          </div>
        </div>

        {pinned ? (
          <div className={"pinbox" + (drag ? " dragging" : "")} style={{ left: `${pin[0] / CW * 100}%`, top: `${pin[1] / CH * 100}%` }} onPointerDown={(e) => begin(e, "move")}>
            <span className="pin-cross" /><span className="pin-dot" /><span className="pin-tag">\pos</span>
          </div>
        ) : (
          <div className={"bbox" + (drag ? " dragging" : "")} style={{ left: `${left * 100}%`, right: `${right * 100}%`, top: `${top * 100}%`, height: `${BH * 100}%` }} onPointerDown={(e) => begin(e, "move")}>
            {["nw","n","ne","e","se","s","sw","w"].map(h => <i key={h} className={h + " mh"} onPointerDown={(e) => begin(e, h)} />)}
            <span className="bbox-tag">margins</span>
          </div>
        )}

        {mode === "exact" && (
          <button className="exact-btn" onClick={onRenderExact}><Icon name="eye" size={13} />Render exact frame @ {fmt(time)}</button>
        )}
      </div>
      {drag && readout && <div className="drag-readout" style={{ left: readout.x + 16, top: readout.y + 16 }}>{readoutText}</div>}
      <div className="stage-help">
        {pinned
          ? <span>Drag the <b>pin</b> to set the <span className="mono">\pos</span> anchor · <b>Esc</b> cancels. Switch off free placement to edit margins.</span>
          : <span>Drag inside the box to <b>move</b> · drag a handle to adjust <b>margins</b> · <b>Esc</b> cancels.</span>}
      </div>
    </div>
  );
}

function Waveform({ dur, time, onSeek, height = 56, ruler = true }) {
  const progress = dur ? time / dur : 0;
  const seek = (e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur); };
  const marks = Array.from({ length: 6 }, (_, i) => fmt((dur / 5) * i).replace(/\.\d+$/, ""));
  return (
    <div className="wave-wrap">
      {ruler && <div className="ruler">{marks.map((m, i) => <span key={i}>{m}</span>)}<span className="wave-tag">waveform · placeholder (no audio decode yet)</span></div>}
      <div className="wave" style={{ height }} onClick={seek}>
        {WAVE_BARS.map((b, i) => <span key={i} className={"bar" + ((i / WAVE_BARS.length) <= progress ? " on" : "")} style={{ height: `${b}%` }} />)}
        <div className="playhead" style={{ left: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

// blocks: [{wid, s, e, gi, del, live, sel, multi, inFin, inFout, accumulate}]
function WordTrack({ blocks, dur, time, palette, onSelect, onShift }) {
  const progress = dur ? time / dur : 0;
  return (
    <div className="track">
      {blocks.map((w) => {
        const left = (w.s / dur) * 100, width = Math.max(0.8, ((w.e - w.s) / dur) * 100);
        const cls = "block" + (w.live ? " live" : "") + (w.sel ? " sel" : "") + (w.multi ? " multi" : "") + (w.del ? " del" : "");
        return (
          <div key={w.wid} className={cls} style={{ left: `${left}%`, width: `${width}%`, background: palette[w.gi % 10] }}
            onClick={(ev) => ev.shiftKey ? onShift(w.wid) : onSelect(w.wid)} title={`${w.text} · ${w.s.toFixed(2)}–${w.e.toFixed(2)}s · ${w.accumulate}`}>
            {w.inFin && <span className="fade in on" title="fade-in group" />}
            <span className="blk-t">{w.text}</span>
            {w.inFout && <span className="fade out on" title="fade-out group" />}
          </div>
        );
      })}
      <div className="playhead" style={{ left: `${progress * 100}%` }} />
    </div>
  );
}

// Export popover — anchored to the Export button. Burn (filename + optional input
// video) primary; Download .ass secondary row. Progress stays in the bottom toast.
function ExportPopover({ projectName, onBurn, onDownload, onClose }) {
  const base = (projectName || "project").toLowerCase().replace(/\s+/g, "_");
  const [out, setOut] = React.useState(base + "_subbed.mp4");
  const [vid, setVid] = React.useState("");
  return (
    <>
      <div className="exp-backdrop" onClick={onClose} />
      <div className="exp-pop" role="dialog">
        <div className="exp-h">Export<button className="exp-x" onClick={onClose}><Icon name="close" size={14} /></button></div>
        <div className="exp-sec">
          <label className="exp-l">Output filename</label>
          <input className="exp-inp mono" value={out} onChange={e => setOut(e.target.value)} />
          <label className="exp-l">Input video <span className="exp-opt">optional · same-host path · defaults to project video</span></label>
          <input className="exp-inp mono" placeholder="/path/to/source.mp4" value={vid} onChange={e => setVid(e.target.value)} />
          <button className="btn primary exp-burn" onClick={() => onBurn(out, vid)}><Icon name="film" size={15} />Burn video</button>
        </div>
        <div className="exp-div" />
        <button className="exp-row" onClick={onDownload}>
          <span className="exp-row-i"><Icon name="download" size={16} /></span>
          <span className="exp-row-t"><b>Download .ass</b><span className="exp-row-s">Subtitle file only — no render</span></span>
        </button>
      </div>
    </>
  );
}

Object.assign(window, { TopBar, PreviewStage, Waveform, WordTrack, ExportPopover, fmt });
