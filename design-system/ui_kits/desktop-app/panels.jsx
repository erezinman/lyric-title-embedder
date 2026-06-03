// panels.jsx — ControlsRail, StyleWaterfall (3-tier inspector), CueLanes (events +
// two fade lanes), OpsToolbar (contextual layout/fade ops). Real-model aware.

// ---- per-prop control metadata for the style waterfall ----
const STYLE_META = {
  font:        { label: "Font",        kind: "combo",  fmt: v => v },
  fontsize:    { label: "Size",        kind: "step",   fmt: v => v + " px", step: 2, min: 8 },
  bold:        { label: "Bold",        kind: "toggle", fmt: v => (v ? "On" : "Off") },
  primary:     { label: "Fill",        kind: "color",  fmt: v => v },
  outline:     { label: "Outline",     kind: "color",  fmt: v => v },
  back:        { label: "Box color",   kind: "color",  fmt: v => v },
  back_alpha:  { label: "Box alpha",   kind: "step",   fmt: v => "0x" + v, step: 16, min: 0, max: 255, hex: true },
  outline_w:   { label: "Outline w",   kind: "step",   fmt: v => v + " px", step: 1, min: 0 },
  shadow:      { label: "Shadow",      kind: "step",   fmt: v => v + " px", step: 1, min: 0 },
  border_style:{ label: "Border mode", kind: "mode",   fmt: v => (v === 3 ? "Opaque box" : "Outline") },
};

function ControlsRail({ placement }) {
  const pl = placement || {};
  const ALIGN = { 1:"Bottom-Left (1)",2:"Bottom-Center (2)",3:"Bottom-Right (3)",4:"Mid-Left (4)",5:"Center (5)",6:"Mid-Right (6)",7:"Top-Left (7)",8:"Top-Center (8)",9:"Top-Right (9)" };
  return (
    <div>
      <div className="sec-t"><Icon name="film" size={13} />Source &amp; output</div>
      <div className="ctl"><label>Lyrics</label><div className="text-inp" style={{ maxWidth: 168 }}><span className="path">bleating_obsession.json</span></div></div>
      <div className="ctl"><label>Video</label><div className="text-inp" style={{ maxWidth: 168 }}><span className="path">bleating_master.mp4</span></div></div>
      <div className="ctl"><label>Group lyrics by</label><Select value="section" /></div>

      <div className="sec-t spacer"><Icon name="align" size={13} />Placement (global)</div>
      <div className="ctl"><label>Canvas</label><div className="text-inp mono" style={{ maxWidth: 120, justifyContent: "center" }}>{pl.play_w || 1920}×{pl.play_h || 1080}</div></div>
      <div className="ctl"><label>Alignment</label><Select value={ALIGN[pl.align || 2]} /></div>
      <div className="ctl"><label>Free placement (\pos)</label><Toggle on={!!pl.use_pos} /></div>
      <p className="wf-note" style={{ textAlign: "left", marginTop: 2, marginBottom: 2, lineHeight: 1.5 }}>
        Placement &amp; canvas are <b>global</b> — edited via <span className="mono">set_globals</span>, not project state.
      </p>

      <div className="sec-t spacer disabled-sec"><Icon name="sparkles" size={13} />Animation preset<span className="soon">Coming soon</span></div>
      <div className="chips disabled">
        {["Karaoke Bounce", "Pop", "Glow", "Typewriter"].map(p => <span key={p} className="chip" aria-disabled="true">{p}</span>)}
      </div>
      <p className="wf-note" style={{ textAlign: "left", marginTop: 10, lineHeight: 1.5 }}>
        Per-word entrance animations aren’t in the render engine yet — disabled until then.
      </p>
    </div>
  );
}

// ── style waterfall: GLOBAL · GROUP · CUE, each prop inherit-grey vs override-solid ──
function clampStep(pkey, v, dir) {
  const m = STYLE_META[pkey];
  if (m.hex) { let n = Math.max(0, Math.min(255, (parseInt(v, 16) || 0) + dir * m.step)); return n.toString(16).padStart(2, "0").toUpperCase(); }
  let n = (typeof v === "number" ? v : 0) + dir * (m.step || 1);
  if (m.min != null) n = Math.max(m.min, n); if (m.max != null) n = Math.min(m.max, n);
  return n;
}
const COLOR_OPTS = ["#FFFFFF", "#FF3DA6", "#8A5BFF", "#3DE0FF", "#000000", "#4DE0C2", "#FFC24D"];

