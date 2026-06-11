import { useState, useCallback } from "react";
import logo from "../assets/logo-mark.svg";
import { Icon } from "./icons/Icon";
import { getConnect } from "../api/client";
import type { ConnectInfo } from "../api/client";

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
  aiConnected: boolean;
  exportOpen?: boolean;
  flash?: "undo" | "redo" | null;
  onPlay: () => void;
  onSeekRel: (d: number) => void;
  onHome: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

// ---- click-to-copy with a jsdom-safe fallback ----
function copyText(text: string): void {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* fall through */ }
  // jsdom / insecure-context fallback: no clipboard API → best-effort, swallow.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand?.("copy");
    document.body.removeChild(ta);
  } catch { /* nothing else to do */ }
}

// ---- AI presence pill + MCP-connect popover ----
function AiPill() {
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Fetch /api/connect lazily on first hover, then cache for the component's life.
  const loadOnHover = useCallback(() => {
    if (info) return;
    getConnect().then(setInfo).catch(() => { /* daemon hiccup — popover just stays sparse */ });
  }, [info]);

  const copy = (text: string, key: string) => {
    copyText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1300);
  };

  // Rows: label / displayed value / value-to-copy. Auth row only when a token is configured.
  const rows: { key: string; show: string; copy: string }[] = info
    ? [
        { key: "Host", show: info.host, copy: info.host },
        { key: "Port", show: String(info.port), copy: String(info.port) },
        { key: "MCP", show: info.mcp_url, copy: info.mcp_url },
        { key: "WebSocket", show: info.ws_url, copy: info.ws_url },
        { key: "API", show: `POST ${info.api_url}`, copy: info.api_url },
        ...(info.token_required
          ? [{ key: "Auth", show: "Bearer ••••••", copy: "Bearer $KSS_MCP_TOKEN" }]
          : []),
      ]
    : [];

  const cfg = info
    ? JSON.stringify(
        {
          mcpServers: {
            "karaoke-subtitle-studio": {
              url: info.mcp_url,
              ...(info.token_required
                ? { headers: { Authorization: "Bearer $KSS_MCP_TOKEN" } }
                : {}),
            },
          },
        },
        null,
        2,
      )
    : "";

  return (
    <span className="ai-pill-wrap" onMouseEnter={loadOnHover}>
      {/* Honest pill: the daemon exposes an MCP endpoint, but the web/daemon has no
          signal that an *agent* is actually connected — so we don't claim "· live".
          (A real "agent connected" indicator would need a small daemon-side signal.) */}
      <span className="ai-pill"><span className="ai-dot" />AI agent</span>
      <div className="ai-pop" aria-label="MCP connection">
        <div className="ai-pop-h"><span className="ai-dot" />MCP endpoint · available</div>
        {rows.map((r) => (
          <button key={r.key} className="ai-pop-row" onClick={() => copy(r.copy, r.key)} title={"Copy " + r.copy}>
            <span>{r.key}</span><b>{copied === r.key ? "Copied ✓" : r.show}</b>
          </button>
        ))}
        <button className="ai-pop-copy" onClick={() => copy(cfg, "cfg")} disabled={!info}>
          <Icon name="download" size={12} />{copied === "cfg" ? "Copied ✓" : "Copy agent config (JSON)"}
        </button>
        <p className="ai-pop-note">Loopback bind only · CORS: 127.0.0.1:5173 and localhost:5173</p>
      </div>
    </span>
  );
}

export function TopBar(props: TopBarProps) {
  const { project, time, dur, playing, aiConnected, exportOpen, flash,
          onPlay, onSeekRel, onHome, onExport, onUndo, onRedo, canUndo, canRedo } = props;
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
      {aiConnected && <AiPill />}
      <button className={"btn ghost sm" + (flash === "undo" ? " pressed" : "")} title="Undo" aria-keyshortcuts="Control+Z Meta+Z" onClick={onUndo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : .4 }}><Icon name="undo" size={15} /></button>
      <button className={"btn ghost sm" + (flash === "redo" ? " pressed" : "")} title="Redo" aria-keyshortcuts="Control+Shift+Z Control+Y" onClick={onRedo} disabled={!canRedo} style={{ opacity: canRedo ? 1 : .4 }}><Icon name="redo" size={15} /></button>
      <button className={"btn primary" + (exportOpen ? " on" : "")} onClick={onExport}><Icon name="download" size={15} />Export</button>
    </div>
  );
}
