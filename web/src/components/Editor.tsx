import { useState, useEffect, useCallback, useRef } from "react";
import { useProjectStore } from "../api/useProjectStore";
import { burn, getAss, video as videoApi } from "../api/client";
import { TopBar } from "./TopBar";
import { ExportMenu } from "./ExportMenu";
import { Icon } from "./icons/Icon";
import { resolveStyle, eventWindow, wordSchedule } from "../model/resolve";
import { computeMove, computeResize } from "../model/edit";
import { boxFromState, anchorXY } from "../model/bbox";
import type { Token, Project } from "../types";
import { fadeInAnim, fadeOutAnim, fadeAnimName, freshAnimId } from "../model/animPresets";

// Panels
import { PreviewStage } from "./stage/PreviewStage";
import type { CapWord } from "./stage/PreviewStage";
import { Waveform } from "./stage/Waveform";
import { WordTrack } from "./stage/WordTrack";
import type { TrackWord, AnimFocus } from "./stage/WordTrack";
import { StyleWaterfall } from "./panels/StyleWaterfall";
import { AnimSection } from "./panels/AnimSection";
import type { AnimScope } from "./panels/AnimSection";
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

/** Transport/ruler length. Derives from the last word end (+1.5s tail, min 8s),
 *  but an attached video's probed duration OVERRIDES when it's longer — so the
 *  waveform/transport span matches the footage (Feature A acceptance criterion:
 *  "the waveform/transport length updates to match"). FLAG: this only extends, never
 *  truncates below the lyrics span; revisit if a shorter video should clamp the ruler. */
