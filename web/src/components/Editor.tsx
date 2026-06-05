import { useState, useEffect, useCallback, useRef } from "react";
import { useProjectStore } from "../api/useProjectStore";
import { burn } from "../api/client";
import { TopBar } from "./TopBar";
import { ExportMenu } from "./ExportMenu";
import { Icon } from "./icons/Icon";
import { resolveStyle, eventWindow, wordSchedule } from "../model/resolve";
import { computeMove, computeResize } from "../model/edit";
import { boxFromState, anchorXY } from "../model/bbox";
import type { Token } from "../types";

// Panels
import { PreviewStage } from "./stage/PreviewStage";
import type { CapWord } from "./stage/PreviewStage";
import { Waveform } from "./stage/Waveform";
import { WordTrack } from "./stage/WordTrack";
import type { TrackWord } from "./stage/WordTrack";
import { StyleWaterfall } from "./panels/StyleWaterfall";
import { FadeGroupPanel } from "./panels/FadeGroupPanel";
import { FadeDefaultsPanel } from "./panels/FadeDefaultsPanel";
import { TimingPanel } from "./panels/TimingPanel";
import { CueLanes } from "./panels/CueLanes";
import { OpsToolbar } from "./panels/OpsToolbar";
import { EventStrip } from "./panels/EventStrip";
import { ControlsRail } from "./panels/ControlsRail";
import { Splitter } from "./atoms/Splitter";

// ---- selection state ----
interface SelState {
  scope: "global" | "group" | "cue";
  gi: number;
  tok: { li: number; ti: number } | null;
}