function PropRow({ pkey, isGlobal, inheritFrom, overridden, onSet, onClear }) {
  const meta = STYLE_META[pkey];
  const solid = isGlobal || overridden != null;
  const val = solid ? (isGlobal ? overridden.value : overridden.value) : inheritFrom.value;

  const ctrl = () => {
    if (meta.kind === "toggle") return <span className="pv-ctl" onClick={() => onSet(pkey, !val)}><Toggle on={!!val} /></span>;
    if (meta.kind === "color") return (
      <span className="pv-ctl swrow2">
        {COLOR_OPTS.map(c => <i key={c} className={"sw-dot" + (c.toUpperCase() === String(val).toUpperCase() ? " on" : "")} style={{ background: c }} onClick={() => onSet(pkey, c)} />)}
      </span>);
    if (meta.kind === "mode") return (
      <span className="seg2">
        <button className={val === 1 ? "on" : ""} onClick={() => onSet(pkey, 1)}>Outline</button>
        <button className={val === 3 ? "on" : ""} onClick={() => onSet(pkey, 3)}>Box</button>
      </span>);
    return (
      <span className="pv-step">
        <span className="pm" onClick={() => onSet(pkey, clampStep(pkey, val, -1))}>−</span>
        <span className="v">{meta.fmt(val)}</span>
        <span className="pm" onClick={() => onSet(pkey, clampStep(pkey, val, +1))}>+</span>
      </span>);
  };

  return (
    <div className={"prow" + (solid ? " over" : " inh")}>
      <span className="pl">{meta.label}</span>
      <span className="pv">{ctrl()}</span>
      {isGlobal
        ? <span className="psrc base">base</span>
        : overridden != null
          ? <button className="pclear" title="Clear override (inherit)" onClick={() => onClear(pkey)}><Icon name="close" size={11} /></button>
          : <span className="psrc" title={"inherited from " + inheritFrom.src}>{inheritFrom.src === "group" ? "grp" : "glob"}</span>}
    </div>
  );
}

// what each tier inherits (group→global for cue; global for group)
function inheritMap(project, gi, scope) {
  const g = gi != null ? project.layout[gi] : null;
  const out = {};
  STYLE_KEYS.forEach(k => {
    if (scope === "cue" && g && g.style && g.style[k] != null) out[k] = { value: g.style[k], src: "group" };
    else out[k] = { value: project.global_style[k], src: "global" };
  });
  return out;
}

function Tier({ tier, title, badge, keys, styleDict, isGlobal, inherit, selected, onSelect, onSet, onClear, aiHot }) {
  return (
    <div className={"tier3 " + tier + (selected ? " sel" : "") + (aiHot ? " aihot" : "")} onClick={onSelect}>
      <div className="t3-h"><span className={"tier-tag " + tier}>{title}</span>{badge}</div>
      <div className="t3-body">
        {keys.map(k => (
          <PropRow key={k} pkey={k} isGlobal={isGlobal} inheritFrom={inherit[k]}
            overridden={isGlobal ? { value: styleDict[k] } : (styleDict && styleDict[k] != null ? { value: styleDict[k] } : null)}
            onSet={(pk, v) => onSet(tier, pk, v)} onClear={(pk) => onClear(tier, pk)} />
        ))}
      </div>
    </div>
  );
}

