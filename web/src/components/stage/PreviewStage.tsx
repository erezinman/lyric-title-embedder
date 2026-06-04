import { useRef, useState, useCallback, useEffect } from "react";
import { getFrameUrl } from "../../api/client";
import { boxFromState, marginsFromBox, anchorXY, applyMove, applyResize } from "../../model/bbox";
import type { Box, PlacementState } from "../../model/bbox";

export interface CapWord {
  wid: number;
  text: string;
  live: boolean;
  pending: boolean;
  sel: boolean;
  fill: string | null;
}

interface PreviewStageProps {
  capWords: CapWord[];
  time: number;
  mode: "live" | "exact";
  onMode: (m: "live" | "exact") => void;
  onRenderExact: () => void;
  onSelectWord: (wid: number) => void;
  playW?: number;
  playH?: number;
  placement: PlacementState;
  onPlacement: (partial: Record<string, unknown>) => void;
}

interface DragState {
  start: Box;
  mode: string; // "move" | handle
  x0: number;
  y0: number;
  moved: boolean;
  cancelled: boolean;
}

export function PreviewStage({
  capWords, time, mode, onMode, onRenderExact, onSelectWord, playW, playH,
  placement, onPlacement,
}: PreviewStageProps) {
  const [preview, setPreview] = useState<Box | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const box = preview ?? boxFromState(placement);
  const W = placement.play_w || 1920, H = placement.play_h || 1080;
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const boxStyle: React.CSSProperties = {
    left: pct(box.l, W), top: pct(box.t, H),
    width: pct(box.r - box.l, W), height: pct(box.b - box.t, H),
    right: "auto", bottom: "auto",
  };

  // Keep latest props in refs so stable callbacks always see current values
  const placementRef = useRef(placement);
  placementRef.current = placement;
  const onPlacementRef = useRef(onPlacement);
  onPlacementRef.current = onPlacement;

  const dragRef = useRef<DragState | null>(null);
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
    window.removeEventListener("pointercancel", handlersRef.current.pointercancel);
    handlersRef.current = null;
  }, []);

  // Clean up window listeners if component unmounts mid-drag
  useEffect(() => {
    return () => removeListeners();
  }, [removeListeners]);

  const start = useCallback((e: React.PointerEvent<HTMLElement>, m: string) => {
    e.preventDefault();
    const pl = placementRef.current;
    const Wc = pl.play_w || 1920, Hc = pl.play_h || 1080;
    const startBox = boxFromState(pl);
    const drag: DragState = {
      start: startBox, mode: m, x0: e.clientX, y0: e.clientY,
      moved: false, cancelled: false,
    };
    dragRef.current = drag;
    setPreview(startBox);

    const compute = (e2: { clientX: number; clientY: number }): Box => {
      const d = dragRef.current!;
      const scale = (stageRef.current?.getBoundingClientRect().width || Wc) / Wc;
      const dx = (e2.clientX - d.x0) / scale;
      const dy = (e2.clientY - d.y0) / scale;
      return d.mode === "move"
        ? applyMove(d.start, dx, dy, Wc, Hc)
        : applyResize(d.start, d.mode, dx, dy, Wc, Hc);
    };

    const onPointermove = (e2: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.cancelled) return;
      if (Math.abs(e2.clientX - d.x0) >= 3 || Math.abs(e2.clientY - d.y0) >= 3) d.moved = true;
      setPreview(compute(e2));
    };

    const onPointerup = (e2: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.moved && !d.cancelled) {
        const final = compute(e2);
        const pl2 = placementRef.current;
        if (pl2.pos != null) {
          onPlacementRef.current({ pos: anchorXY(final, pl2.align) });
        } else {
          onPlacementRef.current(marginsFromBox(final, pl2));
        }
      }
      dragRef.current = null;
      setPreview(null);
      removeListeners();
    };

    const onKeydown = (e2: KeyboardEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (e2.key === "Escape") {
        e2.stopImmediatePropagation();
        d.cancelled = true;
        dragRef.current = null;
        setPreview(null);
        removeListeners();
      }
    };

    const onPointercancel = () => {
      dragRef.current = null;
      setPreview(null);
      removeListeners();
    };

    handlersRef.current = { pointermove: onPointermove, pointerup: onPointerup, keydown: onKeydown, pointercancel: onPointercancel };
    window.addEventListener("pointermove", onPointermove);
    window.addEventListener("pointerup", onPointerup);
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("pointercancel", onPointercancel);
  }, [removeListeners]);

  return (
    <div className="stage-col">
      <div className="stage-mode-bar">
        <button
          className={"seg-btn" + (mode === "live" ? " active" : "")}
          onClick={() => onMode("live")}
        >
          Live
        </button>
        <button
          className={"seg-btn" + (mode === "exact" ? " active" : "")}
          onClick={() => onMode("exact")}
        >
          Exact
        </button>
      </div>
      <div className="stage" ref={stageRef}>
        <div className="scan" />
        <div className="tag">{playW ?? 1920} × {playH ?? 1080} · 24fps</div>
        {mode === "live" ? (
          <>
            <div className="live-badge"><span className="pulse" />LIVE</div>
            <div className="cap">
              <div>
                {capWords.map((w) => {
                  const cls =
                    "w" +
                    (w.live ? " live" : "") +
                    (w.pending ? " pending" : "") +
                    (w.sel ? " sel" : "");
                  return (
                    <span
                      key={w.wid}
                      className={cls}
                      style={w.fill ? { color: w.fill } : undefined}
                      onClick={() => onSelectWord(w.wid)}
                    >
                      {w.text}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="approx-badge">CSS approx</div>
          </>
        ) : (
          <>
            <div className="libass-badge">libass</div>
            <img src={getFrameUrl(time)} alt="frame" />
            <button className="btn sm" onClick={onRenderExact}>
              Render exact frame @ t
            </button>
          </>
        )}
        <div
          className={"bbox live" + (preview ? " dragging" : "")}
          style={boxStyle}
          onPointerDown={(e) => start(e, "move")}
        >
          {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => (
            <i key={h} className={h} onPointerDown={(e) => { e.stopPropagation(); start(e, h); }} />
          ))}
        </div>
      </div>
      <div className="stage-help">
        Drag inside the box to <b>move</b> · drag a handle to <b>resize</b> · click a word to edit its bounds &amp; effects.
      </div>
    </div>
  );
}
