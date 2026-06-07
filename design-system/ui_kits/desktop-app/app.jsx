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
  // live, history-less update — used during a drag so the gesture is one undo step
  const replace = (updater) => setHist(h => ({ ...h, present: typeof updater === "function" ? updater(h.present) : updater }));
  const undo = () => setHist(h => h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h);
  const redo = () => setHist(h => h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h);
  return { project: hist.present, set, replace, undo, redo, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0 };
}

function Editor({ projectId, onHome }) {
  const H = useHistory(clone(INITIAL_PROJECT));
  const P = H.project;
  const [flash, setFlash] = useState(null);   // "undo"|"redo" — brief press feedback
  const doUndo = () => { if (!H.canUndo) return; H.undo(); setFlash("undo"); setTimeout(() => setFlash(f => f === "undo" ? null : f), 200); };
  const doRedo = () => { if (!H.canRedo) return; H.redo(); setFlash("redo"); setTimeout(() => setFlash(f => f === "redo" ? null : f), 200); };
  const actRef = useRef({}); actRef.current = { doUndo, doRedo };
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
  const [exportOpen, setExportOpen] = useState(false);
  const [magnet, setMagnet] = useState(true);   // timeline snapping (default on)
  const [snapGuide, setSnapGuide] = useState(null); // {t, kind} while dragging
  const [altHeld, setAltHeld] = useState(false); // Alt momentarily inverts the magnet
  const [railW, setRailW] = useState(320);       // resizable left rail (px)
  const [dockH, setDockH] = useState(252);       // resizable bottom dock (px)
  const [shiftHeld, setShiftHeld] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const raf = useRef(null);
  const lanesRef = useRef(null);  // for playhead scrubbing
  const anchorRef = useRef(null); // range-select anchor (synchronous)
  const meta = { lyrics: "bleating_obsession.json", video: "bleating_master.mp4" };

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

  // track held modifiers (Alt inverts magnet; Shift = range-select; Ctrl/Cmd = pick)
  useEffect(() => {
    const sync = (e) => { setAltHeld(e.altKey); setShiftHeld(e.shiftKey); setCtrlHeld(e.ctrlKey || e.metaKey); };
    const blur = () => { setAltHeld(false); setShiftHeld(false); setCtrlHeld(false); };
    window.addEventListener("keydown", sync); window.addEventListener("keyup", sync); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", sync); window.removeEventListener("keyup", sync); window.removeEventListener("blur", blur); };
  }, []);

  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); e.shiftKey ? actRef.current.doRedo() : actRef.current.doUndo(); }
      else if (k === "y") { e.preventDefault(); actRef.current.doRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── selection ──
  const selectWord = (gi, li, ti, wid) => { setSel({ scope: "cue", gi, tok: { li, ti } }); setSelWords(new Set([wid])); anchorRef.current = wid; setRailTab("inspector"); };
  const selectWordByWid = (wid) => { const f = findTokByWord(P, wid); if (f) selectWord(f.gi, f.li, f.ti, wid); };
  const selectEvent = (gi) => { setSel({ scope: "group", gi, tok: null }); setSelWords(new Set()); setRailTab("inspector"); };
  const selectTier = (scope) => setSel(s => ({ ...s, scope }));
  // Ctrl/Cmd-click: toggle one word in/out of the selection (cherry-pick)
  const toggleWord = (wid) => { setSelWords(s => { const n = new Set(s); n.has(wid) ? n.delete(wid) : n.add(wid); return n; }); anchorRef.current = wid; };
  // Shift-click: select every token between the anchor and the clicked word
  const rangeWord = (wid) => {
    const toks = tokens(P), order = toks.map(t => t.ids[0]);
    const anchor = anchorRef.current != null ? anchorRef.current : selWid;
    const ia = order.indexOf(anchor), ib = order.indexOf(wid);
    if (ia < 0 || ib < 0) { setSelWords(new Set([wid])); anchorRef.current = wid; return; }
    const [lo, hi] = ia <= ib ? [ia, ib] : [ib, ia];
    const ids = new Set();
    for (let i = lo; i <= hi; i++) toks[i].ids.forEach(id => ids.add(id));
    setSelWords(ids);
  };

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
    else if (np.layout[sel.gi] && sel.tok) delete np.layout[sel.gi].lines[sel.tok.li].toks[sel.tok.ti].style[key];
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
    const first = findTokByWord(P, ids[0]); if (!first) return;
    const gi = first.gi;
    const np = clone(P); const g = np.layout[gi];
    const flat = []; g.lines.forEach((l, li) => l.toks.forEach(tok => flat.push({ tok, li })));
    const isSel = (f) => f.tok.ids.every(id => ids.includes(id));
    const pos = flat.map((f, i) => isSel(f) ? i : -1).filter(i => i >= 0);
    if (pos.length < 2) return;
    const lo = pos[0], hi = pos[pos.length - 1];
    for (let i = lo; i <= hi; i++) if (!isSel(flat[i])) return;   // selection must be contiguous
    const mergedIds = flat.slice(lo, hi + 1).flatMap(f => f.tok.ids).sort((a, b) => a - b);
    const newTok = { ids: mergedIds, sep: " ", del: false, style: {} };
    const toks = [...flat.slice(0, lo).map(f => f.tok), newTok, ...flat.slice(hi + 1).map(f => f.tok)];
    const lis = [...flat.slice(0, lo).map(f => f.li), flat[lo].li, ...flat.slice(hi + 1).map(f => f.li)];
    const lines = []; let cur = [];                              // re-segment, dropping breaks inside the merged run
    for (let i = 0; i < toks.length; i++) { cur.push(toks[i]); if (i < toks.length - 1 && lis[i] !== lis[i + 1]) { lines.push({ toks: cur }); cur = []; } }
    if (cur.length) lines.push({ toks: cur });
    g.lines = lines;
    H.set(np);
    const f2 = findTokByWord(np, mergedIds[0]); if (f2) setSel({ scope: "cue", gi: f2.gi, tok: { li: f2.li, ti: f2.ti } });
    setSelWords(new Set(mergedIds));
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
  // placement is engine-global (cfg); in the kit we store on the project for the demo.
  const setPlacement = (patch) => H.set(p => { const np = clone(p); np.placement = { ...np.placement, ...patch }; return np; });
  const setFadeDefaults = (patch) => H.set(p => { const np = clone(p); np.globals = { ...np.globals, ...patch }; return np; });
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
  // inverse of Merge words — split a merged token back into separate words (keeps them selected)
  const unmergeWord = () => {
    if (!curTok || curTok.ids.length < 2) return;
    const gi = sel.gi, li = sel.tok.li, ti = sel.tok.ti;
    const np = clone(P); const line = np.layout[gi].lines[li]; const tok = line.toks[ti];
    if (!tok || tok.ids.length < 2) return;
    const ids = tok.ids.slice().sort((a, b) => a - b);
    const solos = ids.map(id => ({ ids: [id], sep: "", del: tok.del, style: {} }));
    line.toks.splice(ti, 1, ...solos);
    H.set(np);
    setSel({ scope: "cue", gi, tok: { li, ti } });       // first solo stays the cue selection
    setSelWords(new Set(ids));                            // all unmerged words selected
    setToast({ msg: "Unmerged into separate words" }); setTimeout(() => setToast(null), 2000);
  };
  // join the \N right AFTER the selected cue (keeps the same word selected)
  const joinAfter = () => {
    if (!curTok) return; const gi = sel.gi, li = sel.tok.li, wid = selWid;
    const np = clone(P); const lines = np.layout[gi].lines; if (li >= lines.length - 1) return;
    lines[li] = { toks: [...lines[li].toks, ...lines[li + 1].toks] }; lines.splice(li + 1, 1);
    H.set(np);
    const f = findTokByWord(np, wid); if (f) setSel({ scope: "cue", gi: f.gi, tok: { li: f.li, ti: f.ti } });
    setToast({ msg: "Removed line break (\\N)" }); setTimeout(() => setToast(null), 2000);
  };
  // break/join is one toggle on “is there a \\N right after this cue?”
  const lineBreakState = () => {
    if (!curTok) return { broken: false, can: false };
    const g = P.layout[sel.gi]; if (!g) return { broken: false, can: false };
    const line = g.lines[sel.tok.li]; const ti = sel.tok.ti;
    const broken = ti === line.toks.length - 1 && sel.tok.li < g.lines.length - 1;
    return { broken, can: broken || ti < line.toks.length - 1 };
  };
  // break the line after EACH selected cue (multi-select); single = toggle break/join
  const breakAfterMany = () => {
    const sset = selWords;
    H.set(p => {
      const np = clone(p);
      np.layout.forEach(g => {
        const out = [];
        g.lines.forEach(line => {
          let run = [];
          line.toks.forEach((tok, i) => {
            run.push(tok);
            if (tok.ids.some(id => sset.has(id)) && i < line.toks.length - 1) { out.push({ toks: run }); run = []; }
          });
          if (run.length) out.push({ toks: run });
        });
        g.lines = out;
      });
      return np;
    });
    setToast({ msg: "Broke line after selected cues" }); setTimeout(() => setToast(null), 2000);
  };
  // does the selection span more than one line within some event? (then it can be joined)
  const multiLineState = () => {
    let broken = false;
    P.layout.forEach(g => { const lis = new Set(); g.lines.forEach((l, li) => l.toks.forEach(t => { if (t.ids.some(id => selWords.has(id))) lis.add(li); })); if (lis.size > 1) broken = true; });
    return broken;
  };
  // join every line that holds a selected cue onto one line (per event)
  const joinSelected = () => {
    const sset = selWords;
    H.set(p => { const np = clone(p);
      np.layout.forEach(g => {
        const lis = g.lines.map((l, li) => l.toks.some(t => t.ids.some(id => sset.has(id))) ? li : -1).filter(li => li >= 0);
        if (lis.length < 1) return;
        const lo = Math.min(...lis), hi = Math.max(...lis);
        if (hi > lo) g.lines.splice(lo, hi - lo + 1, { toks: g.lines.slice(lo, hi + 1).flatMap(l => l.toks) });
      }); return np; });
    setToast({ msg: "Joined selected cues onto one line" }); setTimeout(() => setToast(null), 2000);
  };
  const toggleLineBreak = () => {
    if (selWords.size >= 2) { multiLineState() ? joinSelected() : breakAfterMany(); return; }
    const st = lineBreakState(); if (!st.can) return; st.broken ? joinAfter() : breakLine();
  };
  const deleteSel = () => {
    const ids = wordsForOp(); if (!ids.length) return;
    const anyLive = ids.some(id => { const f = findTokByWord(P, id); return f && !f.tok.del; });
    H.set(p => { const np = clone(p);
      np.layout.forEach(g => g.lines.forEach(l => l.toks.forEach(t => { if (t.ids.some(id => ids.includes(id))) t.del = anyLive; }))); return np; });
  };
  const toggleCollapse = (gi) => setCollapsed(c => { const n = new Set(c); n.has(gi) ? n.delete(gi) : n.add(gi); return n; });

  // ── scrub the playhead by dragging it; snaps like blocks do (Alt inverts) ──
  const scrubCandidates = () => {
    const c = [{ t: 0, kind: "edge" }, { t: dur, kind: "edge" }];
    eventBounds.forEach(b => { c.push({ t: b.s, kind: "event" }, { t: b.e, kind: "event" }); });
    blocks.forEach(b => { c.push({ t: b.s, kind: "block" }, { t: b.e, kind: "block" }); });
    return c;
  };
  const scrubTo = (clientX, alt) => {
    const r = lanesRef.current.getBoundingClientRect();
    const pps = r.width / dur;
    let val = Math.max(0, Math.min(dur, ((clientX - r.left) / r.width) * dur));
    const enabled = magnet !== alt;
    let hit = null, near = [];
    if (enabled) {
      const tol = 9 / pps, reveal = 40 / pps; let best = tol + 1e-9; const seen = new Set();
      for (const c of scrubCandidates()) {
        const d = Math.abs(c.t - val);
        if (d <= best) { best = d; hit = { t: c.t, kind: c.kind }; }
        if (d <= reveal) { const k = c.t.toFixed(4); if (!seen.has(k)) { seen.add(k); near.push({ t: c.t, kind: c.kind, strength: Math.max(0, 1 - d / reveal) }); } }
      }
      if (hit) val = hit.t;
    }
    setTime(val);
    setSnapGuide(enabled ? { hit, near } : null);
  };
  const startScrub = (e) => {
    e.preventDefault(); e.stopPropagation(); scrubTo(e.clientX, e.altKey);
    document.body.classList.add("tl-drag");
    const mv = (ev) => scrubTo(ev.clientX, ev.altKey);
    const up = () => { document.body.classList.remove("tl-drag"); setSnapGuide(null); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };

  // ── retime a word/token by dragging its block (move) or an edge (l/r) ──
  // push=true on the first move of a gesture (snapshots pre-drag state); later
  // moves replace in place, so the whole drag collapses to a single undo step.
  const retimeWord = (wid, edge, ns, ne, push) => {
    (push ? H.set : H.replace)(p => {
      const np = clone(p); const f = findTokByWord(np, wid); if (!f) return p;
      const ids = f.tok.ids;
      if (edge === "move") {
        const curS = Math.min(...ids.map(id => np.words[id].start));
        const d = ns - curS;
        ids.forEach(id => { np.words[id].start += d; np.words[id].end += d; });
      } else if (edge === "l") {
        const first = ids.reduce((a, id) => np.words[id].start < np.words[a].start ? id : a, ids[0]);
        np.words[first].start = Math.min(ns, np.words[first].end - 0.05);
      } else {
        const last = ids.reduce((a, id) => np.words[id].end > np.words[a].end ? id : a, ids[0]);
        np.words[last].end = Math.max(ne, np.words[last].start + 0.05);
      }
      return np;
    });
  };
  const doBurn = (out) => { setExportOpen(false); setToast({ msg: "Burning → " + out + " · 0%" });
    setTimeout(() => setToast({ msg: "Burned → " + out }), 1400); setTimeout(() => setToast(null), 3400); };
  const doDownload = () => { setExportOpen(false); setToast({ msg: "Saved → " + (PROJ_NAMES[projectId] || "project").toLowerCase().replace(/\s+/g, "_") + ".ass" }); setTimeout(() => setToast(null), 2400); };

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
  const eventBounds = P.layout.map((g, gi) => { const [s, e] = eventWindow(P, gi); return { s, e }; });
  const blocks = tokens(P).filter(t => true).map(t => {
    const live = t.ids.map(id => P.words[id]);
    const s = Math.min(...live.map(w => w.start)), e = Math.max(...live.map(w => w.end));
    const sched = wordSchedule(P, t.gi, t.ids[0]);
    return { wid: t.ids[0], ids: t.ids, subs: t.ids.map(id => ({ s: P.words[id].start, e: P.words[id].end })), subTexts: t.ids.map(id => P.words[id].text), text: tokText(P, t), s, e, gi: t.gi, del: t.del,
      live: s <= time && time < e, sel: t.ids.includes(selWid), multi: t.ids.some(id => selWords.has(id)),
      inFin: sched.inFin, inFout: sched.inFout, accumulate: P.layout[t.gi].accumulate };
  });

  // fade membership of current selection (for "Clear" affordance + fade editor)
  const finOf = selWid != null ? fadeTagOf(P, "in", selWid) : null;
  const foutOf = selWid != null ? fadeTagOf(P, "out", selWid) : null;
  const fadeMembership = finOf ? "in" : (foutOf ? "out" : null);

  // drag-resize the rail (width) and dock (height)
  const startResize = (axis) => (e) => {
    e.preventDefault();
    const origin = axis === "x" ? e.clientX : e.clientY;
    const base = axis === "x" ? railW : dockH;
    document.body.classList.add("tl-drag");
    const mv = (ev) => {
      if (axis === "x") setRailW(Math.max(248, Math.min(560, base + (ev.clientX - origin))));
      else setDockH(Math.max(150, Math.min(620, base - (ev.clientY - origin))));
    };
    const up = () => { document.body.classList.remove("tl-drag"); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };

  return (
    <div className="app">
      <TopBar project={PROJ_NAMES[projectId] || "Untitled"} time={time} dur={dur} playing={playing} aiConnected={true}
        onPlay={() => setPlaying(p => !p)} onSeekRel={(d) => setTime(t => Math.max(0, Math.min(dur, t + d)))}
        exportOpen={exportOpen} onHome={onHome} onExport={() => setExportOpen(o => !o)} onUndo={doUndo} onRedo={doRedo} canUndo={H.canUndo} canRedo={H.canRedo} flash={flash} />
      {exportOpen && <ExportPopover projectName={PROJ_NAMES[projectId]} onBurn={doBurn} onDownload={doDownload} onClose={() => setExportOpen(false)} />}

      <div className="body">
        <aside className="rail" style={{ flex: `0 0 ${railW}px`, width: railW }}>
          <div className="rail-tabs">
            <button className={"rail-tab" + (railTab === "style" ? " on" : "")} onClick={() => setRailTab("style")}><Icon name="sliders" size={14} />Project</button>
            <button className={"rail-tab" + (railTab === "inspector" ? " on" : "")} onClick={() => setRailTab("inspector")}><Icon name="layers" size={14} />Inspector</button>
          </div>
          <div className="rail-body">
            {railTab === "style"
              ? <ControlsRail placement={P.placement} onPlacement={setPlacement} meta={meta} />
              : <>
                  <StyleWaterfall project={P} sel={{ scope: sel.scope, gi: sel.gi, tok: curTok }} aiTier={aiHot && aiHot.key === "g" + sel.gi ? aiHot.tier : null}
                    onSelectTier={selectTier} onSetStyle={setStyle} onClearStyle={clearStyle} />
                  {(finOf || foutOf) && <FadeGroupPanel finOf={finOf} foutOf={foutOf} globals={P.globals} palette={P.palette} onSet={setFadeProps} onClear={clearFade} />}
                  <FadeDefaultsPanel globals={P.globals} onSet={setFadeDefaults} />
                  {curTok && <TimingPanel tok={curTok} project={P} />}
                </>}
          </div>
          <div className="rail-resize" onPointerDown={startResize("x")} title="Drag to resize" />
        </aside>

        <main className="center">
          <div className="stage-pad">
            <PreviewStage capWords={capWords} time={time} mode={pvMode} onMode={setPvMode}
              placement={P.placement} onPlacement={setPlacement}
              onSelectWord={selectWordByWid} onRenderExact={() => { setToast({ msg: "Rendered exact libass frame @ " + time.toFixed(2) + "s" }); setTimeout(() => setToast(null), 1800); }} />
          </div>
        </main>
      </div>

      <section className="dock" style={{ flex: `0 0 ${dockH}px`, height: dockH }}>
        <div className="dock-resize" onPointerDown={startResize("y")} title="Drag to resize" />
        <div className="dock-tabs">
          <button className={"dock-tab" + (dockTab === "timeline" ? " on" : "")} onClick={() => setDockTab("timeline")}><Icon name="waveform" size={13} />Timeline</button>
          <button className={"dock-tab" + (dockTab === "lanes" ? " on" : "")} onClick={() => setDockTab("lanes")}><Icon name="layers" size={13} />Cue lanes</button>
          <span className="dock-hint">{dockTab === "timeline" ? "Drag the ruler or playhead to scrub · drag a block to retime · ⇧ range · ⌘/ctrl pick" : "Click a cue · ⇧ shift = select range · ⌘/ctrl = add or remove"}</span>
          {(shiftHeld || ctrlHeld) && <span className={"mod-cue" + (shiftHeld ? " shift" : " ctrl")}>{shiftHeld ? "⇧ Range select" : "⌘ Cherry-pick"}</span>}
        </div>
        <OpsToolbar selCount={selWords.size} canGroupFade={selWords.size >= 1 || selWid != null} fadeMembership={fadeMembership}
          canMergeWords={selWords.size >= 2} canUnmerge={!!curTok && curTok.ids.length > 1} canMergeEvents={sel.scope === "group" && sel.gi < P.layout.length - 1}
          canSplitEvent={sel.scope === "group" && sel.gi != null && P.layout[sel.gi] && P.layout[sel.gi].lines.length > 1}
          canToggleLine={lineBreakState().can || selWords.size >= 2} lineBroken={selWords.size >= 2 ? multiLineState() : lineBreakState().broken}
          hasEvent={sel.scope === "group"} wordDeleted={curTok && curTok.del}
          onGroupFade={groupFade} onClearFade={clearFade} onMergeWords={mergeWords} onUnmerge={unmergeWord} onMergeEvents={mergeEvents}
          onSplitEvent={splitEvent} onToggleLine={toggleLineBreak}
          onUngroupEvent={ungroupEvent} onDelete={deleteSel} onUndo={doUndo} onRedo={doRedo} canUndo={H.canUndo} canRedo={H.canRedo} flash={flash} />
        <div className="dock-body">
          {dockTab === "timeline" ? (
            <div className="wave-wrap">
              <div className="tl-toolrow">
                <button className={"snap-toggle" + (magnet ? " on" : "") + (altHeld ? " alt" : "")} onClick={() => setMagnet(m => !m)}
                  title="Magnet — snap edges to neighbours, the playhead & boundaries. Hold Alt while dragging to invert.">
                  <Icon name="magnet" size={13} />Magnet<span className="st-state">{altHeld ? "alt" : (magnet ? "on" : "off")}</span>
                </button>
                <span className="tl-hint">Drag a block to retime · drag an edge to resize · <b>Alt</b> {magnet ? "frees" : "snaps"}</span>
              </div>
              <div className="ruler scrub" onPointerDown={startScrub}>{Array.from({ length: 6 }, (_, i) => <span key={i}>{fmt((dur / 5) * i).replace(/\.\d+$/, "")}</span>)}</div>
              <div className="tl-lanes" ref={lanesRef}>
                <WordTrack blocks={blocks} dur={dur} time={time} palette={P.palette} magnet={magnet} eventBounds={eventBounds}
                  onSelect={selectWordByWid} onRange={rangeWord} onToggle={toggleWord} onRetime={retimeWord} onSnap={setSnapGuide} showPlayhead={false} />
                <div className="playhead tl-through" style={{ left: `${(dur ? time / dur : 0) * 100}%` }} onPointerDown={startScrub}><span className="ph-hit" /></div>
                {snapGuide && (snapGuide.near || []).filter(n => !snapGuide.hit || Math.abs(n.t - snapGuide.hit.t) > 1e-3).map((n, i) =>
                  <div key={"n" + i} className={"snap-guide near k-" + n.kind} style={{ left: `${(n.t / dur) * 100}%`, opacity: 0.15 + n.strength * 0.45 }} />)}
                {snapGuide && snapGuide.hit && <div className={"snap-guide k-" + snapGuide.hit.kind} style={{ left: `${(snapGuide.hit.t / dur) * 100}%` }}>
                  <span className="sg-tag">{snapGuide.hit.t.toFixed(2)}s</span></div>}
              </div>
            </div>
          ) : (
            <CueLanes project={P} sel={{ scope: sel.scope, gi: sel.gi, tok: curTok }} selectedWords={selWords} collapsed={collapsed}
              aiHotKey={aiHot ? aiHot.key : null} onSelectWord={selectWord} onRangeWord={rangeWord} onToggleWord={toggleWord} onSelectEvent={selectEvent} onToggleCollapse={toggleCollapse} />
          )}
        </div>
        {sel.scope === "group" && sel.gi != null && <EventStrip g={P.layout[sel.gi]} onSet={setLayoutProp} />}
      </section>

      {toast && <div className={"toast" + (toast.ai ? " ai" : "")}><Icon name={toast.ai ? "sparkles" : "check"} size={15} />{toast.msg}{toast.ai && <button className="toast-undo" onClick={H.undo}>Undo</button>}</div>}
    </div>
  );
}

// global fade defaults — always shown in the inspector (project-wide setting).
function FadeDefaultsPanel({ globals, onSet }) {
  const Step = ({ lab, k, unit, step, min }) => {
    const round = (n) => Math.round(n / step) * step;
    const disp = unit === " s" ? (globals[k] ?? 0).toFixed(1) : globals[k];
    return (
      <div className="fd-row">
        <span className="fd-l">{lab}</span>
        <span className="pv-step sm">
          <span className="pm" onClick={() => onSet({ [k]: Math.max(min ?? 0, round((globals[k] ?? 0) - step)) })}>−</span>
          <span className="v">{disp}{unit}</span>
          <span className="pm" onClick={() => onSet({ [k]: round((globals[k] ?? 0) + step) })}>+</span>
        </span>
      </div>
    );
  };
  return (
    <div className="fg-panel defaults">
      <div className="fg-head"><Icon name="clock" size={13} />Fade defaults<span className="fg-hint">project-wide · global</span></div>
      <Step lab="Fade-in" k="fade_in_ms" unit=" ms" step={50} />
      <Step lab="Fade-out" k="fade_out_ms" unit=" ms" step={50} />
      <Step lab="Linger" k="linger" unit=" s" step={0.1} />
      <p className="fd-note">Per-group fade rows inherit these unless overridden (the “global” source tag).</p>
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
