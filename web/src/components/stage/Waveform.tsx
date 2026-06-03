import { fmt } from "../TopBar";

const WAVE_BARS = [12,18,28,22,38,46,34,54,66,50,36,26,42,60,74,56,40,48,64,52,32,22,38,54,68,84,62,46,34,26,42,58,72,54,36,24,18,30,46,60,48,34,26,20,36,52,66,54,40,30,22,34,48,62,40,28];

interface WaveformProps {
  dur: number;
  time: number;
  onSeek: (t: number) => void;
  height?: number;
  ruler?: boolean;
}

export function Waveform({ dur, time, onSeek, height = 56, ruler = true }: WaveformProps) {
  const progress = dur ? time / dur : 0;
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur);
  };
  const marks = Array.from({ length: 6 }, (_, i) => fmt((dur / 5) * i).replace(/\.\d+$/, ""));
  return (
    <div className="wave-wrap">
      {ruler && <div className="ruler">{marks.map((m, i) => <span key={i}>{m}</span>)}</div>}
      <div className="wave" style={{ height }} onClick={seek}>
        {WAVE_BARS.map((b, i) => {
          const on = (i / WAVE_BARS.length) <= progress;
          return <span key={i} className={"bar" + (on ? " on" : "")} style={{ height: `${b}%` }} />;
        })}
        <div className="playhead" style={{ left: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
