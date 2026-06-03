// app.jsx — interactive shell: Project Library → merged editor (Layout 1 · Timeline Dock).
// Model: groups (events) → words(cues). A cue = one+ words with start/stop bounds.
// A "solo" group is a standalone cue. All edits flow through a history (undo/redo).
const { useState, useEffect, useRef } = React;

const INITIAL_GROUPS = [
  { id: "g0", label: "Verse 1", solo: false, words: [
    { id: 0, text: "Caught", s: 0.30, e: 0.70 },
    { id: 1, text: "in", s: 0.80, e: 1.00 },
    { id: 2, text: "a", s: 1.05, e: 1.20 },
    { id: 3, text: "bleating", s: 1.40, e: 2.00, fadeOut: true },
    { id: 4, text: "obsession", s: 2.20, e: 3.10, fadeOut: true },
  ] },
  { id: "g1", label: "Verse 1", solo: false, words: [
    { id: 5, text: "Tangled", s: 3.70, e: 4.20 },
    { id: 6, text: "up", s: 4.25, e: 4.45 },
    { id: 7, text: "in", s: 4.50, e: 4.70 },
    { id: 8, text: "wool", s: 4.95, e: 5.45 },
    { id: 9, text: "and", s: 5.55, e: 5.75 },
    { id: 10, text: "static", s: 5.95, e: 6.85 },
  ] },
];
const PROJ_NAMES = Object.fromEntries(PROJECTS.map(p => [p.id, p.name]));
const clone = (g) => g.map(x => ({ ...x, words: x.words.map(w => ({ ...w })) }));
const snap = (t) => Math.round(t / 0.05) * 0.05;

// minimal undo/redo history over the groups array
function useHistory(initial) {
  const [hist, setHist] = useState({ past: [], present: initial, future: [] });
  const set = (updater) => setHist(h => {
    const next = typeof updater === "function" ? updater(h.present) : updater;
    return { past: [...h.past, h.present], present: next, future: [] };
  });
  const undo = () => setHist(h => h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h);
  const redo = () => setHist(h => h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h);
  return { groups: hist.present, set, undo, redo, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0 };
}