function StyleWaterfall({ project, sel, aiTier, onSelectTier, onSetStyle, onClearStyle }) {
  const gi = sel.gi;
  const g = gi != null ? project.layout[gi] : null;
  const tok = sel.tok || null;
  return (
    <div className="insp">
      <div className="wf-head">Style waterfall — <b>cue → group → global</b> · most specific wins</div>
      {tok && (
        <Tier tier="word" title="CUE" badge={<span className="t3-meta">“{tokText(project, tok)}”</span>}
          keys={CUE_STYLE_KEYS} styleDict={tok.style} inherit={inheritMap(project, gi, "cue")}
          selected={sel.scope === "cue"} aiHot={aiTier === "cue"}
          onSelect={() => onSelectTier("cue")} onSet={onSetStyle} onClear={onClearStyle} />
      )}
      {g && (
        <Tier tier="group" title="GROUP" badge={<span className="t3-meta">{g.label}</span>}
          keys={STYLE_KEYS} styleDict={g.style} inherit={inheritMap(project, gi, "group")}
          selected={sel.scope === "group"} aiHot={aiTier === "group"}
          onSelect={() => onSelectTier("group")} onSet={onSetStyle} onClear={onClearStyle} />
      )}
      <Tier tier="global" title="GLOBAL" badge={<span className="t3-meta">defaults</span>}
        keys={STYLE_KEYS} styleDict={project.global_style} isGlobal={true} inherit={{}}
        selected={sel.scope === "global"} aiHot={aiTier === "global"}
        onSelect={() => onSelectTier("global")} onSet={onSetStyle} onClear={() => {}} />
      <div className="wf-foot"><Icon name="layers" size={11} />Box mode is a <b>group</b> decision (separate ASS Style). Cue tier omits it.</div>
    </div>
  );
}

// ── locked timing panel (words immutable) ──
function TimingPanel({ tok, project }) {
  if (!tok) return null;
  const live = tok.ids.map(id => project.words[id]);
  const s = Math.min(...live.map(w => w.start)), e = Math.max(...live.map(w => w.end));
  return (
    <div className="locked">
      <div className="locked-h"><Icon name="clock" size={13} />Timing<span className="lock-pill"><Icon name="settings" size={10} />locked</span></div>
      <div className="locked-row"><span>Start</span><b className="mono">{s.toFixed(2)}s</b></div>
      <div className="locked-row"><span>Stop</span><b className="mono">{e.toFixed(2)}s</b></div>
      <p className="locked-note">Word text &amp; timing are locked to the source alignment. Editing is a planned feature.</p>
    </div>
  );
}

// ── cue lanes: events → words across two fade lanes ──
function FadeCell({ sched, kind, color, palette }) {
  const inGroup = kind === "in" ? sched.inFin : sched.inFout;
  if (kind === "out" && !sched.inFout) return <span className="lc fade none">· none</span>;
  const trigger = kind === "in" ? sched.fin_trigger : sched.fout_at;
  const dur = kind === "in" ? sched.fin_ms : sched.fout_ms;
  const inherited = kind === "in" ? sched.fin_inherited : sched.fout_inherited;
  const band = inGroup ? palette[color] : "transparent";
  return (
    <span className={"lc fade" + (inGroup ? " grouped" : "") + (inherited ? " inh" : " ovr")} style={{ "--band": band }}>
      @{(trigger ?? 0).toFixed(2)} / {dur}
    </span>
  );
}

