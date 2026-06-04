import { useEffect, useState } from "react";
import { projects } from "../../api/client";
import { Icon } from "../icons/Icon";
import logo from "../../assets/logo-mark.svg";
import { CreateProjectModal } from "./CreateProjectModal";

function ProjectThumb() {
  return (
    <div className="proj-thumb">
      <div className="scan" />
    </div>
  );
}

export function ProjectLibrary({ onOpen }: { onOpen: (name: string) => void }) {
  const [names, setNames] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void projects.list().then(setNames).catch(() => setNames([]));
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
          {names.map((name) => (
            <div key={name} className="proj" onClick={() => onOpen(name)}>
              <ProjectThumb />
              <div className="proj-meta">
                <div className="nm">{name}</div>
              </div>
            </div>
          ))}
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
