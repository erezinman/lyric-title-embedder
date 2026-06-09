import { useEffect, useState } from "react";
import { projects, type ProjectMeta } from "../../api/client";
import { Icon } from "../icons/Icon";
import logo from "../../assets/logo-mark.svg";
import { CreateProjectModal } from "./CreateProjectModal";

// "m:ss" for a duration in seconds (null → no pill).
function fmtDur(s: number | null): string | null {
  if (s == null || !isFinite(s) || s <= 0) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// "edited Xs/m/h/d/w ago" from an epoch-seconds mtime (null → no line).
function fmtEdited(modified: number | null): string | null {
  if (modified == null) return null;
  const sec = Math.max(0, Date.now() / 1000 - modified);
  const units: [number, string][] = [[604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]];
  for (const [size, label] of units) {
    if (sec >= size) return `edited ${Math.floor(sec / size)}${label} ago`;
  }
  return "edited just now";
}

function ProjectThumb({ caption, duration }: { caption: string[] | null; duration: string | null }) {
  return (
    <div className="proj-thumb">
      <div className="scan" />
      {caption && caption.length > 0 && (
        <div className="cap2">{caption[0]}{caption[1] != null && <><br /><b>{caption[1]}</b></>}</div>
      )}
      {duration && <span className="dur">{duration}</span>}
    </div>
  );
}

export function ProjectLibrary({ onOpen }: { onOpen: (name: string) => void }) {
  const [items, setItems] = useState<ProjectMeta[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void projects.list().then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <div className="lib">
      <div className="lib-top">
        <div className="brand">
          <img src={logo} alt="" style={{ width: 28, height: 28 }} />
          <span className="word">Karaoke Subtitle Studio</span>
          <span className="ver">v3</span>
        </div>
        <div className="flex" />
        <div className="lib-search"><Icon name="search" size={15} />Search projects…</div>
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} />New project</button>
      </div>
      <div className="lib-inner">
        <div className="lib-hero">
          <div>
            <h1 className="ks-h1">Your projects</h1>
            <p>Word-timed lyrics in, styled karaoke captions out. Pick up where you left off, or start something new.</p>
          </div>
        </div>
        <div className="lib-grid">
          <div className="proj new" onClick={() => setCreating(true)}>
            <div className="plus"><Icon name="plus" size={22} /></div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>New project</div>
            <div className="ks-small" style={{ color: "var(--text-3)" }}>Import lyrics + video</div>
          </div>
          {items.map((p) => {
            const edited = fmtEdited(p.modified);
            return (
              <div key={p.name} className="proj" onClick={() => onOpen(p.name)}>
                <ProjectThumb caption={p.caption} duration={fmtDur(p.duration_s)} />
                <div className="proj-meta">
                  <div className="nm">{p.name}</div>
                  {edited && <div className="sub">{edited}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {creating && (
        <CreateProjectModal
          onClose={() => setCreating(false)}
          onCreated={(name) => { setCreating(false); onOpen(name); }}
        />
      )}
    </div>
  );
}
