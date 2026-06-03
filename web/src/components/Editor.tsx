import { useState, useEffect, useCallback } from "react";
import { useProjectStore } from "../api/useProjectStore";
import { TopBar } from "./TopBar";
import { Icon } from "./icons/Icon";
import { resolveStyle, eventWindow, wordSchedule } from "../model/resolve";
import type { Token } from "../types";

// Panels
import { PreviewStage } from "./stage/PreviewStage";
import type { CapWord } from "./stage/PreviewStage";
import { Waveform } from "./stage/Waveform";
import { WordTrack } from "./stage/WordTrack";
import type { TrackWord } from "./stage/WordTrack";
import { StyleWaterfall } from "./panels/StyleWaterfall";
import { FadeGroupPanel } from "./panels/FadeGroupPanel";
import { TimingPanel } from "./panels/TimingPanel";
import { CueLanes } from "./panels/CueLanes";
import { OpsToolbar } from "./panels/OpsToolbar";
import { EventStrip } from "./panels/EventStrip";
import { ControlsRail } from "./panels/ControlsRail";

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

  // rail / dock tabs — start on "project" so StyleWaterfall doesn't overlap CueLanes event labels
  const [railTab, setRailTab] = useState<"project" | "inspector">("project");
  const [dockTab, setDockTab] = useState<"timeline" | "lanes">("lanes");

  // AI state
  const [aiTier] = useState<"global" | "group" | "cue" | null>(null);
  const [aiHotKey] = useState<string | null>(null);

  // ---- selection helpers ----
  const selectWord = useCallback((gi: number, li: number, ti: number, wid: number) => {
    setSel({ scope: "cue", gi, tok: { li, ti } });
    setSelectedWords(new Set([wid]));
  }, []);

  const shiftSelectWord = useCallback((wid: number) => {
    setSelectedWords((prev) => {
      const next = new Set(prev);
      if (next.has(wid)) next.delete(wid); else next.add(wid);
      return next;
    });
  }, []);

  const selectEvent = useCallback((gi: number) => {
    setSel({ scope: "group", gi, tok: null });
    setSelectedWords(new Set());
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
      for (const line of g.lines) {
        for (const tok of line.toks) {
          const wid = tok.ids[0];
          const w = P.words[wid];
          if (!w) continue;
          result.push({
            wid,
            text: tok.ids.map((id) => P.words[id]?.text ?? "").join(tok.sep || " "),
            s: w.start,
            e: Math.max(...tok.ids.map((id) => P.words[id]?.end ?? 0)),
            gi,
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
      store.call("set_group_style", { gi: sel.gi, partial: { [key]: value } });
    } else if (tier === "cue") {
      const ids = selectedWords.size > 0 ? [...selectedWords] : (selWid() != null ? [selWid()!] : []);
      if (ids.length > 0) store.call("set_cue_style", { word_ids: ids, partial: { [key]: value } });
    } else {
      // global — set_globals takes partial directly (not nested under "partial")
      store.call("set_globals", { [key]: value });
    }
  }

  function clearStyle(tier: "global" | "group" | "cue", key: string) {
    setStyle(tier, key, null);
  }

  function setFade(key: "fade_in_ms" | "fade_out_ms", value: number | null) {
    if (!P) return;
    store.call("set_group_fade", { gi: sel.gi, partial: { [key]: value } });
  }

  function groupFade(kind: "in" | "out") {
    const ids = wordsForOp();
    if (ids.length === 0) return;
    store.call("make_fade_tag", { kind, word_ids: ids });
  }

  function clearFade(kind: "in" | "out") {
    const ids = wordsForOp();
    if (ids.length === 0) return;
    store.call("clear_fade_tag", { kind, word_ids: ids });
  }

  function setFadeTrigger(kind: "in" | "out", trigger: number | null) {
    const ids = wordsForOp();
    if (ids.length === 0) return;
    store.call("set_fade_tag_props", { kind, word_ids: ids, trigger });
  }

  function setLayoutProp(patch: Partial<{ accumulate: "words" | "lines" | "off"; linger: number; win_start: number | null; win_end: number | null }>) {
    if (!P) return;
    const g = P.layout[sel.gi];
    if (!g) return;
    store.call("set_layout_props", {
      gi: sel.gi,
      win_start: patch.win_start !== undefined ? patch.win_start : g.win_start,
      win_end: patch.win_end !== undefined ? patch.win_end : g.win_end,
      linger: patch.linger !== undefined ? patch.linger : g.linger,
      accumulate: patch.accumulate !== undefined ? patch.accumulate : g.accumulate,
    });
  }

  function mergeWords() {
    if (!P) return;
    // Find the sorted selected word ids
    const sortedIds = [...selectedWords].sort((a, b) => a - b);
    if (sortedIds.length < 2) return;
    // For each adjacent pair, find them in the layout and merge the later into the earlier
    // We fold left: merge sortedIds[1] into sortedIds[0], then [2] into [0], etc.
    // Actually: merge pairs sequentially — find (gi, li, ti) for the later token and call merge_words
    for (let i = 1; i < sortedIds.length; i++) {
      // Find the token containing sortedIds[i]
      for (let gi = 0; gi < P.layout.length; gi++) {
        const g = P.layout[gi];
        for (let li = 0; li < g.lines.length; li++) {
          for (let ti = 0; ti < g.lines[li].toks.length; ti++) {
            const tok = g.lines[li].toks[ti];
            if (tok.ids.includes(sortedIds[i]) && ti > 0) {
              store.call("merge_words", { gi, li, ti, sep: " " });
            }
          }
        }
      }
    }
  }

  function mergeEvents() {
    store.call("merge_events", { gidxs: [sel.gi, sel.gi + 1] });
  }

  function ungroupEvent() {
    store.call("ungroup_event", { gi: sel.gi });
  }

  function splitEvent() {
    store.call("split_event", { gi: sel.gi, line_index: 1 });
  }

  function breakLine() {
    if (!sel.tok) return;
    store.call("break_line", { gi: sel.gi, li: sel.tok.li, ti: sel.tok.ti, after: true });
  }

  function deleteSel() {
    const ids = wordsForOp();
    if (ids.length === 0) return;
    store.call(wordDeleted() ? "restore_words" : "delete_words", { word_ids: ids });
  }

  function selectWordByWid(wid: number) {
    if (!P) return;
    for (let gi = 0; gi < P.layout.length; gi++) {
      const g = P.layout[gi];
      for (let li = 0; li < g.lines.length; li++) {
        for (let ti = 0; ti < g.lines[li].toks.length; ti++) {
          if (g.lines[li].toks[ti].ids.includes(wid)) {
            selectWord(gi, li, ti, wid);
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

  // live word id: first word of the active event at current time
  const liveGi = activeGi();
  let liveId: number | null = null;
  if (P.layout[liveGi]) {
    for (const line of P.layout[liveGi].lines) {
      for (const t of line.toks) {
        if (!t.del) {
          const sched = wordSchedule(P, liveGi, t.ids[0]);
          const wordEnd = Math.max(...t.ids.map((id) => P.words[id]?.end ?? 0));
          if (sched.start_s <= time && time < wordEnd) {
            liveId = t.ids[0];
            break;
          }
        }
      }
      if (liveId != null) break;
    }
  }

  return (
    <div className="app">
      <TopBar
        project={projectName}
        time={time}
        dur={dur}
        playing={playing}
        onPlay={() => setPlaying((p) => !p)}
        onSeekRel={(d) => setTime((t) => Math.max(0, Math.min(dur, t + d)))}
        onHome={onHome}
        onExport={() => {}}
        onUndo={store.undo}
        onRedo={store.redo}
        canUndo
        canRedo
      />
      {store.connected && <span className="ai-pill">AI agent · live</span>}
      <div className="body">
        <aside className="rail">
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
            {railTab === "project" && <ControlsRail project={P} />}
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
                {(finTag || foutTag) && (
                  <FadeGroupPanel
                    project={P}
                    gi={sel.gi}
                    finTag={finTag}
                    foutTag={foutTag}
                    onSet={setFadeTrigger}
                    onClear={clearFade}
                  />
                )}
                {tok && <TimingPanel tok={tok} project={P} />}
              </>
            )}
          </div>
        </aside>
        <main className="center">
          <PreviewStage
            capWords={capWords}
            time={time}
            mode={pvMode}
            onMode={setPvMode}
            onRenderExact={() => setPvMode("exact")}
            onSelectWord={selectWordByWid}
          />
        </main>
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
          onUndo={store.undo}
          onRedo={store.redo}
          canUndo
          canRedo
        />
        <div className="dock-body">
          {dockTab === "timeline" && (
            <div className="timeline-col">
              <Waveform dur={dur} time={time} onSeek={setTime} />
              <WordTrack
                words={trackWords}
                dur={dur}
                time={time}
                liveId={liveId}
                selId={wid}
                onSelect={selectWordByWid}
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
              onSelectWord={selectWord}
              onShiftWord={shiftSelectWord}
              onSelectEvent={selectEvent}
              onToggleCollapse={toggleCollapse}
            />
          )}
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
