// panels.jsx — ControlsRail, CueEditor (text + start/stop bounds), Inspector
// (global→group→word waterfall), CueLanes (groups → words), CueToolbar.
const PRESETS = ["Karaoke Bounce", "Pop", "Glow", "Typewriter"];

function ControlsRail({ preset, onPreset }) {
  return (
    <div>
      <div className="sec-t"><Icon name="film" size={13} />Source &amp; output</div>
      <div className="ctl"><label>Lyrics</label><div className="text-inp" style={{ maxWidth: 168 }}><span className="path">bleating_obsession.json</span></div></div>
      <div className="ctl"><label>Video</label><div className="text-inp" style={{ maxWidth: 168 }}><span className="path">bleating_master.mp4</span></div></div>

      <div className="sec-t spacer"><Icon name="type" size={13} />Style</div>
      <div className="ctl"><label>Font</label><Combo value="Space Grotesk" /></div>
      <div className="ctl"><label>Size</label><Stepper value="64" /></div>
      <div className="ctl"><label>Alignment</label><Select value="Bottom-Center" /></div>
      <div className="ctl"><label>Bold</label><Toggle on={true} /></div>
      <div className="ctl"><label>Text / Outline / Box</label><Swatches colors={["#FFFFFF", "#000000", "var(--accent)"]} /></div>

      <div className="sec-t spacer"><Icon name="sparkles" size={13} />Animation preset</div>
      <div className="chips">
        {PRESETS.map(p => <Chip key={p} on={p === preset} onClick={() => onPreset(p)}>{p}</Chip>)}
        <Chip ghost>+ New</Chip>
      </div>
      <p className="wf-note" style={{ textAlign: "left", marginTop: 12, lineHeight: 1.5 }}>
        Applies to the current selection — a <b>word</b>, a group, or the whole project. More specific wins.
      </p>
    </div>
  );
}

function Field({ label, value, src, swatch }) {
  return (
    <div className="field">
      <span className="l">{label}</span>
      <span className={"v " + (src || "")}>{swatch && <i style={{ background: value }} />}{value}</span>
    </div>
  );
}

function BoundStep({ value, onNudge }) {
  return (
    <div className="bound-step">
      <span className="pm" onClick={() => onNudge(-0.05)}>−</span>
      <span className="v">{value.toFixed(2)}s</span>
      <span className="pm" onClick={() => onNudge(0.05)}>+</span>
    </div>
  );
}

function CueEditor({ word, group, onText, onNudge, onToggleDel, onSplit }) {
  const [text, setText] = React.useState(word.text);
  React.useEffect(() => { setText(word.text); }, [word.id, word.text]);
  const commit = () => { if (text !== word.text) onText(word.id, text); };
  return (
    <div className="tier word" style={{ marginBottom: 12 }}>
      <div className="tier-h">
        <span className="tier-tag word">CUE</span>Word
        <span className="meta">{group.solo ? "solo cue" : "in " + group.label}</span>
      </div>
      <div className="cue-row">
        <span className="l">Text</span>
        <input className="cue-input" value={text} onChange={e => setText(e.target.value)}
          onBlur={commit} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} />
      </div>
      <div className="cue-row"><span className="l">Start</span><BoundStep value={word.s} onNudge={(d) => onNudge(word.id, d, 0)} /></div>
      <div className="cue-row"><span className="l">Stop</span><BoundStep value={word.e} onNudge={(d) => onNudge(word.id, 0, d)} /></div>
      <div className="cue-row"><span className="l">Duration</span><span className="v">{(word.e - word.s).toFixed(2)}s</span></div>
      <div className="cue-acts">
        <button className="minibtn" onClick={() => onSplit(word.id)}><Icon name="scissors" size={13} />Split (fraction)</button>
        <button className="minibtn" onClick={() => onToggleDel(word.id)}>
          <Icon name={word.del ? "undo" : "close"} size={13} />{word.del ? "Restore" : "Delete"}
        </button>
      </div>
    </div>
  );
}

