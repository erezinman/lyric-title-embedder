import { useRef, useState, useCallback, useEffect } from "react";
import { getFrameUrl } from "../../api/client";
import { initJassub, type JassubClient } from "../../preview/jassubClient";
import { boxFromState, marginsFromBox, anchorXY, applyMove, applyResize, posActive, alignRow, alignCol } from "../../model/bbox";
import type { Box, PlacementState } from "../../model/bbox";

// Live preview renders the real .ass via jassub (libass-in-wasm). Disable with
// VITE_JASSUB=0 (tests/e2e that don't want wasm). Default ON.
const JASS = import.meta.env.VITE_JASSUB !== "0";
const FONT_URL = "/api/font";

export interface CapWord {
  wid: number;
  li: number;
  text: string;
  live: boolean;
  pending: boolean;
  sel: boolean;
  fill: string | null;
  scale: number;          // resolved fontsize / global fontsize (1 = inherit)
  bold: boolean | null;   // resolved bold when it differs from global, else null
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
  /** The current .ass text (fetched by the Editor on every state change); fed to
   *  jassub via setTrack. When provided AND the feature flag is on, the live mode
   *  renders the real .ass and the DOM caption layer becomes a transparent overlay. */
  assText?: string | null;
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
  placement, onPlacement, assText,
}: PreviewStageProps) {
  const [preview, setPreview] = useState<Box | null>(null);
  const [readout, setReadout] = useState<{ x: number; y: number } | null>(null);
  // Visual band height (canvas px), session-local. The model only persists the
  // anchored margin; without this, resizing the non-anchored edge would snap
  // back to the default 18% band as soon as the placement push lands.
  const [bandH, setBandH] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const pinned = posActive(placement);
  const W = placement.play_w || 1920, H = placement.play_h || 1080;

  // ── jassub live renderer ──────────────────────────────────────────────────
  // Active only in live mode with the flag on. The canvas renders the real .ass;
  // the DOM caption layer is demoted to a transparent hit-test/selection overlay.
  const jassActive = JASS && mode === "live";
  const jassCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const jassRef = useRef<JassubClient | null>(null);
  const lastTrackRef = useRef<string | null>(null);

  // init / dispose with the canvas lifecycle
  const disposeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!jassActive) return;
    const canvas = jassCanvasRef.current;
    if (!canvas) return;
    // A pending dispose from a just-torn-down effect (React 18 StrictMode runs
    // mount→unmount→mount synchronously) — cancel it and reuse the live worker.
    if (disposeTimer.current) { clearTimeout(disposeTimer.current); disposeTimer.current = null; }
    // Size the canvas BEFORE jassub transfers control to its offscreen worker.
    // After transfer, setting width/height throws — guard so a StrictMode re-run
    // (or any re-run) can't crash on an already-transferred canvas.
    try { canvas.width = W; canvas.height = H; } catch { /* already transferred */ }
    const client = initJassub(canvas, FONT_URL, "DejaVu Sans", assText ?? undefined as unknown as string);
    jassRef.current = client;
    lastTrackRef.current = assText ?? null;
    // expose for e2e pixel sampling / latency probes (harmless in prod)
    (window as unknown as { __jassub?: JassubClient }).__jassub = client;
    return () => {
      // Defer the teardown a tick: in StrictMode the effect immediately re-mounts
      // and cancels this, keeping the same worker (the canvas can't be reused
      // after transferControlToOffscreen, so we must NOT destroy+recreate it).
      disposeTimer.current = setTimeout(() => {
        client.dispose();
        if (jassRef.current === client) jassRef.current = null;
        lastTrackRef.current = null;
        delete (window as unknown as { __jassub?: JassubClient }).__jassub;
        disposeTimer.current = null;
      }, 0);
    };
    // re-init only when the canvas mounts/unmounts or play dims change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jassActive, W, H]);

  // push new .ass on every state change (Editor debounces the fetch)
  useEffect(() => {
    if (!jassActive || !jassRef.current || assText == null) return;
    if (assText === lastTrackRef.current) return;
    lastTrackRef.current = assText;
    jassRef.current.setTrack(assText).catch(() => { /* worker race on unmount */ });
  }, [jassActive, assText]);

  // drive the frame clock from the playback time / scrub
  useEffect(() => {
    if (!jassActive || !jassRef.current) return;
    jassRef.current.setTime(time).catch(() => { /* unmount race */ });
  }, [jassActive, time]);

  const applyBandH = useCallback((b: Box, pl: PlacementState, bh: number | null): Box => {
    if (bh == null || posActive(pl)) return b;
    const Hc = pl.play_h || 1080;
    const row = alignRow(pl.align);
    if (row === "bottom") return { ...b, t: Math.max(0, b.b - bh) };
    if (row === "top") return { ...b, b: Math.min(Hc, b.t + bh) };
    const c = (b.t + b.b) / 2;
    return { ...b, t: Math.max(0, c - bh / 2), b: Math.min(Hc, c + bh / 2) };
  }, []);
  const bandHRef = useRef(bandH);
  bandHRef.current = bandH;
  const applyBandHRef = useRef(applyBandH);
  applyBandHRef.current = applyBandH;

  const box = preview ?? applyBandH(boxFromState(placement), placement, bandH);
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const boxStyle: React.CSSProperties = {
    left: pct(box.l, W), top: pct(box.t, H),
    width: pct(box.r - box.l, W), height: pct(box.b - box.t, H),
    right: "auto", bottom: "auto",
  };
  const [ax, ay] = anchorXY(box, placement.align);
  const pinStyle: React.CSSProperties = { left: pct(ax, W), top: pct(ay, H) };

  // The live caption tracks the SAME box the bbox/pin renders (preview during a
  // drag), so the text moves with the drag and lands where libass will put it.
  const capCol = alignCol(placement.align);
  const capRow = alignRow(placement.align);
  const capStyle: React.CSSProperties = {
    left: pct(box.l, W), width: pct(box.r - box.l, W), right: "auto", padding: 0,
    alignItems: capCol === "left" ? "flex-start" : capCol === "right" ? "flex-end" : "center",
    ...(capRow === "bottom"
      ? { top: "auto", bottom: pct(H - box.b, H) }
      : capRow === "top"
        ? { bottom: "auto", top: pct(box.t, H) }
        : { bottom: "auto", top: pct((box.t + box.b) / 2, H), transform: "translateY(-50%)" }),
  };
  const capInnerStyle: React.CSSProperties = {
    justifyContent: capCol === "left" ? "flex-start" : capCol === "right" ? "flex-end" : "center",
  };
  const readoutText = pinned
    ? `pos ${ax}, ${ay}`
    : (() => { const m = marginsFromBox(box, placement);
        return `L ${m.margin_l} · R ${m.margin_r} · V ${m.margin_v}`; })();

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
    const startBox = applyBandHRef.current(boxFromState(pl), pl, bandHRef.current);
    const drag: DragState = {
      start: startBox, mode: m, x0: e.clientX, y0: e.clientY,
      moved: false, cancelled: false,
    };
    dragRef.current = drag;
    setPreview(startBox);
    setReadout({ x: e.clientX, y: e.clientY });

    const compute = (e2: { clientX: number; clientY: number; shiftKey?: boolean }): Box => {
      const d = dragRef.current!;
      const scale = (stageRef.current?.getBoundingClientRect().width || Wc) / Wc;
      const dx = (e2.clientX - d.x0) / scale;
      const dy = (e2.clientY - d.y0) / scale;
      // Q2: Shift held during a handle resize = symmetric (both opposing margins
      // share one delta, center fixed). Read live so toggling Shift mid-drag works.
      return d.mode === "move"
        ? applyMove(d.start, dx, dy, Wc, Hc)
        : applyResize(d.start, d.mode, dx, dy, Wc, Hc, 40, !!e2.shiftKey);
    };

    const onPointermove = (e2: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.cancelled) return;
      if (Math.abs(e2.clientX - d.x0) >= 3 || Math.abs(e2.clientY - d.y0) >= 3) d.moved = true;
      setPreview(compute(e2));
      setReadout({ x: e2.clientX, y: e2.clientY });
    };

    const onPointerup = (e2: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.moved && !d.cancelled) {
        const final = compute(e2);
        const pl2 = placementRef.current;
        if (posActive(pl2)) {
          onPlacementRef.current({ pos: anchorXY(final, pl2.align) });
        } else {
          // remember the visual band height so the box doesn't snap back to the
          // default band when the committed placement re-derives it
          setBandH(final.b - final.t);
          onPlacementRef.current(marginsFromBox(final, pl2));
        }
      }
      dragRef.current = null;
      setPreview(null);
      setReadout(null);
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
        setReadout(null);
        removeListeners();
      }
    };

    const onPointercancel = () => {
      dragRef.current = null;
      setPreview(null);
      setReadout(null);
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
      <div className={"stage" + (preview ? " dragging" : "")} ref={stageRef}>
        <div className="scan" />
        <div className="tag">{playW ?? 1920} × {playH ?? 1080} · 24fps</div>
        {mode === "live" ? (
          <>
            <div className="live-badge"><span className="pulse" />LIVE</div>
            {/* No width/height attrs: jassub transfers control to an offscreen
                canvas in its constructor; setting w/h afterwards throws. The
                init effect sizes it ONCE before construction. */}
            {jassActive && (
              <canvas key={`${W}x${H}`} ref={jassCanvasRef} className="jass-canvas" />
            )}
            <div className={"cap" + (jassActive ? " jass-overlay" : "")} style={capStyle}>
              {[...new Set(capWords.map((w) => w.li))].sort((a, b) => a - b).map((li) => (
              <div key={li} style={capInnerStyle}>
                {capWords.filter((w) => w.li === li).map((w) => {
                  const cls =
                    "w" +
                    (w.live ? " live" : "") +
                    (w.pending ? " pending" : "") +
                    (w.sel ? " sel" : "");
                  return (
                    <span
                      key={w.wid}
                      className={cls}
                      style={{
                        ...(w.fill ? { color: w.fill } : null),
                        ...(w.scale !== 1 ? { fontSize: `${w.scale}em` } : null),
                        ...(w.bold != null ? { fontWeight: w.bold ? 700 : 400 } : null),
                      }}
                      onClick={() => onSelectWord(w.wid)}
                    >
                      {w.text}
                    </span>
                  );
                })}
              </div>
              ))}
            </div>
            <div className="approx-badge">{jassActive ? "libass · wasm" : "CSS approx"}</div>
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
        {pinned ? (
          <div
            className={"pinbox" + (preview ? " dragging" : "")}
            style={pinStyle}
            onPointerDown={(e) => start(e, "move")}
          >
            <span className="pin-cross" />
            <span className="pin-dot" />
            <span className="pin-tag">\pos</span>
          </div>
        ) : (
          <div
            className={"bbox live" + (preview ? " dragging" : "")}
            style={boxStyle}
            onPointerDown={(e) => start(e, "move")}
          >
            {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => (
              <i key={h} className={h + " mh"} onPointerDown={(e) => { e.stopPropagation(); start(e, h); }} />
            ))}
            <span className="bbox-tag">margins</span>
          </div>
        )}
      </div>
      {readout && (
        <div className="drag-readout" style={{ left: readout.x + 16, top: readout.y + 16 }}>
          {readoutText}
        </div>
      )}
      <div className="stage-help">
        {pinned ? (
          <span>Drag the <b>pin</b> to set the <span className="mono">\pos</span> anchor · <b>Esc</b> cancels. Switch off free placement to edit margins.</span>
        ) : (
          <span>Drag inside the box to <b>move</b> · drag a handle to adjust <b>margins</b> · <b>Esc</b> cancels.</span>
        )}
      </div>
    </div>
  );
}
