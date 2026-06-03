import logo from "../assets/logo-mark.svg";
import { Icon } from "./icons/Icon";

export function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

interface TopBarProps {
  project: string;
  time: number;
  dur: number;
  playing: boolean;
  onPlay: () => void;
  onSeekRel: (d: number) => void;
  onHome: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function TopBar(props: TopBarProps) {
  const { project, time, dur, playing, onPlay, onSeekRel, onHome, onExport, onUndo, onRedo, canUndo, canRedo } = props;
  return (
    <div className="topbar">
      <div className="brand" onClick={onHome} title="Back to projects">
        <img src={logo} alt="" />
        <span className="word">Karaoke Subtitle Studio</span>
        <span className="ver">v3</span>
      </div>
      <div className="crumb"><Icon name="chevDown" size={14} /><b>{project}</b></div>
      <div className="flex" />
      <div className="transport">
        <button className="tbtn" onClick={() => onSeekRel(-2)}><Icon name="skipBack" size={16} /></button>
        <button className="tbtn play" onClick={onPlay}><Icon name={playing ? "pause" : "play"} size={18} /></button>
        <button className="tbtn" onClick={() => onSeekRel(2)}><Icon name="skipFwd" size={16} /></button>
        <span className="time">{fmt(time)}<span className="d"> / {fmt(dur)}</span></span>
      </div>
      <div className="flex" />
      <button className="btn ghost sm" title="Undo" onClick={onUndo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : .4 }}><Icon name="undo" size={15} /></button>
      <button className="btn ghost sm" title="Redo" onClick={onRedo} disabled={!canRedo} style={{ opacity: canRedo ? 1 : .4 }}><Icon name="redo" size={15} /></button>
      <button className="btn primary" onClick={onExport}><Icon name="download" size={15} />Export</button>
    </div>
  );
}
