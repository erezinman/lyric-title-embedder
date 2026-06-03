import { colorForIndex } from "../../model/palette";

export interface TrackWord {
  wid: number;
  text: string;
  s: number;
  e: number;
  gi: number;
  del?: boolean;
  frac?: boolean;
}

interface WordTrackProps {
  words: TrackWord[];
  dur: number;
  time: number;
  liveId: number | null;
  selId: number | null;
  onSelect: (wid: number) => void;
}

export function WordTrack({ words, dur, time, liveId, selId, onSelect }: WordTrackProps) {
  const progress = dur ? time / dur : 0;
  return (
    <div className="track">
      {words.map((w) => {
        const left = (w.s / dur) * 100;
        const width = ((w.e - w.s) / dur) * 100;
        const cls =
          "block" +
          (w.wid === liveId ? " live" : "") +
          (w.wid === selId ? " sel" : "") +
          (w.del ? " del" : "") +
          (w.frac ? " frac" : "");
        return (
          <div
            key={w.wid}
            className={cls}
            style={{ left: `${left}%`, width: `${width}%`, background: colorForIndex(w.gi) }}
            onClick={() => onSelect(w.wid)}
            title={`${w.text} · ${w.s.toFixed(2)}–${w.e.toFixed(2)}s`}
          >
            <span className="fade in" />
            <span style={{ padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis" }}>{w.text}</span>
            <span className="fade out" />
          </div>
        );
      })}
      <div className="playhead" style={{ left: `${progress * 100}%` }} />
    </div>
  );
}
