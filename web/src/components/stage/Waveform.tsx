import { useRef, useState } from "react";
import { fmt } from "../TopBar";
import { collectTargets, snap, type NearLine, type SnapTarget } from "../../model/snap";

interface WaveformProps {
  dur: number;
  time: number;
  onSeek: (t: number) => void;
  // ── §4 draggable playhead snapping (optional) ──
  /** word blocks whose edges the playhead can snap to. */
  blocks?: { wid: number; s: number; e: number }[];
  /** event/group boundary spans the playhead can snap to. */
  eventBounds?: { s: number; e: number }[];
  /** magnet on? (default true when blocks/eventBounds supplied). Alt inverts. */
  magnet?: boolean;
}

// Honest time ruler — the engine has no audio source, so there is no real
// waveform to draw. This is a plain scrubbable time axis (ticks + timestamps).
function tickStep(dur: number): number {
  const target = dur / 10; // aim for ~10 labelled ticks
  const steps = [5, 10, 15, 20, 30, 60, 120, 300, 600];
  return steps.find((s) => s >= target) ?? 600;
}

interface SnapViz {
  hit: SnapTarget | null;
  near: NearLine[];
}

export function Waveform({ dur, time, onSeek, blocks, eventBounds, magnet = true }: WaveformProps) {
  const progress = dur ? time / dur : 0;
  const step = tickStep(dur);
  const ticks: number[] = [];
  for (let t = 0; t <= dur + 0.001; t += step) ticks.push(t);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [snapViz, setSnapViz] = useState<SnapViz | null>(null);
  const draggingRef = useRef(false);

  const canSnap = !!(blocks?.length || eventBounds?.length);

  // map a clientX → seconds, optionally magnet-snapped; updates the guide viz.
  const scrubTo = (clientX: number, altHeld: boolean, live: boolean): number => {
    const r = (trackRef.current ?? null)?.getBoundingClientRect();
    if (!r) return 0;
    const pxPerSec = r.width / dur;
    const raw = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur;
    if (!canSnap) {
      if (live) setSnapViz(null);
      return raw;
    }
    const targets = collectTargets(
      blocks ?? [],
      time,
      eventBounds ?? [],
      { start: 0, end: dur },
      undefined,
      false, // don't snap the playhead to itself
    );
    const s = snap(raw, targets, pxPerSec, { enabled: magnet, altHeld });
    if (live) setSnapViz(magnet !== altHeld ? { hit: s.target, near: s.nearLines } : null);
    return s.sec;
  };

  // click-seek (kept for the keyboard-free, no-drag path + audit tests)
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingRef.current) return; // a drag already handled this gesture
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur);
  };

  // drag-to-scrub: pointerdown seeks immediately, moves keep scrubbing, up clears.
  const beginScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    document.body.classList.add("tl-drag");
    onSeek(scrubTo(e.clientX, e.altKey, true));
    const move = (ev: PointerEvent) => onSeek(scrubTo(ev.clientX, ev.altKey, true));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("tl-drag");
      setSnapViz(null);
      // allow the trailing synthetic click (if any) to be ignored, then reset
      setTimeout(() => { draggingRef.current = false; }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="ruler-row">
      <div className="tl-gutter" />
      <div className="ruler-track" ref={trackRef} onClick={seek} onPointerDown={beginScrub}>
        {ticks.map((t) => (
          <div key={t} className="tk" style={{ left: `${(t / dur) * 100}%` }}>
            <span className="tk-label">{fmt(t).replace(/\.\d+$/, "")}</span>
          </div>
        ))}
        {snapViz && (
          <>
            {snapViz.near.map((n) => {
              if (snapViz.hit && Math.abs(n.sec - snapViz.hit.sec) < 1e-3) return null;
              return (
                <div
                  key={`near-${n.sec.toFixed(4)}`}
                  className="snap-guide near"
                  style={{ left: `${(n.sec / dur) * 100}%`, opacity: (0.15 + n.opacity * 0.45).toFixed(3) }}
                />
              );
            })}
            {snapViz.hit && (
              <div
                className={"snap-guide" + (snapViz.hit.kind === "playhead" ? " k-playhead" : "")}
                style={{ left: `${(snapViz.hit.sec / dur) * 100}%` }}
              >
                <span className="sg-tag">{snapViz.hit.sec.toFixed(2)}s</span>
              </div>
            )}
          </>
        )}
        <div className="playhead tl-through" style={{ left: `${progress * 100}%` }}>
          <i className="ph-hit" />
          <i className="ph-head" />
        </div>
      </div>
    </div>
  );
}
