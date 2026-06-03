// app.jsx — Project Library → merged editor wired to the real-shaped model (model.jsx).
// Selection scopes (cue/group/global) drive the waterfall; ops mutate the project
// through one shared history (undo/redo). A simulated MCP "AI agent" edits live too.
const { useState, useEffect, useRef } = React;

const PROJ_NAMES = Object.fromEntries(PROJECTS.map(p => [p.id, p.name]));

function useHistory(initial) {
  const [hist, setHist] = useState({ past: [], present: initial, future: [] });
  const set = (updater, meta) => setHist(h => {
    const next = typeof updater === "function" ? updater(h.present) : updater;
    return { past: [...h.past, h.present], present: next, future: [] };
  });
  const undo = () => setHist(h => h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h);
  const redo = () => setHist(h => h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h);
  return { project: hist.present, set, undo, redo, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0 };
}

function Editor({ projectId, onHome }) {
  const H = useHistory(clone(INITIAL_PROJECT));
  const P = H.project;
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(1.6);
  const [sel, setSel] = useState({ scope: "cue", gi: 0, tok: tokAt(INITIAL_PROJECT, 0, 0, 3) });
  const [selWords, setSelWords] = useState(new Set());
  const [collapsed, setCollapsed] = useState(new Set());
  const [railTab, setRailTab] = useState("inspector");
  const [dockTab, setDockTab] = useState("lanes");
  const [pvMode, setPvMode] = useState("live");
  const [toast, setToast] = useState(null);
  const [aiHot, setAiHot] = useState(null); // {key, tier}
  const raf = useRef(null);

  const dur = totalDuration(P);

  // keep sel.tok in sync with the live project (after edits/undo)
  const curTok = sel.tok ? tokAtLoc(P, sel.gi, sel.tok.li, sel.tok.ti) : null;
  const selWid = curTok ? curTok.ids[0] : null;

  // playback
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now) => { const dt = (now - last) / 1000; last = now; setTime(t => (t + dt >= dur ? 0 : t + dt)); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, dur]);

  // simulated AI agent editing over MCP (shared timeline)
  useEffect(() => {
    const fire = () => {
      H.set(p => { const np = clone(p); const g = np.layout[1]; g.style = { ...g.style, bold: !(g.style.bold ?? np.global_style.bold) }; return np; });
      setAiHot({ key: "g1", tier: "group" });
      setToast({ ai: true, msg: "AI agent toggled Bold on “Chorus”" });
      setTimeout(() => setAiHot(null), 2600);
      setTimeout(() => setToast(t => (t && t.ai ? null : t)), 3200);
    };
    const t1 = setTimeout(fire, 11000);
    const iv = setInterval(fire, 26000);
    return () => { clearTimeout(t1); clearInterval(iv); };
  }, []);

  // ── selection ──
  const selectWord = (gi, li, ti, wid) => { setSel({ scope: "cue", gi, tok: { li, ti } }); setSelWords(new Set([wid])); setRailTab("inspector"); };
  const selectWordByWid = (wid) => { const f = findTokByWord(P, wid); if (f) selectWord(f.gi, f.li, f.ti, wid); };
  const selectEvent = (gi) => { setSel({ scope: "group", gi, tok: null }); setSelWords(new Set()); setRailTab("inspector"); };
  const selectTier = (scope) => setSel(s => ({ ...s, scope }));
  const shiftWord = (wid) => setSelWords(s => { const n = new Set(s); n.has(wid) ? n.delete(wid) : n.add(wid); return n; });

  // ── style edits (waterfall) ──
  const setStyle = (tier, key, value) => H.set(p => {
    const np = clone(p);
    if (tier === "global") np.global_style[key] = value;
    else if (tier === "group") np.layout[sel.gi].style[key] = value;
    else { const t = np.layout[sel.gi].lines[sel.tok.li].toks[sel.tok.ti]; t.style[key] = value; }
    return np;
  });
  const clearStyle = (tier, key) => H.set(p => {
    const np = clone(p);
    if (tier === "group") delete np.layout[sel.gi].style[key];
    else if (tier === "cue") delete np.layout[sel.gi].lines[sel.tok.li].toks[sel.tok.ti].style[key];
    return np;
  });

  // ── fade groups ──
  const wordsForOp = () => (selWords.size ? [...selWords] : (selWid != null ? [selWid] : []));
  const groupFade = (kind) => {
    const ids = wordsForOp(); if (ids.length < 1) return;
    H.set(p => {
      const np = clone(p);
      const arr = kind === "in" ? np.fin_tags : np.fout_tags;
      arr.forEach(t => t.ids = t.ids.filter(id => !ids.includes(id)));
      for (let i = arr.length - 1; i >= 0; i--) if (!arr[i].ids.length) arr.splice(i, 1);
      const usedColors = arr.map(t => t.color);
      let color = 0; while (usedColors.includes(color) && color < 9) color++;
      arr.push({ ids: [...ids].sort((a, b) => a - b), color, trigger: null, dur: null });
      return np;
    });
    setToast({ msg: `Grouped ${ids.length} words to fade ${kind} together` }); setTimeout(() => setToast(null), 2200);
  };
  const clearFade = (kind) => {
    const wid = selWid; if (wid == null) return;
    H.set(p => { const np = clone(p); const arr = kind === "in" ? np.fin_tags : np.fout_tags;
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i].ids.includes(wid)) arr.splice(i, 1); return np; });
  };
  const setFadeProps = (kind, patch) => {
    const wid = selWid; if (wid == null) return;
    H.set(p => { const np = clone(p); const arr = kind === "in" ? np.fin_tags : np.fout_tags;
      const t = arr.find(t => t.ids.includes(wid)); if (t) Object.assign(t, patch); return np; });
  };

  // ── layout ops ──
  const mergeWords = () => {
    const ids = [...selWords].sort((a, b) => a - b); if (ids.length < 2) return;
    H.set(p => {
      const np = clone(p); const first = findTokByWord(np, ids[0]); if (!first) return p;
      const line = np.layout[first.gi].lines[first.li];
      // collect tokens in this line whose ids are all selected & contiguous
      const merged = []; const keep = [];
      line.toks.forEach(t => { if (t.ids.every(id => ids.includes(id))) merged.push(...t.ids); else keep.push(t); });
      if (merged.length < 2) return p;
      const newTok = { ids: merged.sort((a, b) => a - b), sep: " ", del: false, style: {} };
      const idx = line.toks.findIndex(t => t.ids.includes(ids[0]));
      keep.splice(Math.min(idx, keep.length), 0, newTok);
      line.toks = keep;
      return np;
    });
    setSelWords(new Set());
  };
  const mergeEvents = () => {
    const gi = sel.gi; if (gi == null || gi >= P.layout.length - 1) return;
    H.set(p => { const np = clone(p); const a = np.layout[gi], b = np.layout[gi + 1];
      a.lines = [...a.lines, ...b.lines]; np.layout.splice(gi + 1, 1); return np; });
    setToast({ msg: "Merged event into the next" }); setTimeout(() => setToast(null), 2000);
  };
  const ungroupEvent = () => {
    const gi = sel.gi; if (gi == null) return;
    H.set(p => { const np = clone(p); const g = np.layout[gi];
      const toks = g.lines.flatMap(l => l.toks);
      const solos = toks.map((t, i) => ({ label: g.label + " ·" + (i + 1), accumulate: "off", win_start: null, win_end: null, linger: null, del: false, style: {}, lines: [{ toks: [t] }] }));
      np.layout.splice(gi, 1, ...solos); return np; });
    setToast({ msg: "Ungrouped event into solo cues" }); setTimeout(() => setToast(null), 2000);
  };
  const setLayoutProp = (patch) => H.set(p => { const np = clone(p); Object.assign(np.layout[sel.gi], patch); return np; });
  const splitEvent = () => {
    const gi = sel.gi; if (gi == null) return; const g = P.layout[gi]; if (!g || g.lines.length < 2) return;
    H.set(p => { const np = clone(p); const ev = np.layout[gi]; const at = 1; // split after first line
      const a = { ...ev, lines: ev.lines.slice(0, at) };
      const b = { ...ev, label: ev.label + " ·2", lines: ev.lines.slice(at) };
      np.layout.splice(gi, 1, a, b); return np; });
    setToast({ msg: "Split event at line break" }); setTimeout(() => setToast(null), 2000);
  };
  const breakLine = () => {
    if (!curTok) return; const { gi, li, ti } = { gi: sel.gi, li: sel.tok.li, ti: sel.tok.ti };
    H.set(p => { const np = clone(p); const line = np.layout[gi].lines[li]; if (ti >= line.toks.length - 1) return p;
      const a = { toks: line.toks.slice(0, ti + 1) }, b = { toks: line.toks.slice(ti + 1) };
      np.layout[gi].lines.splice(li, 1, a, b); return np; });
    setToast({ msg: "Broke line after this cue (\\N)" }); setTimeout(() => setToast(null), 2000);
  };
  const deleteSel = () => {
    const ids = wordsForOp(); if (!ids.length) return;
    const anyLive = ids.some(id => { const f = findTokByWord(P, id); return f && !f.tok.del; });
    H.set(p => { const np = clone(p);
      np.layout.forEach(g => g.lines.forEach(l => l.toks.forEach(t => { if (t.ids.some(id => ids.includes(id))) t.del = anyLive; }))); return np; });
  };
  const toggleCollapse = (gi) => setCollapsed(c => { const n = new Set(c); n.has(gi) ? n.delete(gi) : n.add(gi); return n; });
  const doExport = () => { setToast({ msg: "Burned → " + (PROJ_NAMES[projectId] || "project").toLowerCase().replace(/\s+/g, "_") + "_subbed.mp4" }); setTimeout(() => setToast(null), 2600); };

  // ── derived: caption + timeline ──
  const activeGi = (() => { let idx = 0; P.layout.forEach((g, gi) => { const [s] = eventWindow(P, gi); if (s <= time) idx = gi; }); return idx; })();
  const capWords = (() => {
    const g = P.layout[activeGi]; if (!g) return [];
    const out = [];
    g.lines.forEach(l => l.toks.filter(t => !t.del).forEach(t => {
      const sched = wordSchedule(P, activeGi, t.ids[0]);
      const endT = Math.max(...t.ids.map(id => P.words[id].end));
      const rs = resolveStyle(P, activeGi, t);
      const fill = rs.primary.src !== "global" ? rs.primary.value : null;
      out.push({ wid: t.ids[0], text: tokText(P, t), live: sched.start_s <= time && time < endT, pending: sched.start_s > time + 0.001, sel: t.ids.includes(selWid), fill });
    }));
    return out;
  })();
  const blocks = tokens(P).filter(t => true).map(t => {
    const live = t.ids.map(id => P.words[id]);
    const s = Math.min(...live.map(w => w.start)), e = Math.max(...live.map(w => w.end));
    const sched = wordSchedule(P, t.gi, t.ids[0]);
    return { wid: t.ids[0], text: tokText(P, t), s, e, gi: t.gi, del: t.del,
      live: s <= time && time < e, sel: t.ids.includes(selWid), multi: t.ids.some(id => selWords.has(id)),
      inFin: sched.inFin, inFout: sched.inFout, accumulate: P.layout[t.gi].accumulate };
  });

  // fade membership of current selection (for "Clear" affordance + fade editor)
  const finOf = selWid != null ? fadeTagOf(P, "in", selWid) : null;
  const foutOf = selWid != null ? fadeTagOf(P, "out", selWid) : null;
  const fadeMembership = finOf ? "in" : (foutOf ? "out" : null);

  return (
    <div className="app">
      <TopBar project={PROJ_NAMES[projectId] || "Untitled"} time={time} dur={dur} playing={playing} aiConnected={true}
        onPlay={() => setPlaying(p => !p)} onSeekRel={(d) => setTime(t => Math.max(0, Math.min(dur, t + d)))}
        onHome={onHome} onExport={doExport} onUndo={H.undo} onRedo={H.redo} canUndo={H.canUndo} canRedo={H.canRedo} />

      <div className="body">
        <aside className="rail">
          <div className="rail-tabs">
            <button className={"rail-tab" + (railTab === "style" ? " on" : "")} onClick={() => setRailTab("style")}><Icon name="sliders" size={14} />Project</button>
            <button className={"rail-tab" + (railTab === "inspector" ? " on" : "")} onClick={() => setRailTab("inspector")}><Icon name="layers" size={14} />Inspector</button>
          </div>
          <div className="rail-body">
            {railTab === "style"
              ? <ControlsRail placement={P.placement} />
              : <>
                  <StyleWaterfall project={P} sel={{ scope: sel.scope, gi: sel.gi, tok: curTok }} aiTier={aiHot && aiHot.key === "g" + sel.gi ? aiHot.tier : null}
                    onSelectTier={selectTier} onSetStyle={setStyle} onClearStyle={clearStyle} />
                  {(finOf || foutOf) && <FadeGroupPanel finOf={finOf} foutOf={foutOf} globals={P.globals} palette={P.palette} onSet={setFadeProps} onClear={clearFade} />}
                  {curTok && <TimingPanel tok={curTok} project={P} />}
                </>}
          </div>
        </aside>

        <main className="center">
          <div className="stage-pad">
            <PreviewStage capWords={capWords} time={time} mode={pvMode} onMode={setPvMode}
              onSelectWord={selectWordByWid} onRenderExact={() => { setToast({ msg: "Rendered exact libass frame @ " + time.toFixed(2) + "s" }); setTimeout(() => setToast(null), 1800); }} />
          </div>
        </main>
      </div>

      <section className="dock">
        <div className="dock-tabs">
          <button className={"dock-tab" + (dockTab === "timeline" ? " on" : "")} onClick={() => setDockTab("timeline")}><Icon name="waveform" size={13} />Timeline</button>
          <button className={"dock-tab" + (dockTab === "lanes" ? " on" : "")} onClick={() => setDockTab("lanes")}><Icon name="layers" size={13} />Cue lanes</button>
          <span className="dock-hint">{dockTab === "timeline" ? "Click to scrub · click a block to select · shift-click to multi-select" : "Click an event header or cue · shift-click cues to multi-select for grouping"}</span>
        </div>
        <OpsToolbar selCount={selWords.size} canGroupFade={selWords.size >= 1 || selWid != null} fadeMembership={fadeMembership}
          canMergeWords={selWords.size >= 2} canMergeEvents={sel.scope === "group" && sel.gi < P.layout.length - 1}
          canSplitEvent={sel.scope === "group" && sel.gi != null && P.layout[sel.gi] && P.layout[sel.gi].lines.length > 1}
          canBreakLine={!!curTok && P.layout[sel.gi] && P.layout[sel.gi].lines[sel.tok.li].toks.length - 1 > sel.tok.ti}
          hasEvent={sel.scope === "group"} wordDeleted={curTok && curTok.del}
          onGroupFade={groupFade} onClearFade={clearFade} onMergeWords={mergeWords} onMergeEvents={mergeEvents}
          onSplitEvent={splitEvent} onBreakLine={breakLine}
          onUngroupEvent={ungroupEvent} onDelete={deleteSel} onUndo={H.undo} onRedo={H.redo} canUndo={H.canUndo} canRedo={H.canRedo} />
        <div className="dock-body">
          {dockTab === "timeline" ? (
            <div className="wave-wrap">
              <Waveform dur={dur} time={time} onSeek={setTime} />
              <WordTrack blocks={blocks} dur={dur} time={time} palette={P.palette} onSelect={selectWordByWid} onShift={shiftWord} />
            </div>
          ) : (
            <CueLanes project={P} sel={{ scope: sel.scope, gi: sel.gi, tok: curTok }} selectedWords={selWords} collapsed={collapsed}
              aiHotKey={aiHot ? aiHot.key : null} onSelectWord={selectWord} onShiftWord={shiftWord} onSelectEvent={selectEvent} onToggleCollapse={toggleCollapse} />
          )}
        </div>
        {sel.scope === "group" && sel.gi != null && <EventStrip g={P.layout[sel.gi]} onSet={setLayoutProp} />}
      </section>

      {toast && <div className={"toast" + (toast.ai ? " ai" : "")}><Icon name={toast.ai ? "sparkles" : "check"} size={15} />{toast.msg}{toast.ai && <button className="toast-undo" onClick={H.undo}>Undo</button>}</div>}
    </div>
  );
}

