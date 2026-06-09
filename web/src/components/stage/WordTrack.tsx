import { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import { colorForIndex } from "../../model/palette";
import { computeMove, computeResize, dragMode } from "../../model/edit";
import type { TimeUpdate } from "../../model/edit";
import type { Project, Token, ResolvedAnim } from "../../types";
import { layoutBars, type Bar, BLOCK_H } from "../../model/animStrips";
import { packTimeline, type Density } from "../../model/trackPack";
import { collectTargets, snap, zoomAnchorScroll, type NearLine, type SnapTarget } from "../../model/snap";

export interface TrackWord {
  wid: number;
  text: string;
  s: number;
  e: number;
  gi: number;
  li: number;
  ti: number;
  del?: boolean;
  frac?: boolean;
  /** flat resolved animation list for this cue (daemon-filled tok.anims_resolved). */
  anims?: ResolvedAnim[];
  /** per-word internal segments for a MERGED cue (>1 id): each word positioned by
   * its real start/end so the block shows every word in its own time slice with a
   * divider tick. Absent / length≤1 for plain cues (rendered as one centered label). */
  subs?: { text: string; s: number; e: number }[];
}

/** Focused animation: a (cue word, anim id) pair, shared with the Inspector. */
export interface AnimFocus { wid: number; aid: string; }

export interface TrackEvent {
  gi: number;
  label: string;
}

interface WordTrackProps {
  words: TrackWord[];
  events: TrackEvent[];
  /** row-packing density: "lanes" (one row/group + gutter) | "coherent" | "compact". */
  density?: Density;
  dur: number;
  time: number;
  liveId: number | null;
  selId: number | null;
  selectedWords?: Set<number>;
  onSelect: (gi: number, li: number, ti: number, wid: number, mods: { ctrl?: boolean; shift?: boolean }) => void;
  /** double-click a block → flip to the Cue-lanes tab on that cue (zip 11 §6). */
  onOpen?: (gi: number, li: number, ti: number, wid: number) => void;
  // drag/retime props
  project?: Project;
  unlocked?: boolean;
  onRetime?: (updates: TimeUpdate[]) => void;
  // ── animation strips (cluster AT) ──
  /** focused animation (2-click), shared with the Inspector. */
  animFocus?: AnimFocus | null;
  /** cue word ids whose +N overflow stack is expanded inline. */
  expandedCues?: Set<number>;
  /** 1st click on a strip/cue → select the cue. */
  onSelectStrip?: (wid: number) => void;
  /** 2nd click on a strip (cue already selected) → focus that animation. */
  onFocusStrip?: (wid: number, aid: string) => void;
  /** click +N on the selected cue → expand inline. */
  onExpandOverflow?: (wid: number) => void;
  /** click the ✕ collapse chip → collapse. */
  onCollapseOverflow?: (wid: number) => void;
  /** drag a focused strip's handle → retime (edge t0|t1, signed delta ms). */
  onAnimRetime?: (wid: number, aid: string, edge: "t0" | "t1", deltaMs: number) => void;
  /** override the seconds→px scale (horizontal zoom); default = areaPx/dur. */
  pxPerSecOverride?: number;
  /** row height in px (vertical zoom); falls back to the CSS default. */
  rowH?: number;
  /** magnet snapping on? (default true). Alt held during a drag inverts it. */
  magnet?: boolean;
}

/** active snap visualisation (lock guide + soft near-lines), in seconds. */
interface SnapViz {
  hit: SnapTarget | null;
  near: NearLine[];
}

const MIN_ANIM_MS = 50; // clamp: a strip never shrinks below 50ms (HANDOFF §3)

interface DragState {
  active: boolean;
  cancelled: boolean;
  startX: number;
  areaPx: number;
  mode: "move" | "resize-start" | "resize-end";
  affectedToks: Token[];
  resizeTok: Token | null;
  edge: "start" | "end";
  movedEnough: boolean;
  // snap inputs (seconds)
  exclude: Set<number>; // dragged block wids (never snap an edge to itself)
  groupS: number; // min start of the moving group (for move-snap)
  groupE: number; // max end of the moving group
  edgeSec: number; // original time of the resized edge (for resize-snap)
}

// Expanded cues timeline: one labelled lane per layout event, cue blocks
// positioned by time, with a single playhead spanning all lanes.
export function WordTrack({
  words,
  events,
  density = "coherent",
  dur,
  time,
  liveId,
  selId,
  selectedWords,
  onSelect,
  onOpen,
  project,
  unlocked = false,
  onRetime,
  animFocus = null,
  expandedCues,
  onSelectStrip,
  onFocusStrip,
  onExpandOverflow,
  onCollapseOverflow,
  onAnimRetime,
  pxPerSecOverride,
  rowH,
  magnet = true,
}: WordTrackProps) {
  const progress = dur ? time / dur : 0;
  // Phase 5 reworks these into a single `expandedCue` accordion contract; accepted
  // but unused for now (the ＋N disc is a non-interactive placeholder this phase).
  void expandedCues; void onExpandOverflow; void onCollapseOverflow;

  // preview: map from wid -> { start, end } during live drag
  const [preview, setPreview] = useState<Map<number, { start: number; end: number }>>(new Map());
  // snap visualisation while a drag is locked / near a candidate
  const [snapViz, setSnapViz] = useState<SnapViz | null>(null);
  // source-linking (§11): the hovered group/global-sourced anim id, if any.
  const [hoverSid, setHoverSid] = useState<string>("");

  // measured track-area width (px) for the strip seconds→px scale + MIN_PX glyph
  // threshold. Falls back to a nominal width before layout / in jsdom.
  const areaElRef = useRef<HTMLDivElement | null>(null);
  const [areaPx, setAreaPx] = useState(1000);
  useEffect(() => {
    const el = areaElRef.current;
    if (el) { const w = el.getBoundingClientRect().width; if (w > 0) setAreaPx(w); }
  });
  const pxPerSec = pxPerSecOverride ?? (dur ? areaPx / dur : 100);
  // horizontal content width: at zoom 1 (or no override) this is ≥ the viewport
  // and the area fills it (% layout unchanged); above 1 it grows past the viewport
  // and the horizontal scroller activates. `minWidth` keeps the fill-the-viewport
  // floor so the drag math (dx / measured area width × dur) stays exact.
  const contentMinW = pxPerSecOverride != null && dur ? Math.round(pxPerSecOverride * dur) : 0;

  // Keep latest props in refs so stable callbacks can always see current values
  const projectRef = useRef(project);
  projectRef.current = project;
  const durRef = useRef(dur);
  durRef.current = dur;
  const onRetimeRef = useRef(onRetime);
  onRetimeRef.current = onRetime;
  // refs for snap inputs (read inside stable drag closures)
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const timeRef = useRef(time);
  timeRef.current = time;
  const magnetRef = useRef(magnet);
  magnetRef.current = magnet;

  // ── density FLIP + selected-cue pin + zoom anchoring (Phase 4) ──
  // The scroller is the vertical (and, when H-zoomed, horizontal) scroll viewport.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // previous [data-flip] rects, captured every render so a density change can
  // FLIP from the OLD layout to the NEW one (the old rects are already gone from
  // the DOM by the time the post-commit layout effect runs).
  const flipRectsRef = useRef<Map<string, DOMRect>>(new Map());
  // capture-before-layout state for the selected-cue vertical pin.
  const prevDensityRef = useRef(density);
  const prevPxPerSecRef = useRef(pxPerSec);
  const prevRowHRef = useRef(rowH);
  // y of the selected block within the scroller, captured pre-commit (render-phase
  // snapshot of the still-old DOM) so the post-commit effect can restore it.
  const pinTopRef = useRef<number | null>(null);
  // h-zoom anchor: the playhead's on-screen x captured pre-commit.
  const hAnchorRef = useRef<number | null>(null);

  const reduceMotion = useCallback(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // Render-phase capture: snapshot the CURRENT (about-to-be-replaced) layout the
  // first time we observe a density/zoom change, BEFORE React commits the new DOM.
  const selIdRef = useRef(selId);
  selIdRef.current = selId;
  if (
    prevDensityRef.current !== density ||
    prevPxPerSecRef.current !== pxPerSec ||
    prevRowHRef.current !== rowH
  ) {
    const sc = scrollerRef.current;
    if (sc) {
      // FLIP old rects (only meaningful for a density change).
      if (prevDensityRef.current !== density) {
        const m = new Map<string, DOMRect>();
        sc.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
          const key = el.dataset.flip!;
          m.set(key, el.getBoundingClientRect());
        });
        flipRectsRef.current = m;
      }
      // selected-cue vertical pin: its top relative to the scroller (still old DOM).
      const scTop = sc.getBoundingClientRect().top;
      const selEl = selIdRef.current != null
        ? sc.querySelector<HTMLElement>(`.wt-block[data-wid="${selIdRef.current}"]`)
        : null;
      pinTopRef.current = selEl ? selEl.getBoundingClientRect().top - scTop : null;
      // h-zoom anchor: keep the playhead's screen-x fixed.
      if (prevPxPerSecRef.current !== pxPerSec) {
        hAnchorRef.current = time * prevPxPerSecRef.current - sc.scrollLeft;
      } else {
        hAnchorRef.current = null;
      }
    }
  }

  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    const densityChanged = prevDensityRef.current !== density;
    const pxChanged = prevPxPerSecRef.current !== pxPerSec;
    const rowHChanged = prevRowHRef.current !== rowH;
    if (!sc || (!densityChanged && !pxChanged && !rowHChanged)) {
      prevDensityRef.current = density;
      prevPxPerSecRef.current = pxPerSec;
      prevRowHRef.current = rowH;
      return;
    }

    // 1) horizontal zoom anchor — keep the playhead's screen-x fixed
    //    (snap.ts:zoomAnchorScroll). hAnchorRef holds preX = time*oldPps - scrollLeft,
    //    so the new scrollLeft = time*newPps - preX.
    if (pxChanged && hAnchorRef.current != null) {
      sc.scrollLeft = zoomAnchorScroll(
        prevPxPerSecRef.current, pxPerSec, time,
        time * prevPxPerSecRef.current - hAnchorRef.current, // reconstruct old scrollLeft
        sc.clientWidth,
      );
      hAnchorRef.current = null;
    }

    // 2) vertical pin — keep the selected cue at the same viewport y.
    if (pinTopRef.current != null && selIdRef.current != null) {
      const scTop = sc.getBoundingClientRect().top;
      const selEl = sc.querySelector<HTMLElement>(`.wt-block[data-wid="${selIdRef.current}"]`);
      if (selEl) {
        const newTop = selEl.getBoundingClientRect().top - scTop;
        sc.scrollTop += newTop - pinTopRef.current;
      }
    }
    pinTopRef.current = null;

    // 3) FLIP the blocks + ruler + playhead — density change only, never mid-drag,
    //    skipped under prefers-reduced-motion. Animate TRANSFORM only.
    if (densityChanged && !dragRef.current?.active && !reduceMotion()) {
      const before = flipRectsRef.current;
      const els = Array.from(sc.querySelectorAll<HTMLElement>("[data-flip]"));
      const animated: HTMLElement[] = [];
      for (const el of els) {
        const o = before.get(el.dataset.flip!);
        if (!o) continue;
        const r = el.getBoundingClientRect();
        const dx = o.left - r.left;
        const dy = o.top - r.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        animated.push(el);
      }
      if (animated.length) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          for (const el of animated) {
            el.style.transition = "transform .38s var(--ease-out)";
            el.style.transform = "translate(0, 0)";
          }
        }));
        const t = setTimeout(() => {
          for (const el of animated) { el.style.transition = ""; el.style.transform = ""; }
        }, 460);
        prevDensityRef.current = density;
        prevPxPerSecRef.current = pxPerSec;
        prevRowHRef.current = rowH;
        return () => clearTimeout(t);
      }
    }

    prevDensityRef.current = density;
    prevPxPerSecRef.current = pxPerSec;
    prevRowHRef.current = rowH;
  });

  /** event boundary spans (min start / max end of each event's words) in seconds. */
  const eventSpans = useCallback((): { s: number; e: number }[] => {
    const ws = wordsRef.current;
    const out: { s: number; e: number }[] = [];
    for (const ev of eventsRef.current) {
      const mine = ws.filter((w) => w.gi === ev.gi);
      if (!mine.length) continue;
      out.push({ s: Math.min(...mine.map((w) => w.s)), e: Math.max(...mine.map((w) => w.e)) });
    }
    return out;
  }, []);

  /** all snap targets for a block drag, excluding the dragged block wids. */
  const blockTargets = useCallback(
    (exclude: Set<number>): SnapTarget[] =>
      collectTargets(
        wordsRef.current.map((w) => ({ wid: w.wid, s: w.s, e: w.e })),
        timeRef.current,
        eventSpans(),
        { start: 0, end: durRef.current },
        exclude,
      ),
    [eventSpans],
  );

  // drag state ref
  const dragRef = useRef<DragState | null>(null);

  // Stable window event handlers stored in refs
  const handlersRef = useRef<{
    pointermove: (e: PointerEvent) => void;
    pointerup: (e: PointerEvent) => void;
    keydown: (e: KeyboardEvent) => void;
    pointercancel: () => void;
  } | null>(null);

  const removeListeners = useCallback(() => {
    if (!handlersRef.current) return;
    window.removeEventListener("pointermove", handlersRef.current.pointermove);
    window.removeEventListener("pointerup", handlersRef.current.pointerup);
    window.removeEventListener("keydown", handlersRef.current.keydown);
    if (handlersRef.current.pointercancel) {
      window.removeEventListener("pointercancel", handlersRef.current.pointercancel);
    }
    handlersRef.current = null;
  }, []);

  // C1: clean up window listeners if component unmounts mid-drag
  useEffect(() => {
    return () => removeListeners();
  }, [removeListeners]);

  // Compute the magnet-corrected dt for a raw dt, plus the snap visualisation.
  // Group move snaps by ONE delta (kit: pick the better of the two raw edges);
  // resize snaps the single moving edge. Returns { dt, viz }.
  const applySnap = useCallback(
    (drag: DragState, rawDt: number, altHeld: boolean): { dt: number; viz: SnapViz | null } => {
      const pxPerSec = drag.areaPx / durRef.current;
      const opts = { enabled: magnetRef.current, altHeld };
      const targets = blockTargets(drag.exclude);

      if (drag.mode === "move") {
        const rawS = drag.groupS + rawDt;
        const rawE = drag.groupE + rawDt;
        const a = snap(rawS, targets, pxPerSec, opts);
        const b = snap(rawE, targets, pxPerSec, opts);
        const da = a.target ? Math.abs(a.sec - rawS) : Infinity;
        const db = b.target ? Math.abs(b.sec - rawE) : Infinity;
        let corr = 0;
        let hit: SnapTarget | null = null;
        if (a.target && da <= db) { corr = a.sec - rawS; hit = a.target; }
        else if (b.target) { corr = b.sec - rawE; hit = b.target; }
        const near = a.nearLines.length >= b.nearLines.length ? a.nearLines : b.nearLines;
        const viz = opts.enabled !== altHeld ? { hit, near } : null;
        return { dt: rawDt + corr, viz };
      }
      // resize: snap the single moving edge
      const raw = drag.edgeSec + rawDt;
      const r = snap(raw, targets, pxPerSec, opts);
      const corr = r.target ? r.sec - raw : 0;
      const viz = opts.enabled !== altHeld ? { hit: r.target, near: r.nearLines } : null;
      return { dt: rawDt + corr, viz };
    },
    [blockTargets],
  );

  // Start a drag - sets up window listeners
  const startDrag = useCallback(
    (state: DragState) => {
      dragRef.current = state;

      const onPointermove = (e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || !drag.active || drag.cancelled) return;
        const proj = projectRef.current;
        if (!proj) return;

        const dx = e.clientX - drag.startX;
        if (Math.abs(dx) >= 3) drag.movedEnough = true;
        if (!drag.movedEnough) return;

        const rawDt = (dx / drag.areaPx) * durRef.current;
        const { dt, viz } = applySnap(drag, rawDt, e.altKey);
        setSnapViz(viz);

        let updates: TimeUpdate[] = [];
        if (drag.mode === "move") {
          updates = computeMove(proj, drag.affectedToks, dt);
        } else if (drag.resizeTok) {
          updates = computeResize(proj, drag.resizeTok, drag.edge, dt);
        }

        if (updates.length > 0) {
          const map = new Map<number, { start: number; end: number }>();
          for (const u of updates) map.set(u.wid, { start: u.start, end: u.end });
          setPreview(map);
        }
      };

      const onPointerup = (e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || !drag.active) return;

        const proj = projectRef.current;
        const retimeFn = onRetimeRef.current;

        if (!drag.cancelled && drag.movedEnough && proj && retimeFn) {
          const dx = e.clientX - drag.startX;
          const rawDt = (dx / drag.areaPx) * durRef.current;
          const { dt } = applySnap(drag, rawDt, e.altKey);

          let updates: TimeUpdate[] = [];
          if (drag.mode === "move") {
            updates = computeMove(proj, drag.affectedToks, dt);
          } else if (drag.resizeTok) {
            updates = computeResize(proj, drag.resizeTok, drag.edge, dt);
          }

          if (updates.length > 0) retimeFn(updates);
        }

        dragRef.current = null;
        setPreview(new Map());
        setSnapViz(null);
        removeListeners();
      };

      const onKeydown = (e: KeyboardEvent) => {
        const drag = dragRef.current;
        if (!drag || !drag.active) return;
        if (e.key === "Escape") {
          e.stopImmediatePropagation();
          drag.cancelled = true;
          dragRef.current = null;
          setPreview(new Map());
          setSnapViz(null);
          removeListeners();
        }
      };

      // I1: cancel path for OS/touch interruptions (same as Esc cancel)
      const onPointercancel = () => {
        dragRef.current = null;
        setPreview(new Map());
        setSnapViz(null);
        removeListeners();
      };

      handlersRef.current = { pointermove: onPointermove, pointerup: onPointerup, keydown: onKeydown, pointercancel: onPointercancel };
      window.addEventListener("pointermove", onPointermove);
      window.addEventListener("pointerup", onPointerup);
      window.addEventListener("keydown", onKeydown);
      window.addEventListener("pointercancel", onPointercancel);
    },
    [removeListeners, applySnap]
  );

  const handleBlockPointerDown = useCallback(
    (
      e: React.PointerEvent<HTMLElement>,
      w: TrackWord,
      forceEdge?: "start" | "end"
    ) => {
      if (!unlocked || !project || !onRetime) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const width = rect.width;

      let mode: "move" | "resize-start" | "resize-end";
      if (forceEdge === "start") {
        mode = "resize-start";
      } else if (forceEdge === "end") {
        mode = "resize-end";
      } else {
        mode = dragMode(localX, width);
      }

      // Get area element width for px->seconds conversion
      const areaEl = e.currentTarget.closest(".wt-area");
      const areaPx = areaEl ? areaEl.getBoundingClientRect().width : 1000;

      // Resolve token
      const thisTok = project.layout[w.gi]?.lines[w.li]?.toks[w.ti] ?? null;
      if (!thisTok) return;

      let affectedToks: Token[] = [];
      let resizeTok: Token | null = null;
      let edge: "start" | "end" = "end";

      if (mode === "move") {
        const isInSelection = selectedWords?.has(w.wid) ?? false;
        if (isInSelection && selectedWords && selectedWords.size > 0) {
          for (const word of words) {
            if (selectedWords.has(word.wid)) {
              const tok = project.layout[word.gi]?.lines[word.li]?.toks[word.ti] ?? null;
              if (tok) affectedToks.push(tok);
            }
          }
        } else {
          affectedToks = [thisTok];
        }
      } else {
        resizeTok = thisTok;
        edge = mode === "resize-start" ? "start" : "end";
      }

      e.preventDefault();
      e.stopPropagation();

      // snap inputs: the moving wids' track span + which edge is being resized
      const movingWids = new Set<number>(
        mode === "move" ? affectedToks.flatMap((t) => t.ids) : thisTok.ids,
      );
      const movingWords = words.filter((w) => movingWids.has(w.wid));
      const groupS = movingWords.length ? Math.min(...movingWords.map((w) => w.s)) : w.s;
      const groupE = movingWords.length ? Math.max(...movingWords.map((w) => w.e)) : w.e;
      const edgeSec = edge === "start" ? groupS : groupE;

      startDrag({
        active: true,
        cancelled: false,
        startX: e.clientX,
        areaPx,
        mode,
        affectedToks,
        resizeTok,
        edge,
        movedEnough: false,
        exclude: movingWids,
        groupS,
        groupE,
        edgeSec,
      });
    },
    [unlocked, project, onRetime, selectedWords, words, startDrag]
  );

  const handleBlockPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, w: TrackWord) => {
      // If drag didn't move enough, treat as click/select
      const drag = dragRef.current;
      if (drag && !drag.movedEnough) {
        onSelect(w.gi, w.li, w.ti, w.wid, { ctrl: e.ctrlKey || (e as any).metaKey, shift: e.shiftKey });
      }
    },
    [onSelect]
  );

  // ── strip-handle drag → retime the focused animation ──
  // Mirrors the body-drag listener machinery: window pointer listeners, Esc/cancel
  // abort with no dispatch, px→ms via the area scale, ≥50ms clamp.
  const animDragRef = useRef<{
    wid: number; aid: string; edge: "t0" | "t1";
    startX: number; pxPerSec: number; s: number; e: number; cancelled: boolean;
    targets: SnapTarget[];
  } | null>(null);
  const animHandlersRef = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; key: (e: KeyboardEvent) => void; cancel: () => void } | null>(null);

  const removeAnimListeners = useCallback(() => {
    const h = animHandlersRef.current;
    if (!h) return;
    window.removeEventListener("pointermove", h.move);
    window.removeEventListener("pointerup", h.up);
    window.removeEventListener("keydown", h.key);
    window.removeEventListener("pointercancel", h.cancel);
    animHandlersRef.current = null;
  }, []);
  useEffect(() => removeAnimListeners, [removeAnimListeners]);

  const startAnimDrag = useCallback(
    (e: React.PointerEvent, w: TrackWord, aid: string, edge: "t0" | "t1", pxPerSec: number) => {
      e.preventDefault();
      e.stopPropagation();
      const an = w.anims?.find((a) => a.id === aid);
      if (!an) return;
      const starts = an.segments.map((s) => s.start_s);
      const ends = an.segments.map((s) => s.end_s);
      // snap candidates (§11): cue edges, OTHER strips on the cue, the playhead,
      // and the window ends. The dragged strip's own edges are excluded.
      const stripTargets: SnapTarget[] = [
        { sec: 0, kind: "edge" },
        { sec: durRef.current, kind: "edge" },
        { sec: timeRef.current, kind: "playhead" },
        { sec: w.s, kind: "block" },
        { sec: w.e, kind: "block" },
      ];
      for (const other of w.anims ?? []) {
        if (other.id === aid) continue;
        for (const seg of other.segments) {
          stripTargets.push({ sec: seg.start_s, kind: "anim" }, { sec: seg.end_s, kind: "anim" });
        }
      }
      animDragRef.current = {
        wid: w.wid, aid, edge, startX: e.clientX, pxPerSec,
        s: Math.min(...starts), e: Math.max(...ends), cancelled: false,
        targets: stripTargets,
      };
      // magnet-snap the dragged edge's raw seconds before the 50ms clamp, so the
      // {t0|t1:{offset}} dispatch contract and the clamp stay unchanged.
      const snappedRawSec = (d: NonNullable<typeof animDragRef.current>, clientX: number, altHeld: boolean): { rawSec: number; viz: SnapViz | null } => {
        const rawSec = (clientX - d.startX) / d.pxPerSec;
        const edgeSec = (d.edge === "t0" ? d.s : d.e) + rawSec;
        const r = snap(edgeSec, d.targets, d.pxPerSec, { enabled: magnetRef.current, altHeld });
        const viz = magnetRef.current !== altHeld ? { hit: r.target, near: r.nearLines } : null;
        return { rawSec: rawSec + (r.target ? r.sec - edgeSec : 0), viz };
      };
      const computeDeltaMs = (d: NonNullable<typeof animDragRef.current>, clientX: number, altHeld: boolean): number => {
        const minMs = MIN_ANIM_MS / 1000;
        const rawSec = snappedRawSec(d, clientX, altHeld).rawSec;
        if (d.edge === "t0") {
          // left handle: clamp so start never passes (end - 50ms)
          const maxStart = d.e - minMs;
          const newStart = Math.min(d.s + rawSec, maxStart);
          return Math.round((newStart - d.s) * 1000);
        }
        // right handle: clamp so end never passes (start + 50ms)
        const minEnd = d.s + minMs;
        const newEnd = Math.max(d.e + rawSec, minEnd);
        return Math.round((newEnd - d.e) * 1000);
      };
      const move = (ev: PointerEvent) => {
        const d = animDragRef.current;
        if (!d || d.cancelled) return;
        setSnapViz(snappedRawSec(d, ev.clientX, ev.altKey).viz);
      };
      const up = (ev: PointerEvent) => {
        const d = animDragRef.current;
        animDragRef.current = null;
        setSnapViz(null);
        removeAnimListeners();
        if (!d || d.cancelled) return;
        const deltaMs = computeDeltaMs(d, ev.clientX, ev.altKey);
        if (deltaMs !== 0 && onAnimRetime) onAnimRetime(d.wid, d.aid, d.edge, deltaMs);
      };
      const key = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
          ev.stopImmediatePropagation();
          if (animDragRef.current) animDragRef.current.cancelled = true;
          animDragRef.current = null;
          setSnapViz(null);
          removeAnimListeners();
        }
      };
      const cancel = () => { animDragRef.current = null; setSnapViz(null); removeAnimListeners(); };
      animHandlersRef.current = { move, up, key, cancel };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("keydown", key);
      window.addEventListener("pointercancel", cancel);
    },
    [onAnimRetime, removeAnimListeners]
  );

  // 1st click selects the cue; 2nd click (cue already selected) focuses the anim.
  const handleStripClick = useCallback(
    (e: React.MouseEvent, w: TrackWord, aid: string) => {
      e.stopPropagation();
      if (selId === w.wid) onFocusStrip?.(w.wid, aid);
      else onSelectStrip?.(w.wid);
    },
    [selId, onSelectStrip, onFocusStrip]
  );

  // Active source-link id: a group/global-sourced anim that's hovered or focused
  // lights up every other in-view strip sharing the same source (anim) id.
  const focusedSrc = (() => {
    if (!animFocus) return null;
    const fw = words.find((w) => w.wid === animFocus.wid);
    const fa = fw?.anims?.find((a) => a.id === animFocus.aid);
    return fa && (fa.src === "group" || fa.src === "global") ? fa.id : null;
  })();
  const linkSid = hoverSid || focusedSrc || "";
  /** is this strip part of the active source-link set? */
  const isLinked = (aid: string, src: ResolvedAnim["src"]): boolean =>
    !!linkSid && aid === linkSid && (src === "group" || src === "global");
  /** the group/global source id for a strip (for hover-link), else "". */
  const stripSid = (aid: string, src: ResolvedAnim["src"]): string =>
    src === "group" || src === "global" ? aid : "";

  const hasSel = selId != null || (selectedWords?.size ?? 0) > 0;

  // Preview-aware time bounds for a word (live drag overrides s/e).
  const boundsOf = (w: TrackWord): { s: number; e: number } => {
    const pv = preview.get(w.wid);
    return { s: pv ? pv.start : w.s, e: pv ? pv.end : w.e };
  };

  // ── group-coherent row packing (Phase 3) ──
  // Items carry preview-aware spans so a live drag re-packs honestly (the row
  // assignment is recomputed each render — drag math is unaffected, it reads the
  // stable areaPx). Lanes mode keeps the labelled per-group gutter.
  const isLanes = density === "lanes";
  const items = words.map((w) => {
    const { s, e } = boundsOf(w);
    return { key: String(w.wid), gi: w.gi, s, e };
  });
  const pack = packTimeline(items, density);
  const byWid = new Map(words.map((w) => [w.wid, w]));

  // one group per row (lanes): the row's representative group for the gutter label.
  const rowGroup = (row: { key: string; gi: number }[]): number | null =>
    row.length ? row[0].gi : null;
  const labelFor = (gi: number): string =>
    events.find((ev) => ev.gi === gi)?.label ?? "";

  /** Render a single cue as a constant-height card. `firstArea` flags the row
   *  whose `.wt-area` carries the pxPerSec measure ref (stable full width). */
  const renderBlock = (w: TrackWord) => {
    const { s, e } = boundsOf(w);
    const left = (s / dur) * 100;
    const width = Math.max(0.4, ((e - s) / dur) * 100);
    const isMulti = selectedWords?.has(w.wid) ?? false;
    const anims = w.anims ?? [];
    const { bars, overflowCount } = anims.length > 0
      ? layoutBars(anims, s, pxPerSec, { groupColor: colorForIndex(w.gi) })
      : { bars: [] as Bar[], overflowCount: 0 };
    const muted = !(w.wid === selId || isMulti);
    const cls =
      "wt-block block" +
      (w.wid === liveId ? " live" : "") +
      (w.wid === selId || isMulti ? " sel" : "") +
      (w.del ? " del" : "");
    return (
      <div
        key={w.wid}
        className={cls}
        data-wid={w.wid}
        data-flip={"c" + w.wid}
        style={{
          position: "absolute", left: `${left}%`, width: `${width}%`,
          height: `${BLOCK_H}px`, background: colorForIndex(w.gi),
        }}
        onPointerDown={unlocked ? (ev) => handleBlockPointerDown(ev, w) : undefined}
        onPointerUp={unlocked ? (ev) => handleBlockPointerUp(ev, w) : undefined}
        onClick={
          unlocked
            ? undefined
            : (ev) => onSelect(w.gi, w.li, w.ti, w.wid, { ctrl: ev.ctrlKey || ev.metaKey, shift: ev.shiftKey })
        }
        onDoubleClick={() => onOpen?.(w.gi, w.li, w.ti, w.wid)}
        title={`${w.text} · ${s.toFixed(2)}–${e.toFixed(2)}s`}
      >
        {unlocked && (
          <span
            className="wt-handle l"
            onPointerDown={(ev) => {
              ev.stopPropagation();
              handleBlockPointerDown(ev as unknown as React.PointerEvent<HTMLElement>, w, "start");
            }}
          />
        )}
        <span className="blk-title">
          {w.subs && w.subs.length > 1
            ? w.subs.map((sub, i) => {
                // each word positioned by its real time inside the title band;
                // a dashed divider precedes every word after the first (kit port).
                const denom = (e - s) || 1;
                return (
                  <span
                    key={i}
                    className="blk-seg"
                    style={{
                      left: `${((sub.s - s) / denom) * 100}%`,
                      width: `${((sub.e - sub.s) / denom) * 100}%`,
                      borderLeft: i > 0 ? "1px dashed rgba(255,255,255,.5)" : "none",
                    }}
                    title={`${sub.text} · ${sub.s.toFixed(2)}–${sub.e.toFixed(2)}s`}
                  >
                    {sub.text}
                  </span>
                );
              })
            : <span className="bt">{w.text}</span>}
        </span>
        {unlocked && (
          <span
            className="wt-handle r"
            onPointerDown={(ev) => {
              ev.stopPropagation();
              handleBlockPointerDown(ev as unknown as React.PointerEvent<HTMLElement>, w, "end");
            }}
          />
        )}
        {bars.length > 0 && (
          <span className={"cue-anims" + (muted ? " muted" : "")}>
            {bars.map((bar, k) => {
              const aid = (w.anims![k]).id;
              return (
                <AnimStripEl
                  key={aid}
                  bar={bar}
                  aid={aid}
                  focused={animFocus?.wid === w.wid && animFocus?.aid === aid}
                  linked={isLinked(aid, bar.src)}
                  onClick={(ev) => handleStripClick(ev, w, aid)}
                  onHandleDown={(ev, edge) => startAnimDrag(ev, w, aid, edge, pxPerSec)}
                  onHoverSid={(sid) => setHoverSid(sid)}
                  sid={stripSid(aid, bar.src)}
                />
              );
            })}
          </span>
        )}
        {overflowCount > 0 && (
          // Phase 3: non-interactive ＋N placeholder. The expand-to-overlay
          // accordion that replaces it lands in Phase 5.
          <span className="disc" aria-hidden="true">＋{overflowCount}</span>
        )}
      </div>
    );
  };

  return (
    <div
      className={"wt" + (unlocked ? " unlocked" : "") + (hasSel ? " has-sel" : "") + (isLanes ? " lanes" : "")}
      style={rowH ? ({ ["--row-h" as string]: `${rowH}px` } as React.CSSProperties) : undefined}
    >
      <div className="wt-scroller" ref={scrollerRef}>
        <div className="wt-content" style={contentMinW ? { minWidth: `${contentMinW}px` } : undefined}>
        {pack.rows.map((row, r) => {
          const gi = rowGroup(row);
          return (
            <div className="wt-row" key={r}>
              {isLanes && gi != null && (
                <div className="wt-gutter">
                  <span className="glabel" title={labelFor(gi)}>
                    <span className="gdot" style={{ background: colorForIndex(gi) }} />
                    <span className="gname">{labelFor(gi)}</span>
                  </span>
                </div>
              )}
              <div className="wt-area" ref={r === 0 ? areaElRef : undefined}>
                {row.map((it) => {
                  const w = byWid.get(Number(it.key));
                  return w ? renderBlock(w) : null;
                })}
              </div>
            </div>
          );
        })}
        <div
          className="wt-playhead"
          data-flip="ph"
          style={{ left: `calc(var(--tl-gutter) + ${progress} * (100% - var(--tl-gutter)))` }}
        />
        {snapViz && (
          <div className="wt-guides" aria-hidden="true">
            {snapViz.near.map((n) => {
              if (snapViz.hit && Math.abs(n.sec - snapViz.hit.sec) < 1e-3) return null;
              const f = dur ? n.sec / dur : 0;
              return (
                <div
                  key={`near-${n.sec.toFixed(4)}`}
                  className="snap-guide near"
                  style={{
                    left: `calc(var(--tl-gutter) + ${f} * (100% - var(--tl-gutter)))`,
                    opacity: (0.15 + n.opacity * 0.45).toFixed(3),
                  }}
                />
              );
            })}
            {snapViz.hit && (
              <div
                className={"snap-guide" + (snapViz.hit.kind === "playhead" ? " k-playhead" : "")}
                style={{
                  left: `calc(var(--tl-gutter) + ${(dur ? snapViz.hit.sec / dur : 0)} * (100% - var(--tl-gutter)))`,
                }}
              >
                <span className="sg-tag">{snapViz.hit.sec.toFixed(2)}s</span>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// ── one animation strip (constant-height bar or glyph chip) ──────────────────
function AnimStripEl({
  bar, aid, focused, linked, sid, onClick, onHandleDown, onHoverSid,
}: {
  bar: Bar;
  aid: string;
  focused: boolean;
  linked: boolean;
  sid: string;
  onClick: (e: React.MouseEvent) => void;
  onHandleDown: (e: React.PointerEvent, edge: "t0" | "t1") => void;
  onHoverSid: (sid: string) => void;
}) {
  // hover a group/global strip → light up its source-link set; leave → clear.
  const hover = { onMouseEnter: () => onHoverSid(sid), onMouseLeave: () => onHoverSid("") };
  if (bar.kind === "glyph") {
    return (
      <button
        className={"astrip glyph t-" + bar.vt + (focused ? " foc" : "") + (linked ? " linked" : "")}
        data-aid={aid}
        data-sid={sid}
        onClick={onClick}
        {...hover}
        style={{ left: `${bar.leftPx}px`, top: `${bar.topPx}px`, height: `${bar.heightPx + 3}px` }}
        title="too short — zoom in to expand"
      >
        <i className="g-ic">{bar.glyph}</i>
        {focused && (
          <>
            <i className="h h-l" onPointerDown={(e) => onHandleDown(e, "t0")} />
            <i className="h h-r" onPointerDown={(e) => onHandleDown(e, "t1")} />
          </>
        )}
      </button>
    );
  }
  // real bar. The visual fill (and the `size` wedge clip-path) live on an inner
  // <i class="astrip-fill"> so the <button> stays a full-rectangle hit target:
  // clip-path on the button itself would carve away most of its click area (the
  // wedge leaves only a triangle), letting the cue block intercept clicks at the
  // strip's geometric centre — which breaks select→focus (AP-5).
  return (
    <button
      className={"astrip t-" + bar.vt + (focused ? " foc" : "") + (bar.warning ? " warn" : "") + (linked ? " linked" : "")}
      data-aid={aid}
      data-sid={sid}
      onClick={onClick}
      {...hover}
      style={{
        left: `${bar.leftPx}px`, width: `${bar.widthPx}px`, top: `${bar.topPx}px`, height: `${bar.heightPx}px`,
      }}
    >
      <i
        className="astrip-fill"
        aria-hidden="true"
        style={{ background: bar.fill, ...(bar.clip ? { clipPath: bar.clip } : {}) }}
      />
      {bar.vt === "move" && <i className="arrow">→</i>}
      {focused && (
        <>
          <i className="h h-l" onPointerDown={(e) => onHandleDown(e, "t0")} />
          <i className="h h-r" onPointerDown={(e) => onHandleDown(e, "t1")} />
        </>
      )}
    </button>
  );
}