function Inspector({ selection, groups, allWords, preset, onText, onNudge, onToggleDel, onSplit }) {
  const w = selection.type === "word" ? allWords.find(x => x.id === selection.id) : null;
  const grp = w ? groups.find(g => g.id === w.groupId) : (selection.type === "group" ? groups.find(g => g.id === selection.id) : null);
  const groupName = grp ? (grp.solo ? "Solo cue" : grp.label) : "Verse 1";
  const wordCount = grp ? grp.words.filter(x => !x.del).length : allWords.length;
  return (
    <div className="insp">
      {w && <CueEditor word={w} group={grp} onText={onText} onNudge={onNudge} onToggleDel={onToggleDel} onSplit={onSplit} />}
      <div className="tier group">
        <div className="tier-h"><span className="tier-tag group">GROUP</span>{groupName}<span className="meta">{wordCount} words</span></div>
        <Field label="Font" value="Space Grotesk" src="grp" />
        <Field label="Size" value="64 px" src="grp" />
        {!w && <Field label="Animation" value={preset} src="grp" />}
      </div>
      <div className="tier global">
        <div className="tier-h"><span className="tier-tag global">GLOBAL</span>Defaults</div>
        <Field label="Fade-in" value="250 ms" src="inh" />
        <Field label="Fade-out" value="600 ms" src="inh" />
        <Field label="Color" value="#FFFFFF" src="inh" swatch />
      </div>
      <div className="wf-note">resolved: {w ? <b>word</b> : "word"} → {w && !grp ? "group" : (selection.type === "group" ? <b>group</b> : "group")} → global</div>
    </div>
  );
}

function groupRange(g) {
  const live = g.words.filter(w => !w.del);
  if (!live.length) return [0, 0];
  return [Math.min(...live.map(w => w.s)), Math.max(...live.map(w => w.e))];
}

function CueLanes({ groups, selWordId, selGroupId, collapsed, onSelectWord, onSelectGroup, onToggleCollapse }) {
  return (
    <div className="lanes">
      <div className="lane-head">
        <span className="lh layout"><Icon name="layers" size={13} />LAYOUT · cue / words</span>
        <span className="lh"><Icon name="sparkles" size={13} />FADE-IN</span>
        <span className="lh"><Icon name="sparkles" size={13} />FADE-OUT</span>
      </div>
      {groups.map((g, gi) => {
        const [s, e] = groupRange(g);
        const open = !collapsed.has(g.id);
        const gc = `var(--cue-${(gi % 10) + 1})`;
        return (
          <React.Fragment key={g.id}>
            <div className={"lane-evt" + (g.id === selGroupId ? " sel" : "")} style={{ "--g-color": gc }} onClick={() => onSelectGroup(g.id)}>
              <span className="chev" onClick={(ev) => { ev.stopPropagation(); onToggleCollapse(g.id); }}>
                <Icon name="chevDown" size={13} stroke={2} />
              </span>
              {g.solo ? <span className="solo-badge">SOLO</span> : null}{g.label}
              <span className="acc">{g.solo ? "" : "accumulate · words"}</span>
              <span className="rng">{s.toFixed(2)}–{e.toFixed(2)}</span>
            </div>
            {open && g.words.map(w => {
              const grouped = w.fadeOut;
              const bandc = grouped ? "var(--cue-1)" : "transparent";
              return (
                <div key={w.id} className={"lane-row" + (w.id === selWordId ? " sel" : "") + (w.del ? " del" : "")} onClick={() => onSelectWord(w.id)}>
                  <span className={"lc word" + (grouped ? " grouped" : "")} style={{ "--g-color": bandc }}>{w.text}{w.frac ? " ◴" : ""}</span>
                  <span className={"lc " + (grouped ? "ovr grouped" : "inh")} style={{ "--g-color": bandc }}>@{w.s.toFixed(2)} / {grouped ? 180 : 250}</span>
                  <span className={"lc " + (grouped ? "ovr grouped" : "inh")} style={{ "--g-color": bandc }}>{grouped ? "@15.40 / 600" : "· none"}</span>
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CueToolbar({ canAddInGroup, canSplit, hasWordSel, wordDeleted, onAddInGroup, onAddSolo, onSplit, onToggleDel, onUndo, onRedo, canUndo, canRedo }) {
  return (
    <div className="cue-tools-wrap">
      <div className="cue-tools">
        <button className="minibtn primary" onClick={onAddInGroup} disabled={!canAddInGroup} title="Add a word into the selected cue/group">
          <Icon name="plus" size={13} />Word in group
        </button>
        <button className="minibtn primary" onClick={onAddSolo} title="Add a standalone cue (its own group)">
          <Icon name="plus" size={13} />New cue
        </button>
        <span className="sep" />
        <button className="minibtn" onClick={onSplit} disabled={!canSplit}><Icon name="scissors" size={13} />Split</button>
        <button className="minibtn" onClick={onToggleDel} disabled={!hasWordSel}>
          <Icon name={wordDeleted ? "undo" : "close"} size={13} />{wordDeleted ? "Restore" : "Delete"}
        </button>
        <span className="sep" />
        <button className="minibtn" onClick={onUndo} disabled={!canUndo}><Icon name="undo" size={13} />Undo</button>
        <button className="minibtn" onClick={onRedo} disabled={!canRedo}><Icon name="redo" size={13} />Redo</button>
      </div>
    </div>
  );
}

Object.assign(window, { ControlsRail, Inspector, CueLanes, CueToolbar, PRESETS, groupRange });
