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
  onSelect: (wid: number) => void;
}

// Expanded cues timeline: one labelled lane per layout event, cue blocks
// positioned by time, with a single playhead spanning all lanes.
export function WordTrack({ words, events, dur, time, liveId, selId, onSelect }: WordTrackProps) {
  const progress = dur ? time / dur : 0;
  const lanes = (events ?? []).filter((ev) => words.some((w) => w.gi === ev.gi));

  return (
    <div className="wt">
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
                const left = (w.s / dur) * 100;
                const width = Math.max(0.4, ((w.e - w.s) / dur) * 100);
                const cls =
                  "block" +
                  (w.wid === liveId ? " live" : "") +
                  (w.wid === selId ? " sel" : "") +
                  (w.del ? " del" : "");
                return (
                  <div
                    key={w.wid}
                    className={cls}
                    style={{ left: `${left}%`, width: `${width}%`, background: colorForIndex(w.gi) }}
                    onClick={() => onSelect(w.wid)}
                    title={`${w.text} · ${w.s.toFixed(2)}–${w.e.toFixed(2)}s`}
                  >
                    <span className="bt">{w.text}</span>
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