function CueLanes({ project, sel, selectedWords, collapsed, aiHotKey, onSelectWord, onShiftWord, onSelectEvent, onToggleCollapse }) {
  return (
    <div className="lanes">
      <div className="lane-head">
        <span className="lh layout"><Icon name="layers" size={13} />LAYOUT · cues</span>
        <span className="lh"><Icon name="sparkles" size={13} />FADE-IN</span>
        <span className="lh"><Icon name="sparkles" size={13} />FADE-OUT</span>
      </div>
      {project.layout.map((g, gi) => {
        const [s, e] = eventWindow(project, gi);
        const open = !collapsed.has(gi);
        const gc = project.palette[(gi % 10)];
        const evtSel = sel.scope === "group" && sel.gi === gi && !sel.tok;
        return (
          <React.Fragment key={gi}>
            <div className={"lane-evt" + (evtSel ? " sel" : "") + (aiHotKey === "g" + gi ? " aihot" : "")} style={{ "--g-color": gc }} onClick={() => onSelectEvent(gi)}>
              <span className="chev" onClick={(ev) => { ev.stopPropagation(); onToggleCollapse(gi); }}>
                <Icon name="chevDown" size={13} stroke={2} />
              </span>
              {g.label}
              <span className={"acc-badge acc-" + g.accumulate}>{g.accumulate}</span>
              <span className="rng">{s.toFixed(2)}–{e.toFixed(2)}{g.linger ? " +" + g.linger + "s" : ""}</span>
            </div>
            {open && g.lines.map((ln, li) => (
              <React.Fragment key={li}>
                {li > 0 && <div className="line-div"><span>line break · \N</span></div>}
                {ln.toks.map((tok, ti) => {
                  const wid = tok.ids[0];
                  const sched = wordSchedule(project, gi, wid);
                  const isSel = sel.tok && sel.gi === gi && sel.tok.li === li && sel.tok.ti === ti;
                  const multi = tok.ids.some(id => selectedWords.has(id));
                  const merged = tok.ids.length > 1;
                  return (
                    <div key={ti} className={"lane-row" + (isSel ? " sel" : "") + (multi ? " multi" : "") + (tok.del ? " del" : "") + (aiHotKey === "w" + wid ? " aihot" : "")}
                      onClick={(ev) => ev.shiftKey ? onShiftWord(wid) : onSelectWord(gi, li, ti, wid)}>
                      <span className="lc word">{merged && <Icon name="layers" size={11} />}{tokText(project, tok)}{merged && <span className="mtag">merged</span>}</span>
                      <FadeCell sched={sched} kind="in" color={(project.fin_tags.find(t => t.ids.includes(wid)) || {}).color} palette={project.palette} />
                      <FadeCell sched={sched} kind="out" color={(project.fout_tags.find(t => t.ids.includes(wid)) || {}).color} palette={project.palette} />
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── contextual ops toolbar ──
function OpsToolbar({ selCount, canGroupFade, fadeMembership, canMergeWords, canMergeEvents, canSplitEvent, canBreakLine, hasEvent, wordDeleted, onGroupFade, onClearFade, onMergeWords, onMergeEvents, onSplitEvent, onBreakLine, onUngroupEvent, onDelete, onUndo, onRedo, canUndo, canRedo }) {
  return (
    <div className="cue-tools-wrap">
      <div className="cue-tools">
        <button className="minibtn primary" onClick={() => onGroupFade("in")} disabled={!canGroupFade}><Icon name="sparkles" size={13} />Group fade-in</button>
        <button className="minibtn primary" onClick={() => onGroupFade("out")} disabled={!canGroupFade}><Icon name="sparkles" size={13} />Group fade-out</button>
        {fadeMembership && <button className="minibtn" onClick={() => onClearFade(fadeMembership)}><Icon name="close" size={13} />Clear {fadeMembership}</button>}
        <span className="sep" />
        <button className="minibtn" onClick={onMergeWords} disabled={!canMergeWords}><Icon name="layers" size={13} />Merge words</button>
        <button className="minibtn" onClick={onBreakLine} disabled={!canBreakLine}><Icon name="scissors" size={13} />Break line</button>
        <button className="minibtn" onClick={onMergeEvents} disabled={!canMergeEvents}><Icon name="layers" size={13} />Merge events</button>
        <button className="minibtn" onClick={onSplitEvent} disabled={!canSplitEvent}><Icon name="scissors" size={13} />Split event</button>
        <button className="minibtn" onClick={onUngroupEvent} disabled={!hasEvent}><Icon name="scissors" size={13} />Ungroup event</button>
        <button className="minibtn" onClick={onDelete} disabled={!selCount}><Icon name={wordDeleted ? "undo" : "close"} size={13} />{wordDeleted ? "Restore" : "Delete"}</button>
        <span className="sep" />
        <button className="minibtn" onClick={onUndo} disabled={!canUndo}><Icon name="undo" size={13} />Undo</button>
        <button className="minibtn" onClick={onRedo} disabled={!canRedo}><Icon name="redo" size={13} />Redo</button>
        <span className="sel-count">{selCount ? selCount + " selected" : "shift-click words to multi-select"}</span>
      </div>
    </div>
  );
}

Object.assign(window, { ControlsRail, StyleWaterfall, TimingPanel, CueLanes, OpsToolbar, STYLE_META });
