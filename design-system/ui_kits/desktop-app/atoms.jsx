// atoms.jsx — small reusable controls. Export to window for cross-file use.
function Toggle({ on, onClick }) {
  return <div className={"toggle " + (on ? "on" : "off")} onClick={onClick}><div className="knob" /></div>;
}
function Stepper({ value }) {
  return <div className="step"><span className="pm">−</span><span className="v">{value}</span><span className="pm">+</span></div>;
}
function Select({ value }) {
  return <div className="select">{value}<Icon name="chevDown" size={14} /></div>;
}
function Combo({ value }) {
  return <div className="combo">{value}<Icon name="chevDown" size={14} /></div>;
}
function Swatches({ colors }) {
  return <div className="swatches">{colors.map((c, i) => <i key={i} style={{ background: c }} />)}</div>;
}
function Chip({ on, ghost, children, onClick }) {
  return (
    <div className={"chip" + (on ? " on" : "") + (ghost ? " ghost" : "")} onClick={onClick}>
      {on && <span className="dot" />}{children}
    </div>
  );
}

Object.assign(window, { Toggle, Stepper, Select, Combo, Swatches, Chip });
