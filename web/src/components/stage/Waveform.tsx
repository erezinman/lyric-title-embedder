import { fmt } from "../TopBar";

interface WaveformProps {
  dur: number;
  time: number;
  onSeek: (t: number) => void;
}

// Honest time ruler — the engine has no audio source, so there is no real
// waveform to draw. This is a plain scrubbable time axis (ticks + timestamps).
function tickStep(dur: number): number {
  const target = dur / 10; // aim for ~10 labelled ticks
  const steps = [5, 10, 15, 20, 30, 60, 120, 300, 600];
  return steps.find((s) => s >= target) ?? 600;
}

export function Waveform({ dur, time, onSeek }: WaveformProps) {
  const progress = dur ? time / dur : 0;
  const step = tickStep(dur);
  const ticks: number[] = [];
  for (let t = 0; t <= dur + 0.001; t += step) ticks.push(t);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur);
  };

  return (
    <div className="ruler-row">
      <div className="tl-gutter" />
      <div className="ruler-track" onClick={seek}>
        {ticks.map((t) => (
          <div key={t} className="tk" style={{ left: `${(t / dur) * 100}%` }}>
            <span className="tk-label">{fmt(t).replace(/\.\d+$/, "")}</span>
          </div>
        ))}
        <div className="playhead" style={{ left: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