function projectDur(p: Project): number {
  const lyricsDur = Math.max(8, ...p.words.map((w) => w.end)) + 1.5;
  const vid = p.video?.duration_s ?? null;
  return vid != null && isFinite(vid) ? Math.max(lyricsDur, vid) : lyricsDur;
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
  // Selection-preserving merge/unmerge: a merge/unmerge dispatch records the word
  // ids it touched; when the server's WS echo lands (P gets a new reference) we
  // re-derive the selection from those ids (merged cue → its merged tok; unmerge →
  // every resulting single-word cue). Cleared once applied.
  const pendingSelRef = useRef<{ ids: number[]; kind: "merge" | "unmerge" } | null>(null);

  // rail / dock tabs — start on "project" so StyleWaterfall doesn't overlap CueLanes event labels
  const [railTab, setRailTab] = useState<"project" | "inspector">("project");
  const [dockTab, setDockTab] = useState<"timeline" | "lanes">("lanes");

  // timing lock toggle (default locked)
  const [timingsUnlocked, setTimingsUnlocked] = useState(false);

  // magnet snapping (on by default, persisted). Alt momentarily inverts it and
  // tints the toggle amber while held.
  const [magnet, setMagnet] = useState(() => {
    try { return localStorage.getItem("kss.magnet") !== "0"; } catch { return true; }
  });
  const toggleMagnet = useCallback(() => {
    setMagnet((m) => {
      const next = !m;
      try { localStorage.setItem("kss.magnet", next ? "1" : "0"); } catch { /* private mode */ }
      return next;
    });
  }, []);
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Alt" || e.altKey) setAltHeld(true); };
    const up = (e: KeyboardEvent) => { if (e.key === "Alt" || !e.altKey) setAltHeld(false); };
    const blur = () => setAltHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);

  // ── animation focus (2-click on a strip) — shared by track + Inspector ──
  const [animFocus, setAnimFocus] = useState<AnimFocus | null>(null);
  // cue word ids whose +N overflow stack is expanded inline on the track
  const [expandedCues, setExpandedCues] = useState<Set<number>>(new Set());

  // AI state
  const [aiTier] = useState<"global" | "group" | "cue" | null>(null);
  const [aiHotKey] = useState<string | null>(null);

  // error surfacing
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // export menu
  const [exportOpen, setExportOpen] = useState(false);

  // undo/redo press-flash (TopBar button highlights ~200ms on key OR button)
  const [flash, setFlash] = useState<"undo" | "redo" | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // held-modifier pill (§2): ⇧ Range select / ⌘ Cherry-pick
  const [shiftHeld, setShiftHeld] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);

  // undo/redo are always available against the server-authoritative history;
  // kept as flags so the keyboard/button paths share one gating contract.
  const canUndo = true;
  const canRedo = true;

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

  // ── undo/redo with press-flash ──────────────────────────────────────────
  // Both the keyboard and the TopBar buttons route through these. A no-op (gated
  // by canUndo/canRedo) neither dispatches nor flashes.
  const triggerFlash = useCallback((which: "undo" | "redo") => {
    setFlash(which);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 200);
  }, []);
  const doUndo = useCallback(() => {
    if (!canUndo) return;
    triggerFlash("undo");
    store.undo().catch((e: unknown) => setErrMsg(e instanceof Error ? e.message : String(e)));
  }, [canUndo, triggerFlash, store]);
  const doRedo = useCallback(() => {
    if (!canRedo) return;
    triggerFlash("redo");
    store.redo().catch((e: unknown) => setErrMsg(e instanceof Error ? e.message : String(e)));
  }, [canRedo, triggerFlash, store]);

  // ── global keyboard: Ctrl/⌘+Z undo, +Shift / Ctrl+Y redo ──
  // Inert while focus is in an editable element.
  useEffect(() => {
    const editable = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      const tag = t.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable === true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (editable(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
      else if (k === "y") { e.preventDefault(); doRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo]);

  // ── held-modifier tracking (§2): drives the dock modifier pill ──
  useEffect(() => {
    const sync = (e: KeyboardEvent) => { setShiftHeld(e.shiftKey); setCtrlHeld(e.ctrlKey || e.metaKey); };
    const clear = () => { setShiftHeld(false); setCtrlHeld(false); };
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // keep pRef in sync with P
  useEffect(() => { pRef.current = P; }, [P]);

  // Selection-preserving merge/unmerge — re-derive selection from pendingSelRef once
  // the post-edit state echoes in. For a merge we select the merged cue (the tok
  // that now covers all touched ids); for an unmerge we select every resulting
  // single-word cue. selectedWords carries the ids; sel points at the lead tok.
  useEffect(() => {
    const pending = pendingSelRef.current;
    if (!P || !pending) return;
    pendingSelRef.current = null;
    const idset = new Set(pending.ids);
    // locate the lead tok covering the first id (merge: the merged tok; unmerge: the
    // first split word) to drive sel.tok
    for (let gi = 0; gi < P.layout.length; gi++) {
      const g = P.layout[gi];
      for (let li = 0; li < g.lines.length; li++) {
        for (let ti = 0; ti < g.lines[li].toks.length; ti++) {
          if (g.lines[li].toks[ti].ids.some((id) => idset.has(id))) {
            setSel({ scope: "cue", gi, tok: { li, ti } });
            setSelectedWords(new Set(pending.ids));
            anchorRef.current = pending.ids[0];
            return;
          }
        }
      }
    }
  }, [P]);

  // ── live preview .ass feed ──────────────────────────────────────────────
  // Every committed edit re-broadcasts state over WS (P gets a new reference);
  // pull the regenerated .ass (debounced ~50ms) and hand it to the jassub live
  // renderer via PreviewStage. Playback/scrub never re-fetches — only edits do.
  const [assText, setAssText] = useState<string | null>(null);
  useEffect(() => {
    if (!P) return;
    let cancelled = false;
    const id = setTimeout(() => {
      getAss().then((text) => { if (!cancelled) setAssText(text); }).catch(() => { /* daemon hiccup */ });
    }, 50);
    return () => { cancelled = true; clearTimeout(id); };
  }, [P]);

  // ---- playback ticker: Play advances the clock until the end of the song ----
  const timeRef = useRef(0);
  useEffect(() => { timeRef.current = time; }, [time]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const project = pRef.current;
      const dur = project ? projectDur(project) : 0;
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
        // Esc first clears animation focus back to cue selection (HANDOFF §3);
        // a second Esc (no focus) clears the selection.
        if (animFocus) { setAnimFocus(null); return; }
        clearSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clearSelection, animFocus]);

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

  // ---- derived: fade membership (from anim_tags — animations model) ----
  // A cue is "in" a fade group when an anim_tag covering it carries a fade_in-named
  // alpha animation; "out" likewise for fade_out.
  function fadeAnimTagFor(kind: "in" | "out", wid: number) {
    if (!P) return null;
    const name = fadeAnimName(kind);
    return P.anim_tags.find((t) => t.ids.includes(wid) && t.anims.some((a) => a.name === name)) ?? null;
  }
  function fadeMembership(): "in" | "out" | null {
    const wid = selWid();
    if (wid == null) return null;
    if (fadeAnimTagFor("in", wid)) return "in";
    if (fadeAnimTagFor("out", wid)) return "out";
    return null;
  }

  // ---- derived: can* flags ----
  function canGroupFade() { return selectedWords.size >= 1 || selWid() != null; }
  function canMergeWords() { return selectedWords.size >= 2; }
  function canMergeEvents() { return !!P && sel.scope === "group" && sel.gi < P.layout.length - 1; }
  function canSplitEvent() { return !!P && sel.scope === "group" && P.layout[sel.gi]?.lines.length > 1; }
  function canBreakLine() { return sel.tok != null; }
  // true when the selected cue already has a break after it (pressing would JOIN)
  function breakLineOn() {
    if (!P || !sel.tok) return false;
    const g = P.layout[sel.gi];
    const { li, ti } = sel.tok;
    return ti === (g?.lines[li]?.toks.length ?? 0) - 1 && li < (g?.lines.length ?? 0) - 1;
  }
  function hasEvent() { return sel.scope === "group"; }
  // true when the selected cue is already a merged token (multi-word)
  function mergeOn() {
    return (currentTok()?.ids.length ?? 0) > 1;
  }
  // Unmerge is enabled exactly when the selected cue is a merged token (reuse mergeOn).
  function canUnmerge() { return mergeOn(); }
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
    for (let li = 0; li < g.lines.length; li++) {
      const line = g.lines[li];
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
        const fsEntry = resolved["fontsize"];
        const scale = fsEntry && fsEntry.src !== "global" && P.global_style.fontsize
          ? Number(fsEntry.value) / P.global_style.fontsize : 1;
        const boldEntry = resolved["bold"];
        const bold = boldEntry && boldEntry.src !== "global" ? Boolean(boldEntry.value) : null;
        const isSel = wid != null && tok.ids.includes(wid);
        caps.push({
          wid: tok.ids[0],
          li,
          scale,
          bold,
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
          // a merged cue carries per-word internal segments (positioned by each
          // word's real start/end); a single-word cue gets no subs.
          const subs = tok.ids.length > 1
            ? tok.ids.map((id) => ({
                text: P.words[id]?.text ?? "",
                s: P.words[id]?.start ?? 0,
                e: P.words[id]?.end ?? 0,
              }))
            : undefined;
          result.push({
            wid,
            text: tok.ids.map((id) => P.words[id]?.text ?? "").join(tok.sep || " "),
            s: w.start,
            e: Math.max(...tok.ids.map((id) => P.words[id]?.end ?? 0)),
            gi,
            li,
            ti,
            del: tok.del,
            anims: tok.anims_resolved ?? [],
            subs,
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

  // The fade buttons survive as preset shortcuts that write animation records onto
  // an anim_tag over the selection (reconciliation §3). "Group fade-in/out" dispatches
  // add_animation with the fade preset; "Clear in/out" dispatches remove_animation for
  // that tag-scope anim id. The full preset picker / Inspector animations UI lands later.
  function allAnimIds(): string[] {
    if (!P) return [];
    const ids: string[] = [];
    for (const a of P.globals.animations) ids.push(a.id);
    for (const g of P.layout) for (const a of g.animations) ids.push(a.id);
    for (const t of P.anim_tags) for (const a of t.anims) ids.push(a.id);
    return ids;
  }

  function groupFade(kind: "in" | "out") {
    const ids = wordsForOp();
    if (ids.length === 0) return;
    const id = freshAnimId(allAnimIds());
    const anim = kind === "in" ? fadeInAnim(id) : fadeOutAnim(id);
    dispatch("add_animation", { scope: "tag", ref: ids, anim });
  }

  function clearFade(kind: "in" | "out") {
    const ids = wordsForOp();
    if (ids.length === 0 || !P) return;
    const wid = ids[0];
    const tag = fadeAnimTagFor(kind, wid);
    if (!tag) return;
    const name = fadeAnimName(kind);
    const target = tag.anims.find((a) => a.name === name);
    if (!target) return;
    dispatch("remove_animation", { scope: "tag", ref: tag.ids, anim_id: target.id });
  }

  // ---- animation Inspector handlers (AnimSection dispatch contract) ----
  function animAdd(scope: AnimScope, ref: number | number[] | null, anim: import("../types").Animation) {
    dispatch("add_animation", { scope, ref, anim });
  }
  function animRemove(scope: AnimScope, ref: number | number[] | null, anim_id: string) {
    dispatch("remove_animation", { scope, ref, anim_id });
  }
  function animRestore(scope: AnimScope, ref: number | number[] | null, anim_id: string) {
    dispatch("restore_animation", { scope, ref, anim_id });
  }
  function animSetProps(scope: AnimScope, ref: number | number[] | null, anim_id: string, partial: Record<string, unknown>) {
    dispatch("set_animation_props", { scope, ref, anim_id, partial });
  }
  function selectCues(ids: number[]) {
    if (ids.length === 0) return;
    setSelectedWords(new Set(ids));
    anchorRef.current = ids[0];
  }

  // ── timeline strip handlers (cluster AT) ──
  // 1st click on a strip/cue selects the cue (clears any anim focus).
  function selectStrip(wid: number) {
    setAnimFocus(null);
    setExpandedCues(new Set());
    selectWordByWid(wid);
  }
  // 2nd click on a strip focuses the animation (Inspector drills into its row).
  function focusStrip(wid: number, aid: string) {
    setAnimFocus({ wid, aid });
    setRailTab("inspector");
  }
  function expandOverflow(wid: number) {
    setExpandedCues((prev) => new Set(prev).add(wid));
  }
  function collapseOverflow(wid: number) {
    setExpandedCues((prev) => { const n = new Set(prev); n.delete(wid); return n; });
  }
  // Derive {scope, ref} for an anim mutation from its resolved src + the cue.
  function animScopeRef(wid: number, aid: string): { scope: AnimScope; ref: number | number[] | null } | null {
    if (!P) return null;
    // find the resolved anim on the cue (its src tells us the carrier scope)
    let res: import("../types").ResolvedAnim | undefined;
    let gi = 0;
    outer: for (let g = 0; g < P.layout.length; g++) {
      for (const ln of P.layout[g].lines) {
        for (const tk of ln.toks) {
          if (tk.ids[0] === wid) {
            res = (tk.anims_resolved ?? []).find((a) => a.id === aid);
            gi = g;
            break outer;
          }
        }
      }
    }
    if (!res) return null;
    if (res.src === "global") return { scope: "global", ref: null };
    if (res.src === "group") return { scope: "group", ref: gi };
    // tag-sourced: ref = the covering tag's full ids
    const tag = P.anim_tags.find((t) => t.ids.includes(wid) && t.anims.some((a) => a.id === aid));
    return { scope: "cue", ref: tag ? tag.ids : [wid] };
  }
  // Drag-retime: set_animation_props {scope, ref, anim_id, partial:{t0|t1:{offset:Δms}}}.
  function animRetime(wid: number, aid: string, edge: "t0" | "t1", deltaMs: number) {
    const sr = animScopeRef(wid, aid);
    if (!sr) return;
    dispatch("set_animation_props", { scope: sr.scope, ref: sr.ref, anim_id: aid, partial: { [edge]: { offset: deltaMs } } });
  }

  function setLayoutProp(patch: Partial<{ linger: number; win_start: number | null; win_end: number | null }>) {
    if (!P) return;
    const g = P.layout[sel.gi];
    if (!g) return;
    dispatch("set_layout_props", {
      gi: sel.gi,
      win_start: patch.win_start !== undefined ? patch.win_start : g.win_start,
      win_end: patch.win_end !== undefined ? patch.win_end : g.win_end,
      linger: patch.linger !== undefined ? patch.linger : g.linger,
    });
  }

  function mergeWords() {
    if (!P) return;
    const ids = [...selectedWords].sort((a, b) => a - b);
    if (ids.length < 2) return;
    // The selection must be a layout-CONTIGUOUS run inside ONE group — it MAY span
    // line breaks now (engine merge_words_run drops the inner \N). Validate against
    // the group's flattened token order; keep the friendly toast for a gap/cross-group.
    let gi = -1;
    for (let g = 0; g < P.layout.length && gi < 0; g++) {
      if (P.layout[g].lines.some((ln) => ln.toks.some((t) => t.ids.some((id) => selectedWords.has(id))))) gi = g;
    }
    if (gi < 0) return;
    const group = P.layout[gi];
    // any selected id outside this group → cross-group, reject
    for (let g = 0; g < P.layout.length; g++) {
      if (g === gi) continue;
      if (P.layout[g].lines.some((ln) => ln.toks.some((t) => t.ids.some((id) => selectedWords.has(id))))) {
        setErrMsg("merge needs adjacent words in one event"); return;
      }
    }
    // flatten the group's tokens in layout order; the selected tokens must form an
    // unbroken contiguous span (no unselected token between the first and last).
    const flat: number[][] = [];
    for (const ln of group.lines) for (const t of ln.toks) flat.push(t.ids);
    const selPos = flat.map((tids, k) => (tids.some((id) => selectedWords.has(id)) ? k : -1)).filter((k) => k >= 0);
    const lo = selPos[0], hi = selPos[selPos.length - 1];
    const contiguous = selPos.length === hi - lo + 1 && hi > lo;
    if (!contiguous) { setErrMsg("merge needs adjacent (contiguous) words"); return; }
    pendingSelRef.current = { ids, kind: "merge" };
    dispatch("merge_words_run", { gi, ids });
  }

  // inverse of Merge words — split the selected merged cue back into separate words;
  // the resulting word cues stay selected (re-derived when the echo lands).
  function unmergeWord() {
    if (!P || !sel.tok) return;
    const tok = currentTok();
    if (!tok || tok.ids.length < 2) return;
    pendingSelRef.current = { ids: [...tok.ids], kind: "unmerge" };
    dispatch("unmerge_words", { gi: sel.gi, li: sel.tok.li, ti: sel.tok.ti });
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
    if (!P || !sel.tok) return;
    // §3 multi-select rule: when ≥2 cues are selected, look at how many lines they
    // span within a group. >1 line → JOIN those lines; else → BREAK after each
    // selected cue. With a single selection we keep the existing break/join toggle.
    // NOTE (known limitation, flagged): the multi paths fan out into several
    // break_line/join_lines dispatches — each is its own undo step (no atomic
    // multi-op tool exists yet). One Undo reverses one break/join, not the gesture.
    if (selectedWords.size >= 2) {
      // group the selection: per group, which line indices hold a selected cue
      for (let gi = 0; gi < P.layout.length; gi++) {
        const g = P.layout[gi];
        const liSet = new Set<number>();
        for (let li = 0; li < g.lines.length; li++) {
          if (g.lines[li].toks.some((t) => t.ids.some((id) => selectedWords.has(id)))) liSet.add(li);
        }
        if (liSet.size === 0) continue;
        if (liSet.size > 1) {
          // JOIN: collapse the spanned lines onto the first (join from the bottom up
          // so earlier line indices stay valid across the sequence of joins).
          const lis = [...liSet].sort((a, b) => a - b);
          const lo = lis[0], hi = lis[lis.length - 1];
          for (let li = hi - 1; li >= lo; li--) dispatch("join_lines", { gi, li });
        } else {
          // BREAK after EACH selected cue (skip the last tok of a line — nothing to
          // break there). Break from the right so token indices remain valid.
          const li = [...liSet][0];
          const toks = g.lines[li].toks;
          const tis: number[] = [];
          for (let ti = 0; ti < toks.length - 1; ti++) {
            if (toks[ti].ids.some((id) => selectedWords.has(id))) tis.push(ti);
          }
          for (let i = tis.length - 1; i >= 0; i--) dispatch("break_line", { gi, li, ti: tis[i], after: true });
        }
      }
      return;
    }
    const g = P.layout[sel.gi];
    const { li, ti } = sel.tok;
    const isLastInLine = ti === (g?.lines[li]?.toks.length ?? 0) - 1;
    if (isLastInLine && li < g.lines.length - 1) {
      // a break already follows this cue — toggle it off (join the next line)
      dispatch("join_lines", { gi: sel.gi, li });
    } else {
      dispatch("break_line", { gi: sel.gi, li, ti, after: true });
    }
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

  const dur = projectDur(P);
  const capWords = computeCapWords();
  const trackWords = computeTrackWords();
  // event/group boundary spans (min start / max end of each event's track words)
  // for the playhead/block magnet candidates.
  const tlEventBounds = P.layout
    .map((_, gi) => {
      const mine = trackWords.filter((w) => w.gi === gi);
      return mine.length ? { s: Math.min(...mine.map((w) => w.s)), e: Math.max(...mine.map((w) => w.e)) } : null;
    })
    .filter((b): b is { s: number; e: number } => b !== null);
  const tok = currentTok();
  const wid = selWid();
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
        aiConnected={store.connected}
        exportOpen={exportOpen}
        flash={flash}
        onPlay={() => { if (!playing) setPvMode("live"); setPlaying(!playing); }}
        onSeekRel={(d) => setTime((t) => Math.max(0, Math.min(dur, t + d)))}
        onHome={onHome}
        onExport={() => setExportOpen((o) => !o)}
        onUndo={doUndo}
        onRedo={doRedo}
        canUndo={canUndo}
        canRedo={canRedo}
      />
      {exportOpen && (
        <ExportMenu
          projectName={projectName}
          onClose={() => setExportOpen(false)}
          onBurn={(out, videoIn) => { burn(out, videoIn).catch((e) => setErrMsg(e instanceof Error ? e.message : String(e))); }}
        />
      )}
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
                onUploadVideo={async (file) => {
                  // Upload streams via /api/video; the WS state echo (new `video`
                  // object) updates the Attached meta. Errors surface in the toast;
                  // resolve regardless so VideoControl clears its busy state.
                  try { await videoApi.upload(file); }
                  catch (e) { setErrMsg(e instanceof Error ? e.message : String(e)); }
                }}
                onClearVideo={async () => {
                  try { await videoApi.clear(); }
                  catch (e) { setErrMsg(e instanceof Error ? e.message : String(e)); }
                }}
                onOpenInspector={() => setRailTab("inspector")}
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
                />
                {tok && <TimingPanel key={sel.tok ? `${sel.gi}-${sel.tok.li}-${sel.tok.ti}` : "none"} tok={tok} project={P} unlocked={timingsUnlocked} onToggleLock={() => setTimingsUnlocked((u) => !u)} onSetTime={setCueTime} onSetText={setCueText} />}
                <AnimSection
                  project={P}
                  scope={sel.scope}
                  gi={sel.gi}
                  selWid={wid}
                  onAdd={animAdd}
                  onRemove={animRemove}
                  onRestore={animRestore}
                  onSetProps={animSetProps}
                  onSelectCues={selectCues}
                />
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
            assText={assText}
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
          {(shiftHeld || ctrlHeld) && (
            <span className={"mod-cue" + (shiftHeld ? " shift" : " ctrl")}>
              {shiftHeld ? "⇧ Range select" : "⌘ Cherry-pick"}
            </span>
          )}
        </div>
        {groupExplicitSel && sel.scope === "group" && P.layout[sel.gi] && (
          <EventStrip g={P.layout[sel.gi]} onSet={setLayoutProp} />
        )}
        <OpsToolbar
          selCount={selCount}
          canGroupFade={canGroupFade()}
          fadeMembership={fade}
          canMergeWords={canMergeWords()}
          mergeOn={mergeOn()}
          canUnmerge={canUnmerge()}
          canMergeEvents={canMergeEvents()}
          canSplitEvent={canSplitEvent()}
          canBreakLine={canBreakLine()}
          breakLineOn={breakLineOn()}
          hasEvent={hasEvent()}
          wordDeleted={wordDeleted()}
          onGroupFade={groupFade}
          onClearFade={clearFade}
          onMergeWords={mergeWords}
          onUnmerge={unmergeWord}
          onMergeEvents={mergeEvents}
          onSplitEvent={splitEvent}
          onBreakLine={breakLine}
          onUngroupEvent={ungroupEvent}
          onDelete={deleteSel}
        />
        <div className="dock-body">
          {dockTab === "timeline" && (
            <div className="timeline-col">
              <div className="tl-toolrow">
                <button
                  className={"snap-toggle" + (magnet ? " on" : "") + (altHeld ? " alt" : "")}
                  onClick={toggleMagnet}
                  title="Magnet snapping — Alt during a drag inverts it"
                  aria-pressed={magnet}
                >
                  <Icon name="magnet" size={14} />
                  Magnet
                  <span className="st-state">{altHeld ? (magnet ? "off" : "on") : magnet ? "on" : "off"}</span>
                </button>
                <span className="tl-hint">Drag edges to snap · hold <b>Alt</b> to free</span>
              </div>
              <Waveform
                dur={dur}
                time={time}
                onSeek={setTime}
                blocks={trackWords.map((w) => ({ wid: w.wid, s: w.s, e: w.e }))}
                eventBounds={tlEventBounds}
                magnet={magnet}
              />
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
                magnet={magnet}
                onRetime={(updates) => dispatch("set_word_times", { updates })}
                animFocus={animFocus}
                expandedCues={expandedCues}
                onSelectStrip={selectStrip}
                onFocusStrip={focusStrip}
                onExpandOverflow={expandOverflow}
                onCollapseOverflow={collapseOverflow}
                onAnimRetime={animRetime}
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