// fade-group trigger/dur editor (shown when selection is in a fade group)
function FadeGroupPanel({ finOf, foutOf, globals, palette, onSet, onClear }) {
  const Row = ({ kind, tag }) => {
    if (!tag) return null;
    const trigDef = tag.trigger == null, durDef = tag.dur == null;
    const defDur = kind === "in" ? globals.fade_in_ms : globals.fade_out_ms;
    return (
      <div className="fg-row" style={{ "--band": palette[tag.color] }}>
        <span className="fg-k"><span className="fg-band" />Fade-{kind}<span className="fg-n">{tag.ids.length} words</span></span>
        <div className="fg-fields">
          <span className={"fg-f" + (trigDef ? " inh" : " ovr")}>
            trig <b>{trigDef ? "auto" : tag.trigger.toFixed(2) + "s"}</b>
            <span className="pm" onClick={() => onSet(kind, { trigger: (tag.trigger == null ? 14 : tag.trigger) - 0.5 })}>−</span>
            <span className="pm" onClick={() => onSet(kind, { trigger: (tag.trigger == null ? 14 : tag.trigger) + 0.5 })}>+</span>
            {!trigDef && <span className="pm x" onClick={() => onSet(kind, { trigger: null })}>auto</span>}
          </span>
          <span className={"fg-f" + (durDef ? " inh" : " ovr")}>
            dur <b>{durDef ? defDur : tag.dur}ms</b>
            <span className="pm" onClick={() => onSet(kind, { dur: Math.max(0, (tag.dur == null ? defDur : tag.dur) - 50) })}>−</span>
            <span className="pm" onClick={() => onSet(kind, { dur: (tag.dur == null ? defDur : tag.dur) + 50 })}>+</span>
            {!durDef && <span className="pm x" onClick={() => onSet(kind, { dur: null })}>auto</span>}
          </span>
        </div>
      </div>
    );
  };
  return (
    <div className="fg-panel">
      <div className="fg-head"><Icon name="sparkles" size={13} />Fade group<span className="fg-hint">grey = inherits global</span></div>
      <Row kind="in" tag={finOf} />
      <Row kind="out" tag={foutOf} />
    </div>
  );
}