export function Editor({ projectName, onHome }: { projectName: string; onHome: () => void }) {
  const store = useProjectStore();
  const P = store.project;

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pvMode, setPvMode] = useState<"live" | "exact">("live");

  // selection
  const [sel, setSel] = useState<SelState>({ scope: "group", gi: 0, tok: null });
  const [selectedWords, setSelectedWords] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  // EventStrip only appears after an explicit group selection (avoids duplicate label text nodes)
  const [groupExplicitSel, setGroupExplicitSel] = useState(false);

  // keep a ref to P so the Esc handler can close over it without stale closure issues
  const pRef = useRef(P);
  // anchor for shift-range selection — stored in a ref so selectCue doesn't need it as a dep
  const anchorRef = useRef<number | null>(null);

  // rail / dock tabs — start on "project" so StyleWaterfall doesn't overlap CueLanes event labels
  const [railTab, setRailTab] = useState<"project" | "inspector">("project");
  const [dockTab, setDockTab] = useState<"timeline" | "lanes">("lanes");

  // timing lock toggle (default locked)
  const [timingsUnlocked, setTimingsUnlocked] = useState(false);

  // AI state
  const [aiTier] = useState<"global" | "group" | "cue" | null>(null);
  const [aiHotKey] = useState<string | null>(null);

  // error surfacing
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // export menu
  const [exportOpen, setExportOpen] = useState(false);

  // resizable panes (persisted)
  const loadPane = (k: string, def: number) => {
    try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && v >= 100 ? v : def; }
    catch { return def; }
  };
  const [railW, setRailW] = useState(() => loadPane("kss.railW", 320));
  const [dockH, setDockH] = useState(() => loadPane("kss.dockH", 252));
  const setPane = (k: "kss.railW" | "kss.dockH", set: (v: number) => void) => (v: number) => {
    set(v);
    try { localStorage.setItem(k, String(v)); } catch { /* private mode etc. */ }
  };

  const dispatch = useCallback((tool: string, args: Record<string, unknown>) => {
    store.call(tool, args).catch((e: unknown) => setErrMsg(e instanceof Error ? e.message : String(e)));
  }, [store]);

  // keep pRef in sync with P
  useEffect(() => { pRef.current = P; }, [P]);

  // ---- playback ticker: Play advances the clock until the end of the song ----
  const timeRef = useRef(0);
  useEffect(() => { timeRef.current = time; }, [time]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const project = pRef.current;
      const dur = project ? Math.max(8, ...project.words.map((w) => w.end)) + 1.5 : 0;
      const dt = (now - last) / 1000;
      last = now;
      const nt = timeRef.current + dt;
      if (!project || nt >= dur) {
        setTime(dur || 0);
        setPlaying(false);
        return;
      }
      setTime(nt);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // ---- cueList: every cue in layout order with its start time ----
  const cueList = useCallback(() => {
    const project = pRef.current;
    if (!project) return [];
    const result: { wid: number; gi: number; li: number; ti: number; start: number }[] = [];
    for (let gi = 0; gi < project.layout.length; gi++) {
      const g = project.layout[gi];
      for (let li = 0; li < g.lines.length; li++) {
        for (let ti = 0; ti < g.lines[li].toks.length; ti++) {
          const tok = g.lines[li].toks[ti];
          const wid = tok.ids[0];
          const start = Math.min(...tok.ids.map((id) => project.words[id]?.start ?? Infinity));
          result.push({ wid, gi, li, ti, start });
        }
      }
    }
    return result;
  }, []);

  // ---- unified selectCue ----
  const selectCue = useCallback((
    gi: number, li: number, ti: number, wid: number,
    mods: { ctrl?: boolean; shift?: boolean } = {}
  ) => {
    if (mods.shift) {
      // range selection by time order
      setSelectedWords((prev) => {
        const project = pRef.current;
        if (!project) return prev;
        const list = cueList();
        const clickedEntry = list.find((c) => c.wid === wid);
        // find anchor entry: use anchorWid if set, else fall back to the first item in prev set
        const anchorEntry = anchorRef.current != null
          ? list.find((c) => c.wid === anchorRef.current)
          : prev.size > 0
            ? list.find((c) => prev.has(c.wid))
            : null;
        if (!clickedEntry || !anchorEntry) {
          return new Set([wid]);
        }
        const [aStart, bStart] = [
          Math.min(anchorEntry.start, clickedEntry.start),
          Math.max(anchorEntry.start, clickedEntry.start),
        ];
        const next = new Set<number>();
        for (const c of list) {
          if (c.start >= aStart && c.start <= bStart) next.add(c.wid);
        }
        return next;
      });
      setSel({ scope: "cue", gi, tok: { li, ti } });
      // don't move anchor on shift
    } else if (mods.ctrl) {
      // toggle
      setSelectedWords((prev) => {
        const next = new Set(prev);
        if (next.has(wid)) next.delete(wid); else next.add(wid);
        return next;
      });
      setSel({ scope: "cue", gi, tok: { li, ti } });
      anchorRef.current = wid;
    } else {
      // plain click
      setSel({ scope: "cue", gi, tok: { li, ti } });
      setSelectedWords(new Set([wid]));
      anchorRef.current = wid;
    }
  }, [cueList]);

  // ---- clearSelection ----
  const clearSelection = useCallback(() => {
    setSel({ scope: "global", gi: 0, tok: null });
    setSelectedWords(new Set());
    anchorRef.current = null;
  }, []);

  // ---- Esc key clears selection ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const target = e.target as HTMLElement;
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
        clearSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clearSelection]);

  // ---- Keyboard nudge (arrow keys) for timing — gated on timingsUnlocked ----
  useEffect(() => {
    if (!timingsUnlocked) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      const project = pRef.current;
      if (!project) return;
      // Find current tok
      const s = sel;
      if (!s.tok) return;
      const tok = project.layout[s.gi]?.lines[s.tok.li]?.toks[s.tok.ti];
      if (!tok) return;

      e.preventDefault();
      const step = e.shiftKey ? 0.25 : 0.05;
      const sign = e.key === "ArrowRight" ? 1 : -1;
      const dt = sign * step;

      let updates;
      if (e.shiftKey) {
        // Shift+Arrow: resize end only
        updates = computeResize(project, tok, "end", dt);
      } else {
        // Plain arrow: move the cue
        updates = computeMove(project, [tok], dt);
      }
      dispatch("set_word_times", { updates });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // sel is in deps so the handler always has the current selection
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timingsUnlocked, sel, dispatch]);

  // ---- selection helpers ----
  const selectEvent = useCallback((gi: number) => {
    setSel({ scope: "group", gi, tok: null });
    setSelectedWords(new Set());
    anchorRef.current = null;
    setGroupExplicitSel(true);
  }, []);

  const selectTier = useCallback((scope: "global" | "group" | "cue") => {
    setSel((s) => ({ ...s, scope }));
  }, []);

  const toggleCollapse = useCallback((gi: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(gi)) next.delete(gi); else next.add(gi);
      return next;
    });
  }, []);

  // ---- derived: current tok (for inspector) ----
  function currentTok(): Token | null {
    if (!P || !sel.tok) return null;
    const g = P.layout[sel.gi];
    if (!g) return null;
    return g.lines[sel.tok.li]?.toks[sel.tok.ti] ?? null;
  }

  // ---- derived: selWid ----
  function selWid(): number | null {
    const tok = currentTok();
    return tok ? tok.ids[0] : null;
  }

  // ---- derived: wordsForOp ----
  function wordsForOp(): number[] {
    if (selectedWords.size > 0) return [...selectedWords];
    const wid = selWid();
    return wid != null ? [wid] : [];
  }

  // ---- derived: fade membership ----
  function fadeMembership(): "in" | "out" | null {
    if (!P) return null;
    const wid = selWid();
    if (wid == null) return null;
    if (P.fin_tags.some((t) => t.ids.includes(wid))) return "in";
    if (P.fout_tags.some((t) => t.ids.includes(wid))) return "out";
    return null;
  }

  // ---- derived: finTag / foutTag for FadeGroupPanel ----
  function finTagForSel() {
    if (!P) return null;
    const wid = selWid();
    if (wid == null) return null;
    return P.fin_tags.find((t) => t.ids.includes(wid)) ?? null;
  }
  function foutTagForSel() {
    if (!P) return null;
    const wid = selWid();
    if (wid == null) return null;
    return P.fout_tags.find((t) => t.ids.includes(wid)) ?? null;
  }

  // ---- derived: can* flags ----
  function canGroupFade() { return selectedWords.size >= 1 || selWid() != null; }
  function canMergeWords() { return selectedWords.size >= 2; }
  function canMergeEvents() { return !!P && sel.scope === "group" && sel.gi < P.layout.length - 1; }
  function canSplitEvent() { return !!P && sel.scope === "group" && P.layout[sel.gi]?.lines.length > 1; }
  function canBreakLine() { return sel.tok != null; }
  function hasEvent() { return sel.scope === "group"; }
  function wordDeleted() {
    const tok = currentTok();
    return tok?.del ?? false;
  }

  // ---- derived: active event index for capWords ----
  function activeGi(): number {
    if (!P) return 0;
    for (let gi = 0; gi < P.layout.length; gi++) {
      const [s, e] = eventWindow(P, gi);
      if (time >= s && time < e) return gi;
    }
    return 0;
  }

  // ---- derived: capWords ----
  function computeCapWords(): CapWord[] {
    if (!P) return [];
    const gi = activeGi();
    const g = P.layout[gi];
    if (!g) return [];
    const wid = selWid();
    const caps: CapWord[] = [];
    for (const line of g.lines) {
      for (const tok of line.toks) {
        if (tok.del) continue;
        const sched = wordSchedule(P, gi, tok.ids[0]);
        // end of tok: max of all word ends
        const wordEnd = Math.max(...tok.ids.map((id) => P.words[id]?.end ?? 0));
        const live = sched.start_s <= time && time < wordEnd;
        const pending = sched.start_s > time;
        const resolved = resolveStyle(P, gi, tok);
        const fillEntry = resolved["primary"];
        const fill = fillEntry && fillEntry.src !== "global" ? String(fillEntry.value) : null;
        const isSel = wid != null && tok.ids.includes(wid);
        caps.push({
          wid: tok.ids[0],
          text: tok.ids.map((id) => P.words[id]?.text ?? "").join(tok.sep || " "),
          live,
          pending,
          sel: isSel,
          fill,
        });
      }
    }
    return caps;
  }

  // ---- derived: track words for WordTrack ----
  function computeTrackWords(): TrackWord[] {
    if (!P) return [];
    const result: TrackWord[] = [];
    for (let gi = 0; gi < P.layout.length; gi++) {
      const g = P.layout[gi];
      for (let li = 0; li < g.lines.length; li++) {
        const line = g.lines[li];
        for (let ti = 0; ti < line.toks.length; ti++) {
          const tok = line.toks[ti];
          const wid = tok.ids[0];
          const w = P.words[wid];
          if (!w) continue;
          result.push({
            wid,
            text: tok.ids.map((id) => P.words[id]?.text ?? "").join(tok.sep || " "),
            s: w.start,
            e: Math.max(...tok.ids.map((id) => P.words[id]?.end ?? 0)),
            gi,
            li,
            ti,
            del: tok.del,
          });
        }
      }
    }
    return result;
  }

  // ---- intent handlers ----
  function setStyle(tier: "global" | "group" | "cue", key: string, value: unknown) {
    if (tier === "group") {
      dispatch("set_group_style", { gi: sel.gi, partial: { [key]: value } });
    } else if (tier === "cue") {
      const ids = selectedWords.size > 0 ? [...selectedWords] : (selWid() != null ? [selWid()!] : []);
      if (ids.length > 0) dispatch("set_cue_style", { word_ids: ids, partial: { [key]: value } });
    } else {
      // global — set_globals(ctx, partial) is called as fn(ctx, **args), so args must be { partial: {...} }
      dispatch("set_globals", { partial: { [key]: value } });
    }
  }

  function clearStyle(tier: "global" | "group" | "cue", key: string) {
    setStyle(tier, key, null);
  }

  function setFade(key: "fade_in_ms" | "fade_out_ms", value: number | null) {
    if (!P) return;
    dispatch("set_group_fade", { gi: sel.gi, partial: { [key]: value } });
  }

  function groupFade(kind: "in" | "out") {
    const ids = wordsForOp();
    if (ids.length === 0) return;
    dispatch("make_fade_tag", { kind, word_ids: ids });
  }

  function clearFade(kind: "in" | "out") {
    const ids = wordsForOp();
    if (ids.length === 0) return;
    dispatch("clear_fade_tag", { kind, word_ids: ids });
  }

  function setFadeTrigger(kind: "in" | "out", trigger: number | null) {
    const ids = wordsForOp();
    if (ids.length === 0) return;
    dispatch("set_fade_tag_props", { kind, word_ids: ids, trigger });
  }

  function setLayoutProp(patch: Partial<{ accumulate: "words" | "lines" | "off"; linger: number; win_start: number | null; win_end: number | null }>) {
    if (!P) return;
    const g = P.layout[sel.gi];
    if (!g) return;
    dispatch("set_layout_props", {
      gi: sel.gi,
      win_start: patch.win_start !== undefined ? patch.win_start : g.win_start,
      win_end: patch.win_end !== undefined ? patch.win_end : g.win_end,
      linger: patch.linger !== undefined ? patch.linger : g.linger,
      accumulate: patch.accumulate !== undefined ? patch.accumulate : g.accumulate,
    });
  }

  function mergeWords() {
    if (!P) return;
    const ids = [...selectedWords].sort((a, b) => a - b);
    if (ids.length < 2) return;
    // map each selected word to its token coordinates in the current snapshot
    const locs: { gi: number; li: number; ti: number }[] = [];
    for (const wid of ids) {
      let found = false;
      for (let gi = 0; gi < P.layout.length && !found; gi++) {
        const g = P.layout[gi];
        for (let li = 0; li < g.lines.length && !found; li++) {
          for (let ti = 0; ti < g.lines[li].toks.length; ti++) {
            if (g.lines[li].toks[ti].ids.includes(wid)) { locs.push({ gi, li, ti }); found = true; break; }
          }
        }
      }
      if (!found) return;
    }
    const { gi, li } = locs[0];
    if (!locs.every((l) => l.gi === gi && l.li === li)) {
      setErrMsg("merge needs adjacent words on one line"); return;
    }
    const tis = [...new Set(locs.map((l) => l.ti))].sort((a, b) => a - b);
    const ti_first = tis[0], ti_last = tis[tis.length - 1];
    if (ti_last === ti_first || ti_last - ti_first !== tis.length - 1) {
      setErrMsg("merge needs adjacent words on one line"); return;
    }
    dispatch("merge_word_span", { gi, li, ti_first, ti_last, sep: " " });
  }

  function mergeEvents() {
    dispatch("merge_events", { gidxs: [sel.gi, sel.gi + 1] });
  }

  function ungroupEvent() {
    dispatch("ungroup_event", { gi: sel.gi });
  }

  function splitEvent() {
    dispatch("split_event", { gi: sel.gi, line_index: 1 });
  }

  function breakLine() {
    if (!sel.tok) return;
    dispatch("break_line", { gi: sel.gi, li: sel.tok.li, ti: sel.tok.ti, after: true });
  }

  function deleteSel() {
    const ids = wordsForOp();
    if (ids.length === 0) return;
    dispatch(wordDeleted() ? "restore_words" : "delete_words", { word_ids: ids });
  }

  function setCueTime(start: number, end: number) {
    if (!P || !sel.tok || !timingsUnlocked) return;
    const tk = P.layout[sel.gi].lines[sel.tok.li].toks[sel.tok.ti];
    const earliest = tk.ids.reduce((a, b) => (P.words[a].start <= P.words[b].start ? a : b));
    const latest = tk.ids.reduce((a, b) => (P.words[a].end >= P.words[b].end ? a : b));
    const updates = earliest === latest
      ? [{ wid: earliest, start, end }]
      : [{ wid: earliest, start, end: P.words[earliest].end }, { wid: latest, start: P.words[latest].start, end }];
    dispatch("set_word_times", { updates });
  }

  function setCueText(text: string) {
    if (!P || !sel.tok) return;
    const tk = P.layout[sel.gi].lines[sel.tok.li].toks[sel.tok.ti];
    if (tk.ids.length === 1) dispatch("set_word_text", { wid: tk.ids[0], text });
  }

  function selectWordByWid(wid: number) {
    if (!P) return;
    for (let gi = 0; gi < P.layout.length; gi++) {
      const g = P.layout[gi];
      for (let li = 0; li < g.lines.length; li++) {
        for (let ti = 0; ti < g.lines[li].toks.length; ti++) {
          if (g.lines[li].toks[ti].ids.includes(wid)) {
            selectCue(gi, li, ti, wid);
            return;
          }
        }
      }
    }
  }

  if (!P) return <div className="app"><div className="connecting">Connecting…</div></div>;

  const dur = Math.max(8, ...P.words.map((w) => w.end)) + 1.5;
  const capWords = computeCapWords();
  const trackWords = computeTrackWords();
  const tok = currentTok();
  const wid = selWid();
  const finTag = finTagForSel();
  const foutTag = foutTagForSel();
  const fade = fadeMembership();
  const selCount = selectedWords.size || (wid != null ? 1 : 0);

  // sel object for StyleWaterfall (tok is the Token object)
  const waterfallSel = {
    scope: sel.scope,
    gi: sel.gi,
    tok: tok,
  };
  // sel object for CueLanes (tok is position {li, ti} | null)
  const lanesSel = {
    scope: sel.scope,
    gi: sel.gi,
    tok: sel.tok,
  };

  // derive liveId from capWords (already computed above — no duplicate scan needed)
  const liveId = capWords.find((w) => w.live)?.wid ?? null;

  return (
    <div className="app">
      <TopBar
        project={projectName}
        time={time}
        dur={dur}
        playing={playing}
        onPlay={() => { if (!playing) setPvMode("live"); setPlaying(!playing); }}
        onSeekRel={(d) => setTime((t) => Math.max(0, Math.min(dur, t + d)))}
        onHome={onHome}
        onExport={() => setExportOpen((o) => !o)}
        onUndo={() => store.undo().catch((e: unknown) => setErrMsg(e instanceof Error ? e.message : String(e)))}
        onRedo={() => store.redo().catch((e: unknown) => setErrMsg(e instanceof Error ? e.message : String(e)))}
        canUndo
        canRedo
      />
      {exportOpen && (
        <ExportMenu
          projectName={projectName}
          onClose={() => setExportOpen(false)}
          onBurn={(out, videoIn) => { burn(out, videoIn).catch((e) => setErrMsg(e instanceof Error ? e.message : String(e))); }}
        />
      )}
      {store.connected && <span className="ai-pill">AI agent · live</span>}
      <div className="body">
        <aside className="rail" style={{ width: railW, flex: `0 0 ${railW}px` }}>
          <div className="rail-tabs">
            <button
              className={"rail-tab" + (railTab === "project" ? " on" : "")}
              onClick={() => setRailTab("project")}
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
            {railTab === "project" && (
              <ControlsRail
                project={P}
                projectName={projectName}
                onSetGlobal={(key, value) => dispatch("set_globals", { partial: { [key]: value } })}
                onTogglePos={(on) => {
                  const box = boxFromState(P.placement);
                  const partial = on
                    ? { use_pos: true, pos: anchorXY(box, P.placement.align) }
                    : { use_pos: false, pos: null };
                  dispatch("set_globals", { partial });
                }}
              />
            )}
            {railTab === "inspector" && (
              <>
                <StyleWaterfall
                  project={P}
                  sel={waterfallSel}
                  aiTier={aiTier}
                  onSelectTier={selectTier}
                  onSetStyle={setStyle}
                  onClearStyle={clearStyle}
                  onSetFade={setFade}
                />
                {P.layout[sel.gi] && (
                  <FadeGroupPanel
                    project={P}
                    gi={sel.gi}
                    finTag={finTag}
                    foutTag={foutTag}
                    onSet={setFadeTrigger}
                    onClear={clearFade}
                  />
                )}
                <FadeDefaultsPanel
                  globals={P.globals}
                  onSet={(key, value) => dispatch("set_fade_defaults", { [key]: value })}
                />
                {tok && <TimingPanel key={sel.tok ? `${sel.gi}-${sel.tok.li}-${sel.tok.ti}` : "none"} tok={tok} project={P} unlocked={timingsUnlocked} onToggleLock={() => setTimingsUnlocked((u) => !u)} onSetTime={setCueTime} onSetText={setCueText} />}
              </>
            )}
          </div>
        </aside>
        <Splitter orientation="vertical" value={railW} min={240} max={560} defaultValue={320}
          onChange={setPane("kss.railW", setRailW)} label="Resize side panel" />
        <main className="center">
          <PreviewStage
            capWords={capWords}
            time={time}
            mode={pvMode}
            onMode={setPvMode}
            onRenderExact={() => setPvMode("exact")}
            onSelectWord={selectWordByWid}
            playW={P.placement.play_w}
            playH={P.placement.play_h}
            placement={P.placement}
            onPlacement={(partial) => dispatch("set_globals", { partial })}
          />
        </main>
      </div>
      <Splitter orientation="horizontal" value={dockH} min={140} max={520} defaultValue={252}
        onChange={setPane("kss.dockH", setDockH)} label="Resize timeline dock" />
      <section className="dock" style={{ flex: `0 0 ${dockH}px` }}>
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
        {groupExplicitSel && sel.scope === "group" && P.layout[sel.gi] && (
          <EventStrip g={P.layout[sel.gi]} onSet={setLayoutProp} />
        )}
        <OpsToolbar
          selCount={selCount}
          canGroupFade={canGroupFade()}
          fadeMembership={fade}
          canMergeWords={canMergeWords()}
          canMergeEvents={canMergeEvents()}
          canSplitEvent={canSplitEvent()}
          canBreakLine={canBreakLine()}
          hasEvent={hasEvent()}
          wordDeleted={wordDeleted()}
          onGroupFade={groupFade}
          onClearFade={clearFade}
          onMergeWords={mergeWords}
          onMergeEvents={mergeEvents}
          onSplitEvent={splitEvent}
          onBreakLine={breakLine}
          onUngroupEvent={ungroupEvent}
          onDelete={deleteSel}
          onUndo={() => store.undo().catch((e: unknown) => setErrMsg(e instanceof Error ? e.message : String(e)))}
          onRedo={() => store.redo().catch((e: unknown) => setErrMsg(e instanceof Error ? e.message : String(e)))}
          canUndo
          canRedo
        />
        <div className="dock-body">
          {dockTab === "timeline" && (
            <div className="timeline-col">
              <Waveform dur={dur} time={time} onSeek={setTime} />
              <WordTrack
                words={trackWords}
                events={P.layout.map((g, gi) => ({ gi, label: g.label }))}
                dur={dur}
                time={time}
                liveId={liveId}
                selId={wid}
                selectedWords={selectedWords}
                onSelect={selectCue}
                project={P}
                unlocked={timingsUnlocked}
                onRetime={(updates) => dispatch("set_word_times", { updates })}
              />
            </div>
          )}
          {dockTab === "lanes" && (
            <CueLanes
              project={P}
              sel={lanesSel}
              selectedWords={selectedWords}
              collapsed={collapsed}
              aiHotKey={aiHotKey}
              onSelectWord={selectCue}
              onSelectEvent={selectEvent}
              onToggleCollapse={toggleCollapse}
            />
          )}
        </div>
      </section>
      {store.burn && !store.burn.done && (
        <div className="toast burn-bar">rendering — {Math.round(store.burn.frac * 100)}%</div>
      )}
      {store.burn && store.burn.done && (
        <div className="toast burn-bar">{store.burn.ok ? `done — ${store.burn.out}` : `burn error: ${store.burn.err}`}</div>
      )}
      {store.lastExternal > 0 && <ExternalToast key={store.lastExternal} />}
      {errMsg && <ErrorToast key={errMsg} msg={errMsg} onClear={() => setErrMsg(null)} />}
    </div>
  );
}

function ErrorToast({ msg, onClear }: { msg: string; onClear: () => void }) {
  useEffect(() => { const t = setTimeout(onClear, 4000); return () => clearTimeout(t); }, [onClear]);
  return <div className="toast err"><Icon name="close" size={15} />{msg}</div>;
}

function ExternalToast() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, []);
  return show ? <div className="toast ai">AI agent updated the project</div> : null;
}