function Editor({ projectId, onHome }) {
  const H = useHistory(INITIAL_GROUPS);
  const groups = H.groups;
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(1.6);
  const [preset, setPreset] = useState("Karaoke Bounce");
  const [sel, setSel] = useState({ type: "word", id: 3 });
  const [railTab, setRailTab] = useState("inspector");
  const [dockTab, setDockTab] = useState("timeline");
  const [collapsed, setCollapsed] = useState(new Set());
  const [toast, setToast] = useState(null);
  const raf = useRef(null);

  // derived
  const allWords = groups.flatMap((g, gi) => g.words.map(w => ({ ...w, gi, groupId: g.id })));
  const liveWords = allWords.filter(w => !w.del);
  const dur = Math.max(8, ...allWords.map(w => w.e), 0) + 1.2;
  const liveId = (() => { const w = liveWords.find(w => w.s <= time && time < w.e); return w ? w.id : null; })();
  const activeGroupIdx = (() => { let idx = 0; groups.forEach((g, i) => { const f = g.words.filter(x => !x.del)[0]; if (f && f.s <= time) idx = i; }); return idx; })();
  const activeLine = groups[activeGroupIdx] ? groups[activeGroupIdx].words.filter(w => !w.del) : [];
  const selId = sel.type === "word" ? sel.id : null;
  const selWord = sel.type === "word" ? allWords.find(w => w.id === sel.id) : null;
  const selGroupId = sel.type === "group" ? sel.id : (selWord ? selWord.groupId : null);

  // playback
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now) => { const dt = (now - last) / 1000; last = now; setTime(t => { const nt = t + dt; return nt >= dur ? 0 : nt; }); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, dur]);

  const nextWid = () => (allWords.reduce((m, w) => Math.max(m, w.id), -1) + 1);
  const selectWord = (id) => { setSel({ type: "word", id }); setRailTab("inspector"); };
  const selectGroup = (id) => { setSel({ type: "group", id }); setRailTab("inspector"); };

  // ── cue operations (all revertible via history) ──
  const editText = (id, text) => H.set(gs => clone(gs).map(g => ({ ...g, words: g.words.map(w => w.id === id ? { ...w, text } : w) })));
  const nudge = (id, ds, de) => H.set(gs => clone(gs).map(g => ({ ...g, words: g.words.map(w => {
    if (w.id !== id) return w;
    let s = Math.max(0, snap(w.s + ds)), e = snap(w.e + de);
    if (e <= s) { if (de) e = s + 0.05; else s = e - 0.05; }
    return { ...w, s: Math.max(0, s), e };
  }) })));
  const toggleDel = (id) => H.set(gs => clone(gs).map(g => ({ ...g, words: g.words.map(w => w.id === id ? { ...w, del: !w.del } : w) })));
  const addInGroup = () => {
    const gid = selGroupId || groups[activeGroupIdx].id;
    const id = nextWid();
    H.set(gs => clone(gs).map(g => g.id === gid
      ? { ...g, words: [...g.words, { id, text: "word", s: snap(time), e: snap(time) + 0.6 }].sort((a, b) => a.s - b.s) }
      : g));
    selectWord(id);
  };
  const addSolo = () => {
    const id = nextWid();
    const gid = "g" + Date.now().toString(36);
    H.set(gs => [...clone(gs), { id: gid, label: "Cue", solo: true, words: [{ id, text: "new cue", s: snap(time), e: snap(time) + 0.8 }] }]
      .sort((a, b) => (a.words[0] ? a.words[0].s : 0) - (b.words[0] ? b.words[0].s : 0)));
    selectWord(id);
  };
  const splitWord = (id) => {
    H.set(gs => clone(gs).map(g => {
      const i = g.words.findIndex(w => w.id === id);
      if (i < 0) return g;
      const w = g.words[i], mid = snap((w.s + w.e) / 2), cut = Math.ceil(w.text.length / 2);
      const a = { ...w, e: mid, text: w.text.slice(0, cut), frac: true, fadeOut: false };
      const b = { ...w, id: nextWid(), s: mid, text: w.text.slice(cut) || "…", frac: true };
      return { ...g, words: [...g.words.slice(0, i), a, b, ...g.words.slice(i + 1)] };
    }));
  };
  const toggleCollapse = (gid) => setCollapsed(c => { const n = new Set(c); n.has(gid) ? n.delete(gid) : n.add(gid); return n; });
  const doExport = () => { setToast("Burned → " + (PROJ_NAMES[projectId] || "project").toLowerCase().replace(/\s+/g, "_") + "_subbed.mp4"); setTimeout(() => setToast(null), 2600); };

  return (
    <div className="app">
      <TopBar project={PROJ_NAMES[projectId] || "Untitled"} time={time} dur={dur} playing={playing}
        onPlay={() => setPlaying(p => !p)} onSeekRel={(d) => setTime(t => Math.max(0, Math.min(dur, t + d)))}
        onHome={onHome} onExport={doExport} onUndo={H.undo} onRedo={H.redo} canUndo={H.canUndo} canRedo={H.canRedo} />

      <div className="body">
        <aside className="rail">
          <div className="rail-tabs">
            <button className={"rail-tab" + (railTab === "style" ? " on" : "")} onClick={() => setRailTab("style")}><Icon name="sliders" size={14} />Style</button>
            <button className={"rail-tab" + (railTab === "inspector" ? " on" : "")} onClick={() => setRailTab("inspector")}><Icon name="layers" size={14} />Inspector</button>
          </div>
          <div className="rail-body">
            {railTab === "style"
              ? <ControlsRail preset={preset} onPreset={setPreset} />
              : <Inspector selection={sel} groups={groups} allWords={allWords} preset={preset}
                  onText={editText} onNudge={nudge} onToggleDel={toggleDel} onSplit={splitWord} />}
          </div>
        </aside>

        <main className="center">
          <div className="stage-pad">
            <PreviewStage lines={[activeLine]} time={time} liveId={liveId} selId={selId} preset={preset} onSelectWord={selectWord} />
          </div>
        </main>
      </div>

      <section className="dock">
        <div className="dock-tabs">
          <button className={"dock-tab" + (dockTab === "timeline" ? " on" : "")} onClick={() => setDockTab("timeline")}><Icon name="waveform" size={13} />Timeline</button>
          <button className={"dock-tab" + (dockTab === "lanes" ? " on" : "")} onClick={() => setDockTab("lanes")}><Icon name="layers" size={13} />Cue lanes</button>
          <span className="dock-hint">{dockTab === "timeline" ? "Click the waveform to scrub · click a block to edit its bounds" : "Click a cue header or word · add / split / delete below"}</span>
        </div>
        <CueToolbar canAddInGroup={!!selGroupId || groups.length > 0} canSplit={!!selWord} hasWordSel={!!selWord} wordDeleted={selWord && selWord.del}
          onAddInGroup={addInGroup} onAddSolo={addSolo} onSplit={() => selWord && splitWord(selWord.id)} onToggleDel={() => selWord && toggleDel(selWord.id)}
          onUndo={H.undo} onRedo={H.redo} canUndo={H.canUndo} canRedo={H.canRedo} />
        <div className="dock-body">
          {dockTab === "timeline" ? (
            <div className="wave-wrap">
              <Waveform dur={dur} time={time} onSeek={setTime} />
              <WordTrack words={allWords} dur={dur} time={time} liveId={liveId} selId={selId} onSelect={selectWord} />
            </div>
          ) : (
            <CueLanes groups={groups} selWordId={selId} selGroupId={sel.type === "group" ? sel.id : null} collapsed={collapsed}
              onSelectWord={selectWord} onSelectGroup={selectGroup} onToggleCollapse={toggleCollapse} />
          )}
        </div>
      </section>

      {toast && <div className="toast"><Icon name="check" size={15} />{toast}</div>}
    </div>
  );
}

function App() {
  const [view, setView] = useState({ name: "library", projectId: null });
  if (view.name === "library") return <ProjectLibrary onOpen={(id) => setView({ name: "editor", projectId: id })} />;
  return <Editor projectId={view.projectId} onHome={() => setView({ name: "library", projectId: null })} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
