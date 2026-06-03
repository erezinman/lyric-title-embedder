import { useRef, useState, useCallback, useEffect } from "react";
import { colorForIndex } from "../../model/palette";
import { computeMove, computeResize, dragMode } from "../../model/edit";
import type { TimeUpdate } from "../../model/edit";
import type { Project, Token } from "../../types";

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
}

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
}

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
}: WordTrackProps) {
  const progress = dur ? time / dur : 0;
  const lanes = (events ?? []).filter((ev) => words.some((w) => w.gi === ev.gi));

  // preview: map from wid -> { start, end } during live drag
  const [preview, setPreview] = useState<Map<number, { start: number; end: number }>>(new Map());

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

  return (
    <div className={"wt" + (unlocked ? " unlocked" : "")}>
      {lanes.map((ev) => (
        <div className="wt-lane" key={ev.gi}>
          <div className="wt-label" title={ev.label}>
            <span className="wt-dot" style={{ background: colorForIndex(ev.gi) }} />
            <span className="wt-name">{ev.label}</span>
          </div>
          <div className="wt-area">
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
                const cls =
                  "block" +
                  (w.wid === liveId ? " live" : "") +
                  (w.wid === selId || isMulti ? " sel" : "") +
                  (w.del ? " del" : "");
                return (
                  <div
                    key={w.wid}
                    className={cls}
                    style={{ position: "relative", left: `${left}%`, width: `${width}%`, background: colorForIndex(w.gi) }}
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
                    <span className="bt">{w.text}</span>
                    {unlocked && (
                      <span
                        className="wt-handle r"
                        onPointerDown={(ev) => {
                          ev.stopPropagation();
                          handleBlockPointerDown(ev as unknown as React.PointerEvent<HTMLElement>, w, "end");
                        }}
                      />
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
