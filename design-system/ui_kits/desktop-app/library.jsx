// library.jsx — Project Library / recent-projects home screen.
const PROJECTS = [
  { id: "bleating", name: "Bleating Obsession", kind: "Suno track", dur: "2:42", preset: "Bounce", when: "edited 2h ago",
    cap: ["Caught in a", "bleating"], hot: "bleating" },
  { id: "midnight", name: "Midnight Drive", kind: "Reels", dur: "0:58", preset: "Glow", when: "edited yesterday",
    cap: ["Headlights", "blur"], hot: "blur" },
  { id: "sermon", name: "Neon Sermon", kind: "Music video", dur: "3:14", preset: "Pop", when: "edited 3d ago",
    cap: ["Preach it", "louder"], hot: "louder" },
  { id: "wool", name: "Wool & Static", kind: "Shorts", dur: "0:42", preset: "Typewriter", when: "edited 5d ago",
    cap: ["Tangled in", "static"], hot: "static" },
  { id: "freq", name: "Tangled Frequencies", kind: "Podcast clip", dur: "1:20", preset: "Bounce", when: "edited 1w ago",
    cap: ["On the same", "frequency"], hot: "frequency" },
];

function ProjectThumb({ p }) {
  return (
    <div className="proj-thumb">
      <div className="scan" />
      <div className="cap2">{p.cap[0]}<br /><b>{p.cap[1]}</b></div>
      <span className="dur">{p.dur}</span>
    </div>
  );
}

function ProjectLibrary({ onOpen }) {
  return (
    <div className="lib">
      <div className="lib-top">
        <div className="brand">
          <img src="../../assets/logo-mark.svg" alt="" style={{ width: 28, height: 28 }} />
          <span className="word">Karaoke Subtitle Studio</span>
          <span className="ver">v3</span>
        </div>
        <div className="flex" />
        <div className="lib-search"><Icon name="search" size={15} />Search projects…</div>
        <button className="btn primary" onClick={() => onOpen("bleating")}><Icon name="plus" size={15} />New project</button>
      </div>
      <div className="lib-inner">
        <div className="lib-hero">
          <div>
            <h1 className="ks-h1">Your projects</h1>
            <p>Word-timed lyrics in, styled karaoke captions out. Pick up where you left off, or start something new.</p>
          </div>
        </div>
        <div className="lib-grid">
          <div className="proj new" onClick={() => onOpen("bleating")}>
            <div className="plus"><Icon name="plus" size={22} /></div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>New project</div>
            <div className="ks-small" style={{ color: "var(--text-3)" }}>Import lyrics + video</div>
          </div>
          {PROJECTS.map(p => (
            <div key={p.id} className="proj" onClick={() => onOpen(p.id)}>
              <ProjectThumb p={p} />
              <div className="proj-meta">
                <div className="nm">{p.name}</div>
                <div className="sub"><span className="badge">{p.preset}</span>{p.kind} · {p.when}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ProjectLibrary, PROJECTS });
