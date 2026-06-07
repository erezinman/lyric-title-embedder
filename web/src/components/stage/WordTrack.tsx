import { useRef, useState, useCallback, useEffect } from "react";
import { colorForIndex } from "../../model/palette";
import { computeMove, computeResize, dragMode } from "../../model/edit";
import type { TimeUpdate } from "../../model/edit";
import type { Project, Token, ResolvedAnim } from "../../types";
import { layoutStrips, stripStyle, typeColor, typeGlyph, type StripLayout } from "../../model/animStrips";

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
  dur: number;
  time: number;
  liveId: number | null;
  selId: number | null;
  selectedWords?: Set<number>;
  onSelect: (gi: number, li: number, ti: number, wid: number, mods: { ctrl?: boolean; shift?: boolean }) => void;
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
}

// Expanded cues timeline: one labelled lane per layout event, cue blocks
// positioned by time, with a single playhead spanning all lanes.
export function WordTrack({
  words,
  events,
  dur,
  time,
  liveId,
  selId,
  selectedWords,
  onSelect,
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
}: WordTrackProps) {
  const progress = dur ? time / dur : 0;
  const lanes = (events ?? []).filter((ev) => words.some((w) => w.gi === ev.gi));

  // preview: map from wid -> { start, end } during live drag
  const [preview, setPreview] = useState<Map<number, { start: number; end: number }>>(new Map());

  // measured track-area width (px) for the strip seconds→px scale + MIN_PX glyph
  // threshold. Falls back to a nominal width before layout / in jsdom.
  const areaElRef = useRef<HTMLDivElement | null>(null);
  const [areaPx, setAreaPx] = useState(1000);
  useEffect(() => {
    const el = areaElRef.current;
    if (el) { const w = el.getBoundingClientRect().width; if (w > 0) setAreaPx(w); }
  });
  const pxPerSec = pxPerSecOverride ?? (dur ? areaPx / dur : 100);

  // Keep latest props in refs so stable callbacks can always see current values
  const projectRef = useRef(project);
  projectRef.current = project;
  const durRef = useRef(dur);
  durRef.current = dur;
  const onRetimeRef = useRef(onRetime);
  onRetimeRef.current = onRetime;

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

        const dt = (dx / drag.areaPx) * durRef.current;

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
          const dt = (dx / drag.areaPx) * durRef.current;

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
          removeListeners();
        }
      };

      // I1: cancel path for OS/touch interruptions (same as Esc cancel)
      const onPointercancel = () => {
        dragRef.current = null;
        setPreview(new Map());
        removeListeners();
      };

      handlersRef.current = { pointermove: onPointermove, pointerup: onPointerup, keydown: onKeydown, pointercancel: onPointercancel };
      window.addEventListener("pointermove", onPointermove);
      window.addEventListener("pointerup", onPointerup);
      window.addEventListener("keydown", onKeydown);
      window.addEventListener("pointercancel", onPointercancel);
    },
    [removeListeners]
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
    (e: React.PointerEvent, w: TrackWord, strip: StripLayout, edge: "t0" | "t1", pxPerSec: number) => {
      e.preventDefault();
      e.stopPropagation();
      const an = w.anims?.find((a) => a.id === strip.aid);
      if (!an) return;
      const starts = an.segments.map((s) => s.start_s);
      const ends = an.segments.map((s) => s.end_s);
      animDragRef.current = {
        wid: w.wid, aid: strip.aid, edge, startX: e.clientX, pxPerSec,
        s: Math.min(...starts), e: Math.max(...ends), cancelled: false,
      };
      const computeDeltaMs = (d: NonNullable<typeof animDragRef.current>, clientX: number): number => {
        const minMs = MIN_ANIM_MS / 1000;
        const rawSec = (clientX - d.startX) / d.pxPerSec;
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
      const move = () => {};
      const up = (ev: PointerEvent) => {
        const d = animDragRef.current;
        animDragRef.current = null;
        removeAnimListeners();
        if (!d || d.cancelled) return;
        const deltaMs = computeDeltaMs(d, ev.clientX);
        if (deltaMs !== 0 && onAnimRetime) onAnimRetime(d.wid, d.aid, d.edge, deltaMs);
      };
      const key = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
          ev.stopImmediatePropagation();
          if (animDragRef.current) animDragRef.current.cancelled = true;
          animDragRef.current = null;
          removeAnimListeners();
        }
      };
      const cancel = () => { animDragRef.current = null; removeAnimListeners(); };
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
    (e: React.MouseEvent, w: TrackWord, strip: StripLayout) => {
      e.stopPropagation();
      if (strip.kind === "overflow") {
        if (selId === w.wid) onExpandOverflow?.(w.wid);
        else onSelectStrip?.(w.wid);
        return;
      }
      if (strip.kind === "collapse") { onCollapseOverflow?.(w.wid); return; }
      if (selId === w.wid) onFocusStrip?.(w.wid, strip.aid);
      else onSelectStrip?.(w.wid);
    },
    [selId, onSelectStrip, onFocusStrip, onExpandOverflow, onCollapseOverflow]
  );

  return (
    <div className={"wt" + (unlocked ? " unlocked" : "")}>
      {lanes.map((ev) => (
        <div className="wt-lane" key={ev.gi}>
          <div className="wt-label" title={ev.label}>
            <span className="wt-dot" style={{ background: colorForIndex(ev.gi) }} />
            <span className="wt-name">{ev.label}</span>
          </div>
          <div className="wt-area" ref={lanes[0]?.gi === ev.gi ? areaElRef : undefined}>
            {words
              .filter((w) => w.gi === ev.gi)
              .map((w) => {
                // Use preview times if available
                const pv = preview.get(w.wid);
                const s = pv ? pv.start : w.s;
                const e = pv ? pv.end : w.e;
                const left = (s / dur) * 100;
                const width = Math.max(0.4, ((e - s) / dur) * 100);
                const isMulti = selectedWords?.has(w.wid) ?? false;
                // ── animation strips for this cue (cluster AT) ──
                const anims = w.anims ?? [];
                const expanded = expandedCues?.has(w.wid) ?? false;
                const layout = anims.length > 0 ? layoutStrips(anims, s, pxPerSec, expanded) : null;
                const muted = !(w.wid === selId || isMulti);
                const cls =
                  "block" +
                  (w.wid === liveId ? " live" : "") +
                  (w.wid === selId || isMulti ? " sel" : "") +
                  (w.del ? " del" : "") +
                  (layout?.exp ? " exp" : "");
                return (
                  <div
                    key={w.wid}
                    className={cls}
                    style={{
                      position: "relative", left: `${left}%`, width: `${width}%`, background: colorForIndex(w.gi),
                      ...(layout?.exp ? { height: `${layout.cueHeight}px` } : {}),
                    }}
                    onPointerDown={unlocked ? (ev) => handleBlockPointerDown(ev, w) : undefined}
                    onPointerUp={unlocked ? (ev) => handleBlockPointerUp(ev, w) : undefined}
                    onClick={
                      unlocked
                        ? undefined
                        : (ev) => onSelect(w.gi, w.li, w.ti, w.wid, { ctrl: ev.ctrlKey || ev.metaKey, shift: ev.shiftKey })
                    }
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
                    {w.subs && w.subs.length > 1
                      ? w.subs.map((sub, i) => {
                          // position each word inside the merged block by its real
                          // time, relative to the block span; a divider tick (left
                          // border) separates every word after the first. (kit port)
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
                    {unlocked && (
                      <span
                        className="wt-handle r"
                        onPointerDown={(ev) => {
                          ev.stopPropagation();
                          handleBlockPointerDown(ev as unknown as React.PointerEvent<HTMLElement>, w, "end");
                        }}
                      />
                    )}
                    {layout && (
                      <span className={"cue-anims" + (muted ? " muted" : "")}>
                        {layout.strips.map((strip, k) => (
                          <AnimStripEl
                            key={strip.kind === "bar" || strip.kind === "glyph" ? strip.aid : `${strip.kind}-${k}`}
                            strip={strip}
                            focused={animFocus?.wid === w.wid && animFocus?.aid === strip.aid}
                            onClick={(ev) => handleStripClick(ev, w, strip)}
                            onHandleDown={(ev, edge) => startAnimDrag(ev, w, strip, edge, pxPerSec)}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
      <div
        className="wt-playhead"
        style={{ left: `calc(var(--tl-gutter) + ${progress} * (100% - var(--tl-gutter)))` }}
      />
    </div>
  );
}

// ── one animation strip (bar / glyph / overflow / collapse) ──────────────────
function AnimStripEl({
  strip, focused, onClick, onHandleDown,
}: {
  strip: StripLayout;
  focused: boolean;
  onClick: (e: React.MouseEvent) => void;
  onHandleDown: (e: React.PointerEvent, edge: "t0" | "t1") => void;
}) {
  const common = `${strip.left}px`;
  if (strip.kind === "collapse") {
    return (
      <button className="astrip collapse" data-aid="collapse" onClick={onClick} title="Collapse stack">
        <span className="ov-n">✕</span>
      </button>
    );
  }
  if (strip.kind === "overflow") {
    return (
      <button
        className="astrip overflow"
        data-aid="over"
        onClick={onClick}
        style={{ left: common, width: `${strip.width}px`, top: `${strip.top}%`, height: `${strip.height}%`,
                 background: `linear-gradient(90deg, ${strip.stripes})` }}
        title={`${strip.count} more animations`}
      >
        <span className="ov-n">+{strip.count}</span>
      </button>
    );
  }
  if (strip.kind === "glyph") {
    return (
      <button
        className={"astrip glyph t-" + strip.vt + (focused ? " foc" : "")}
        data-aid={strip.aid}
        onClick={onClick}
        style={{ left: common, top: `${strip.top}%`, height: `${strip.height}%` }}
        title="too short — zoom in to expand"
      >
        <i className="g-ic">{typeGlyph(strip.vt)}</i>
        {focused && (
          <>
            <i className="h h-l" onPointerDown={(e) => onHandleDown(e, "t0")} />
            <i className="h h-r" onPointerDown={(e) => onHandleDown(e, "t1")} />
          </>
        )}
      </button>
    );
  }
  // real bar
  return (
    <button
      className={"astrip t-" + strip.vt + (focused ? " foc" : "") + (strip.warning ? " warn" : "")}
      data-aid={strip.aid}
      onClick={onClick}
      style={{ left: common, width: `${strip.width}px`, top: `${strip.top}%`, height: `${strip.height}%`,
               ...stripStyle(strip.vt, typeColor(strip.vt)) }}
    >
      {strip.vt === "move" && <i className="arrow">→</i>}
      {focused && (
        <>
          <i className="h h-l" onPointerDown={(e) => onHandleDown(e, "t0")} />
          <i className="h h-r" onPointerDown={(e) => onHandleDown(e, "t1")} />
        </>
      )}
    </button>
  );
}
