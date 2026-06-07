// stage.jsx — TopBar (AI presence + Export), PreviewStage (Live/Exact + functional
// placement drag-box), Waveform, WordTrack.
const WAVE_BARS = [12,18,28,22,38,46,34,54,66,50,36,26,42,60,74,56,40,48,64,52,32,22,38,54,68,84,62,46,34,26,42,58,72,54,36,24,18,30,46,60,48,34,26,20,36,52,66,54,40,30,22,34,48,62,40,28];

function fmt(t) { const m = Math.floor(t / 60); const s = (t % 60); return `${m}:${s.toFixed(2).padStart(5, "0")}`; }
const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ALIGN_BOTTOM = [1, 2, 3], ALIGN_TOP = [7, 8, 9];
const vSign = (a) => (ALIGN_BOTTOM.includes(a) ? 1 : ALIGN_TOP.includes(a) ? -1 : 0);

function TopBar({ project, time, dur, playing, aiConnected, exportOpen, onPlay, onSeekRel, onHome, onExport, onUndo, onRedo, canUndo, canRedo, flash }) {
  const [copied, setCopied] = React.useState(null);
  const copyMcp = (t, k) => { try { navigator.clipboard && navigator.clipboard.writeText(t); } catch (e) {} setCopied(k); setTimeout(() => setCopied(c => c === k ? null : c), 1300); };
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
      {aiConnected && (() => {
        const MCP = { mcp: "http://127.0.0.1:8137/mcp", ws: "ws://127.0.0.1:8137/ws", api: "http://127.0.0.1:8137/api/call", auth: "Bearer KSS_MCP_TOKEN" };
        const rows = [
          ["Host", "127.0.0.1", "127.0.0.1"], ["Port", "8137", "8137"],
          ["MCP", MCP.mcp, MCP.mcp], ["WebSocket", MCP.ws, MCP.ws],
          ["API", "POST 127.0.0.1:8137/api/call", MCP.api], ["Auth", "Bearer KSS_MCP_\u2022\u2022\u2022\u2022", MCP.auth],
        ];
        const cfg = `{\n  "mcpServers": {\n    "karaoke-subtitle-studio": {\n      "url": "${MCP.mcp}",\n      "headers": { "Authorization": "${MCP.auth}" }\n    }\n  }\n}`;
        return (
          <span className="ai-pill-wrap">
            <span className="ai-pill"><span className="ai-dot" />AI agent · live</span>
            <div className="ai-pop">
              <div className="ai-pop-h"><span className="ai-dot" />MCP daemon · connected</div>
              {rows.map(([k, show, val]) => (
                <button key={k} className="ai-pop-row" onClick={() => copyMcp(val, k)} title={"Copy " + val}>
                  <span>{k}</span><b>{copied === k ? "Copied ✓" : show}</b>
                </button>
              ))}
              <button className="ai-pop-copy" onClick={() => copyMcp(cfg, "cfg")}><Icon name="download" size={12} />{copied === "cfg" ? "Copied ✓" : "Copy agent config (JSON)"}</button>
              <p className="ai-pop-note">Loopback bind only · CORS: 127.0.0.1:5173</p>
            </div>
          </span>
        );
      })()}
      <button className={"btn ghost sm" + (flash === "undo" ? " pressed" : "")} title="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : .4 }}><Icon name="undo" size={15} /></button>
      <button className={"btn ghost sm" + (flash === "redo" ? " pressed" : "")} title="Redo (⌘⇧Z)" onClick={onRedo} disabled={!canRedo} style={{ opacity: canRedo ? 1 : .4 }}><Icon name="redo" size={15} /></button>
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
  const capRef = React.useRef(null);
  const [capBox, setCapBox] = React.useState(null); // measured caption rect (% of stage)
  const [guides, setGuides] = React.useState(null); // {x?, y?} snap guides while dragging
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

  // caption follows the same geometry as the box: margins+alignment, or the pin
  const col = (align - 1) % 3;  // 0 = left, 1 = center, 2 = right
  const hAlign = col === 0 ? "flex-start" : col === 2 ? "flex-end" : "center";
  const hText = col === 0 ? "left" : col === 2 ? "right" : "center";
  const mv = (cur.margin_v || 0) / CH;
  const vpos = ALIGN_BOTTOM.includes(align) ? "bottom" : ALIGN_TOP.includes(align) ? "top" : "middle";
  const capStyle = pinned
    ? { left: `${pin[0] / CW * 100}%`, top: `${pin[1] / CH * 100}%`, right: "auto", bottom: "auto", height: "auto", width: `${(1 - left - right) * 100}%`, padding: 0, transform: "translate(-50%, -50%)", alignItems: "center" }
    : vpos === "bottom"
      ? { left: `${left * 100}%`, right: `${right * 100}%`, bottom: `${mv * 100}%`, top: "auto", height: "auto", padding: 0, alignItems: hAlign }
      : vpos === "top"
        ? { left: `${left * 100}%`, right: `${right * 100}%`, top: `${mv * 100}%`, bottom: "auto", height: "auto", padding: 0, alignItems: hAlign }
        : { left: `${left * 100}%`, right: `${right * 100}%`, top: "50%", bottom: "auto", height: "auto", padding: 0, transform: "translateY(-50%)", alignItems: hAlign };
  const capInner = { justifyContent: pinned ? "center" : hAlign, textAlign: pinned ? "center" : hText };

  // measure the caption so the margin box hugs the actual text height
  React.useLayoutEffect(() => {
    const measure = () => {
      if (!capRef.current || !stageRef.current) return;
      const s = stageRef.current.getBoundingClientRect(), c = capRef.current.getBoundingClientRect();
      if (!s.height) return;
      setCapBox({ top: (c.top - s.top) / s.height * 100, height: c.height / s.height * 100 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (capRef.current) ro.observe(capRef.current);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [capWords, align, left, right, mv, pinned, CW, CH]);
  const PAD = 1.4; // % breathing room around the text for the box
  const boxStyle = capBox ? { left: `${left * 100}%`, right: `${right * 100}%`, top: `${Math.max(0, capBox.top - PAD)}%`, height: `${capBox.height + PAD * 2}%` } : null;

  const begin = (e, m) => {
    e.preventDefault(); e.stopPropagation();
    const r = stageRef.current.getBoundingClientRect();
    setDrag({ mode: m, x: e.clientX, y: e.clientY, rw: r.width, rh: r.height, orig: { ...cur } });
    setLocal({ ...cur });
    setReadout({ x: e.clientX, y: e.clientY });
  };
  React.useEffect(() => {
    if (!drag) return;
    const SAFEX = [0.05 * CW, 0.10 * CW], SAFEY = [0.05 * CH, 0.10 * CH];
    const tolX = CW * 0.018, tolY = CH * 0.018;
    const snap = (v, targets, tol, alt) => { if (alt) return { v, hit: null }; for (const t of targets) if (Math.abs(v - t) <= tol) return { v: t, hit: t }; return { v, hit: null }; };
    const onMove = (e) => {
      const dux = (e.clientX - drag.x) * CW / drag.rw, duy = (e.clientY - drag.y) * CH / drag.rh;
      const o = drag.orig, m = drag.mode, alt = e.altKey; let n = { ...o }; let gx = null, gy = null;
      if (pinned) {
        let px = _clamp((o.pos ? o.pos[0] : CW / 2) + dux, 0, CW), py = _clamp((o.pos ? o.pos[1] : CH * 0.82) + duy, 0, CH);
        const sx = snap(px, [CW / 2, ...SAFEX, CW - SAFEX[0], CW - SAFEX[1]], tolX, alt); px = sx.v; if (sx.hit != null) gx = sx.hit / CW;
        const sy = snap(py, [CH / 2, ...SAFEY, CH - SAFEY[0], CH - SAFEY[1]], tolY, alt); py = sy.v; if (sy.hit != null) gy = sy.hit / CH;
        n.pos = [px, py];
      } else if (m === "w" || m === "e") {
        const raw = m === "w" ? o.margin_l + dux : o.margin_r - dux;
        const s = snap(_clamp(raw, 0, CW - 40), SAFEX, tolX, alt);
        const nm = s.v;
        if (s.hit != null) gx = m === "w" ? s.hit / CW : 1 - s.hit / CW;
        if (e.shiftKey) {                 // one side (Shift)
          if (m === "w") n.margin_l = _clamp(nm, 0, CW - o.margin_r - 40);
          else n.margin_r = _clamp(nm, 0, CW - o.margin_l - 40);
        } else {                          // symmetric (default) — shared delta keeps the center fixed
          let d = m === "w" ? nm - o.margin_l : nm - o.margin_r;
          const maxGrow = Math.max(0, ((CW - o.margin_l - o.margin_r) - 40) / 2);
          d = _clamp(d, -Math.min(o.margin_l, o.margin_r), maxGrow);
          n.margin_l = o.margin_l + d; n.margin_r = o.margin_r + d;
        }
      } else if (m === "n" || m === "s") {
        const s = snap(_clamp(o.margin_v - vSign(align) * duy, 0, CH * 0.9), SAFEY, tolY, alt); n.margin_v = s.v; if (s.hit != null) gy = vpos === "top" ? s.hit / CH : 1 - s.hit / CH;
      }
      setLocal(n); setReadout({ x: e.clientX, y: e.clientY }); setGuides(gx == null && gy == null ? null : { x: gx, y: gy });
    };
    const onUp = () => { setLocal(l => { if (l) onPlacement(l); return null; }); setDrag(null); setReadout(null); setGuides(null); };
    const onKey = (e) => { if (e.key === "Escape") { setLocal(null); setDrag(null); setReadout(null); setGuides(null); } };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("keydown", onKey); };
  }, [drag, pinned, align, vpos, CW, CH]);

  const readoutText = pinned ? `pos ${Math.round(pin[0])}, ${Math.round(pin[1])}` : `L ${Math.round(cur.margin_l)} · R ${Math.round(cur.margin_r)} · V ${Math.round(cur.margin_v)}`;

  return (
    <div className="stage-col">
      <div ref={stageRef} className={"stage" + (mode === "exact" ? " exact" : "") + (drag ? " dragging" : "")}>
        <div className="scan" />
        <div className="ph-guides" aria-hidden="true">
          <span className="g-cv" /><span className="g-ch" />
          <span className="g-safe s10" /><span className="g-safe s5" />
        </div>
        <div className="tag">{CW} × {CH} · 24fps</div>
        <div className="pv-mode">
          <span className="seg2 pv">
            <button className={mode === "live" ? "on" : ""} onClick={() => onMode("live")}>Live</button>
            <button className={mode === "exact" ? "on" : ""} onClick={() => onMode("exact")}>Exact</button>
          </span>
          <span className={"pv-src " + mode}>{mode === "live" ? "CSS approx" : "libass"}</span>
        </div>
        <div className="cap" ref={capRef} style={capStyle}>
          <div style={capInner}>
            {capWords.map((w) => {
              const cls = "w" + (w.live ? " live" : "") + (w.pending ? " pending" : "") + (w.sel ? " sel" : "");
              return <span key={w.wid} className={cls} style={w.live && w.fill ? { color: w.fill, textShadow: `0 0 24px ${w.fill}66, 0 2px 0 rgba(0,0,0,.6)` } : null} onClick={() => onSelectWord(w.wid)}>{w.text}</span>;
            })}
          </div>
        </div>

        {!pinned && boxStyle && (
          <div className={"bbox" + (drag ? " dragging" : "")} style={boxStyle}>
            <i className="w mh" onPointerDown={(e) => begin(e, "w")} />
            <i className="e mh" onPointerDown={(e) => begin(e, "e")} />
            {vpos === "bottom" && <i className="s mh" onPointerDown={(e) => begin(e, "s")} />}
            {vpos === "top" && <i className="n mh" onPointerDown={(e) => begin(e, "n")} />}
            <span className="bbox-tag">margins · L {Math.round(cur.margin_l)} R {Math.round(cur.margin_r)}{vpos !== "middle" ? " V " + Math.round(cur.margin_v) : ""}</span>
          </div>
        )}
        {pinned && boxStyle && <div className="bbox ro" style={boxStyle}><span className="bbox-tag">safe area · read-only</span></div>}
        {pinned && (
          <div className={"pinbox" + (drag ? " dragging" : "")} style={{ left: `${pin[0] / CW * 100}%`, top: `${pin[1] / CH * 100}%` }} onPointerDown={(e) => begin(e, "move")}>
            <span className="pin-cross" /><span className="pin-dot" /><span className="pin-tag">\pos {Math.round(pin[0])}, {Math.round(pin[1])}</span>
          </div>
        )}
        {guides && guides.x != null && <div className="snap-vline" style={{ left: `${guides.x * 100}%` }} />}
        {guides && guides.y != null && <div className="snap-hline" style={{ top: `${guides.y * 100}%` }} />}

        {mode === "exact" && (
          <button className="exact-btn" onClick={onRenderExact}><Icon name="eye" size={13} />Render exact frame @ {fmt(time)}</button>
        )}
      </div>
      {drag && readout && <div className="drag-readout" style={{ left: readout.x + 16, top: readout.y + 16 }}>{readoutText}</div>}
      <div className="stage-help">
        {pinned
          ? <span>Drag the <b>pin</b> to set the <span className="mono">\pos</span> anchor · <b>Esc</b> cancels. Switch off free placement to edit margins.</span>
          : <span>Drag an edge to set <b>margins</b> (symmetric) · <b>Shift</b> = one side · <b>Alt</b> = ignore snapping · <b>Esc</b> cancels.</span>}
      </div>
    </div>
  );
}

function Waveform({ dur, time, onSeek, height = 56, ruler = true, showPlayhead = true }) {
  const progress = dur ? time / dur : 0;
  const seek = (e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur); };
  const marks = Array.from({ length: 6 }, (_, i) => fmt((dur / 5) * i).replace(/\.\d+$/, ""));
  return (
    <div className="wave-wrap">
      {ruler && <div className="ruler">{marks.map((m, i) => <span key={i}>{m}</span>)}<span className="wave-tag">waveform · placeholder (no audio decode yet)</span></div>}
      <div className="wave" style={{ height }} onClick={seek}>
        {WAVE_BARS.map((b, i) => <span key={i} className={"bar" + ((i / WAVE_BARS.length) <= progress ? " on" : "")} style={{ height: `${b}%` }} />)}
        {showPlayhead && <div className="playhead" style={{ left: `${progress * 100}%` }} />}
      </div>
    </div>
  );
}

// ── snap engine ──────────────────────────────────────────────────────────────
// Edges (in seconds) magnetize to candidate times: neighbour block edges, the
// playhead, event/group boundaries, and the track start/end. Returns the snapped
// value plus the hit candidate (for the on-track guide). Alt is handled upstream.
const SNAP_PX = 9;            // pull distance — sticky but not grabby
const REVEAL_PX = 40;        // candidate lines fade in within this distance
const snapEdge = (val, cands, pxPerSec, enabled) => {
  if (!enabled) return { val, hit: null };
  const tol = SNAP_PX / pxPerSec;
  let hit = null, bestD = tol + 1e-9;
  for (const c of cands) { const d = Math.abs(c.t - val); if (d <= bestD) { bestD = d; hit = c; } }
  return hit ? { val: hit.t, hit } : { val, hit: null };
};
// candidate guides within reveal range of any dragged edge (for the soft preview)
const nearLines = (edges, cands, pxPerSec) => {
  const reveal = REVEAL_PX / pxPerSec, seen = new Set(), out = [];
  for (const c of cands) {
    let d = Infinity; for (const v of edges) d = Math.min(d, Math.abs(c.t - v));
    if (d > reveal) continue;
    const k = c.t.toFixed(4); if (seen.has(k)) continue; seen.add(k);
    out.push({ t: c.t, kind: c.kind, strength: Math.max(0, 1 - d / reveal) });
  }
  return out;
};

// blocks: [{wid, s, e, gi, del, live, sel, multi, inFin, inFout, accumulate}]
function WordTrack({ blocks, dur, time, palette, magnet = true, eventBounds = [], onSelect, onRange, onToggle, onRetime, onSnap, showPlayhead = true }) {
  const progress = dur ? time / dur : 0;
  const trackRef = React.useRef(null);

  const candidatesFor = (exclude) => {
    const c = [{ t: 0, kind: "edge" }, { t: dur, kind: "edge" }, { t: time, kind: "playhead" }];
    eventBounds.forEach(b => { c.push({ t: b.s, kind: "event" }, { t: b.e, kind: "event" }); });
    blocks.forEach(b => { if (exclude.has(b.wid)) return; c.push({ t: b.s, kind: "block" }, { t: b.e, kind: "block" }); });
    return c;
  };

  const beginDrag = (e, w, edge) => {
    if (w.del) return;
    e.preventDefault(); e.stopPropagation();
    const rect = trackRef.current.getBoundingClientRect();
    const pps = rect.width / dur;
    const startX = e.clientX, origS = w.s, origE = w.e;
    // group move: if the grabbed block is part of a multi-selection, move them all together
    const groupMove = edge === "move" && w.multi && blocks.filter(b => b.multi && !b.del).length > 1;
    const movers = groupMove ? blocks.filter(b => b.multi && !b.del).map(b => ({ wid: b.wid, s: b.s, e: b.e })) : [{ wid: w.wid, s: origS, e: origE }];
    const gMinS = Math.min(...movers.map(m => m.s)), gMaxE = Math.max(...movers.map(m => m.e));
    const cands = candidatesFor(new Set(movers.map(m => m.wid)));
    let moved = false, pushed = false;
    document.body.classList.add("tl-drag");

    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - startX) < 3) return;
      moved = true;
      const dSec = (ev.clientX - startX) / pps;
      const snapOn = magnet !== ev.altKey;           // Alt inverts the current mode
      let ns = origS, ne = origE, guide = null, nearEdges = [];
      const mark = (hit) => { if (hit) guide = { t: hit.t, kind: hit.kind }; };

      if (edge === "move") {
        const rawS = origS + dSec, rawE = origE + dSec;
        const a = snapEdge(rawS, cands, pps, snapOn), b = snapEdge(rawE, cands, pps, snapOn);
        const da = a.hit ? Math.abs(a.val - rawS) : Infinity;
        const db = b.hit ? Math.abs(b.val - rawE) : Infinity;
        let corr = 0;
        if (a.hit && da <= db) { corr = a.val - rawS; mark(a.hit); }
        else if (b.hit) { corr = b.val - rawE; mark(b.hit); }
        let delta = dSec + corr;
        if (gMinS + delta < 0) delta = -gMinS;          // clamp whole group within [0, dur]
        if (gMaxE + delta > dur) delta = dur - gMaxE;
        movers.forEach((m, i) => onRetime(m.wid, "move", m.s + delta, m.e + delta, !pushed && i === 0));
        pushed = true;
        const near = snapOn ? nearLines([origS + delta, origE + delta], cands, pps) : [];
        onSnap && onSnap({ hit: guide, near });
        return;
      } else if (edge === "l") {
        const a = snapEdge(origS + dSec, cands, pps, snapOn); mark(a.hit);
        ns = Math.max(0, Math.min(a.val, origE - 0.05));
        if (guide && (ns <= 0 || ns >= origE - 0.05)) guide.t = ns;
        nearEdges = [origS + dSec];
      } else {
        const a = snapEdge(origE + dSec, cands, pps, snapOn); mark(a.hit);
        ne = Math.min(dur, Math.max(a.val, origS + 0.05));
        if (guide && (ne >= dur || ne <= origS + 0.05)) guide.t = ne;
        nearEdges = [origE + dSec];
      }
      onRetime(w.wid, edge, ns, ne, !pushed); pushed = true;
      const near = snapOn ? nearLines(nearEdges, cands, pps) : [];
      onSnap && onSnap({ hit: guide, near });
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("tl-drag");
      onSnap && onSnap(null);
      if (!moved && edge === "move") {
        if (ev.shiftKey) onRange(w.wid);
        else if (ev.ctrlKey || ev.metaKey) onToggle(w.wid);
        else onSelect(w.wid);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="track" ref={trackRef}>
      {blocks.map((w) => {
        const left = (w.s / dur) * 100, width = Math.max(0.8, ((w.e - w.s) / dur) * 100);
        const cls = "block" + (w.live ? " live" : "") + (w.sel ? " sel" : "") + (w.multi ? " multi" : "") + (w.del ? " del" : "");
        return (
          <div key={w.wid} className={cls} style={{ left: `${left}%`, width: `${width}%`, background: palette[w.gi % 10] }}
            onPointerDown={(ev) => { if (ev.target.closest(".rs")) return; beginDrag(ev, w, "move"); }}
            title={`${w.text} · ${w.s.toFixed(2)}–${w.e.toFixed(2)}s · ${w.accumulate}`}>
            <span className="rs l" onPointerDown={(ev) => beginDrag(ev, w, "l")} />
            {w.inFin && <span className="fade in on" title="fade-in group" />}
            {w.subs && w.subs.length > 1
              ? w.subs.map((sub, i) => {
                  const denom = (w.e - w.s) || 1;
                  return <span key={i} className="blk-seg" style={{ left: `${((sub.s - w.s) / denom) * 100}%`, width: `${((sub.e - sub.s) / denom) * 100}%`, borderLeft: i > 0 ? "1px dashed rgba(255,255,255,.5)" : "none" }} title={`${w.subTexts[i]} · ${sub.s.toFixed(2)}–${sub.e.toFixed(2)}s`}>{w.subTexts[i]}</span>;
                })
              : <span className="blk-t">{w.text}</span>}
            {w.inFout && <span className="fade out on" title="fade-out group" />}
            <span className="rs r" onPointerDown={(ev) => beginDrag(ev, w, "r")} />
          </div>
        );
      })}
      {showPlayhead && <div className="playhead" style={{ left: `${progress * 100}%` }} />}
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