// per-event layout props strip (accumulate / window / linger)
function EventStrip({ g, onSet }) {
  return (
    <div className="evt-strip">
      <span className="es-l"><Icon name="layers" size={12} />{g.label}</span>
      <span className="es-grp">Accumulate
        <span className="seg2 sm">
          {["words", "lines", "off"].map(m => <button key={m} className={g.accumulate === m ? "on" : ""} onClick={() => onSet({ accumulate: m })}>{m}</button>)}
        </span>
      </span>
      <span className="es-grp">Linger
        <span className="pv-step sm">
          <span className="pm" onClick={() => onSet({ linger: Math.max(0, (g.linger ?? 0) - 0.1) })}>−</span>
          <span className="v">{(g.linger ?? 0).toFixed(1)}s</span>
          <span className="pm" onClick={() => onSet({ linger: (g.linger ?? 0) + 0.1 })}>+</span>
        </span>
      </span>
      <span className="es-note">window auto · {g.win_start == null ? "first word" : g.win_start + "s"} → {g.win_end == null ? "last + linger" : g.win_end + "s"}</span>
    </div>
  );
}

// helpers to (re)locate a token
function tokAt(project, gi, li, wid) { const t = project.layout[gi].lines[li].toks.find(t => t.ids.includes(wid)); const ti = project.layout[gi].lines[li].toks.indexOf(t); return { li, ti }; }
function tokAtLoc(project, gi, li, ti) { try { return project.layout[gi].lines[li].toks[ti] || null; } catch (e) { return null; } }

function App() {
  const [view, setView] = useState({ name: "library", projectId: null });
  if (view.name === "library") return <ProjectLibrary onOpen={(id) => setView({ name: "editor", projectId: id })} />;
  return <Editor projectId={view.projectId} onHome={() => setView({ name: "library", projectId: null })} />;
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
