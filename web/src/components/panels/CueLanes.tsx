import React from "react";
import type { Project, Token } from "../../types";
import { eventWindow } from "../../model/resolve";
import { eventColor } from "../../model/palette";
import { cueExtent } from "../../model/spill";
import { cueRows } from "../../model/animRows";
import { Icon } from "../icons/Icon";
import { inlineRenameKeyDown, inlineRenamePaste, commitRename } from "../controls/inlineRename";

export interface CueLanesProps {
  project: Project;
  sel: { scope: "global" | "group" | "cue" | null; gi: number | null; tok: { li: number; ti: number } | null };
  selectedWords: Set<number>;
  collapsed: Set<number>;
  aiHotKey: string | null;
  onSelectWord: (gi: number, li: number, ti: number, wid: number, mods: { ctrl?: boolean; shift?: boolean }) => void;
  onSelectEvent: (gi: number) => void;
  /** Commit an inline rename of the event header label. */
  onRenameEvent?: (gi: number, label: string) => void;
  onToggleCollapse: (gi: number) => void;
  /** Double-click a cue row → flip to the Timeline tab on that cue (optional). */
  onCueOpen?: (gi: number, li: number, ti: number, wid: number) => void;
  /** Click empty lanes area → clear selection (optional). */
  onClearSel?: () => void;
}

function tokText(project: Project, tok: Token): string {
  return tok.ids.map((id) => project.words[id].text).join(tok.sep || " ");
}

// Channel → accent color (mirrors the kit CH_COLOR; drives the chip dot via --ch).
const CH_COLOR: Record<string, string> = {
  alpha: "#3DE0FF", karaoke_fill: "#FFC24D", primary: "#FF3DA6", outline: "#9AA3B2",
  back: "#8B8BFF", fill_alpha: "#3DE0FF", outline_alpha: "#9AA3B2", shadow_alpha: "#8B8BFF",
  scale_x: "#8A5BFF", scale_y: "#8A5BFF", fontsize: "#8A5BFF",
  rot_x: "#9BE59B", rot_y: "#9BE59B", rot_z: "#9BE59B", shear_x: "#9BE59B", shear_y: "#9BE59B",
  spacing: "#C0C0C0", border_w: "#C0C0C0", shadow_depth: "#C0C0C0",
  clip_rect: "#4DE0C2", blur: "#5AA0FF", move: "#FF8A3D",
};
const chColor = (ch: string): string => CH_COLOR[ch] ?? "#3DE0FF";
const ORDER: Record<string, number> = { own: 0, inherited: 1, tombstone: 2 };

// ANIMATION lane: channel-colored chips for every animation on the cue, carrying
// waterfall state (own = solid · inherited = grey + grp/glob src · tombstone = struck).
// Driven from cueRows (the carrier-derived inheritance state — mirrors the inspector).
function AnimChips({ project, gi, wid }: { project: Project; gi: number; wid: number }) {
  const rows = cueRows(project, gi, wid);
  if (!rows.length) return <span className="lc anim none">· none</span>;
  const sorted = rows.slice().sort((a, b) => (ORDER[a.kind] ?? 1) - (ORDER[b.kind] ?? 1));
  return (
    <span className="lc anim">
      <span className="achips">
        {sorted.map((r, i) => {
          const cls = "achip " + (r.kind === "own" ? "own" : r.kind === "tombstone" ? "tomb" : "inh");
          const srcTag = r.kind === "own" ? null : (r.src === "group" ? "grp" : "glob");
          const label = r.name.replace(/_/g, " ");
          return (
            <span key={r.id + "-" + i} className={cls} style={{ "--ch": chColor(r.channel) } as React.CSSProperties}
                  title={label + " · " + r.channel + (srcTag ? " · inherited from " + r.src : " · this cue")}>
              <i className="ch-dot" />{label}{srcTag && <em className="src">{srcTag}</em>}
            </span>
          );
        })}
      </span>
    </span>
  );
}

// One start/end sub-lane cell: structural time (neutral) + cyan outward caret + delta
// + edge bleed-tick when an animation spills past this boundary. Only OUTWARD spill.
function StartEnd({ ext, side }: { ext: ReturnType<typeof cueExtent>; side: "start" | "end" }) {
  const v = side === "start" ? ext.s : ext.e;
  const spill = side === "start" ? ext.spillBefore : ext.spillAfter;
  const delta = side === "start" ? ext.beforeDelta : ext.afterDelta;
  return (
    <span className={"lc t-cell t-" + side + (spill ? " spill" : "")}
          title={spill ? `Animation ${side === "start" ? "begins " + delta.toFixed(2) + "s before" : "ends " + delta.toFixed(2) + "s after"} the cue's layout ${side}` : undefined}>
      {side === "start" && spill && <span className="caret">‹</span>}
      <span className="t-val">{v.toFixed(2)}</span>
      {spill && <em className="t-spill">{side === "start" ? "−" : "+"}{delta.toFixed(2)}</em>}
      {side === "end" && spill && <span className="caret">›</span>}
    </span>
  );
}

const LANE_COLS_DEFAULT: [number, number, number] = [160, 96, 96];   // text · start · end (px); ANIMATION flexes
function loadLaneCols(): [number, number, number] {
  try {
    const s = JSON.parse(localStorage.getItem("kss.laneCols") || "");
    if (Array.isArray(s) && s.length === 3 && s.every((n) => Number.isFinite(n))) return s as [number, number, number];
  } catch { /* ignore */ }
  return [...LANE_COLS_DEFAULT];
}

export function CueLanes({
  project, sel, selectedWords, collapsed, aiHotKey,
  onSelectWord, onSelectEvent, onRenameEvent, onToggleCollapse, onCueOpen, onClearSel,
}: CueLanesProps) {
  // gi of the event header currently in inline-rename mode, or null.
  const [editingGi, setEditingGi] = React.useState<number | null>(null);
  const [cols, setCols] = React.useState<[number, number, number]>(loadLaneCols);
  const tpl = `${cols[0]}px ${cols[1]}px ${cols[2]}px minmax(150px, 1.4fr)`;

  // Drag a header divider → resize the column to its left (min 64px); persist on release.
  const startColDrag = (i: number) => (ev: React.PointerEvent) => {
    ev.preventDefault(); ev.stopPropagation();
    const x0 = ev.clientX, base = cols[i];
    const move = (e: PointerEvent) => {
      const w = Math.max(64, Math.round(base + (e.clientX - x0)));
      setCols((c) => { const n = [...c] as [number, number, number]; n[i] = w; return n; });
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      document.body.classList.remove("col-resizing");
      setCols((c) => { try { localStorage.setItem("kss.laneCols", JSON.stringify(c)); } catch { /* ignore */ } return c; });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    document.body.classList.add("col-resizing");
  };
  const resetCol = (i: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setCols((c) => {
      const n = [...c] as [number, number, number]; n[i] = LANE_COLS_DEFAULT[i];
      try { localStorage.setItem("kss.laneCols", JSON.stringify(n)); } catch { /* ignore */ }
      return n;
    });
  };
  const grip = (i: number) => (
    <span className="col-grip" title="Drag to resize · double-click to reset"
          onPointerDown={startColDrag(i)} onDoubleClick={resetCol(i)} />
  );

  const onLanesClick = (e: React.MouseEvent) => {
    if (onClearSel && !(e.target as HTMLElement).closest(".lane-row, .lane-evt, .col-grip")) onClearSel();
  };

  return (
    <div className="lanes anim-dock" style={{ "--lane-cols": tpl } as React.CSSProperties} onClick={onLanesClick}>
      <div className="lane-head">
        <span className="lh layout"><Icon name="layers" size={13} />LAYOUT · text{grip(0)}</span>
        <span className="lh layout sub">start{grip(1)}</span>
        <span className="lh layout sub">end{grip(2)}</span>
        <span className="lh anim"><Icon name="sparkles" size={13} />ANIMATION</span>
      </div>
      {project.layout.map((g, gi) => {
        const [s, e] = eventWindow(project, gi);
        const open = !collapsed.has(gi);
        const gc = eventColor(g, gi);
        const evtSel = sel.scope === "group" && sel.gi === gi && !sel.tok;
        return (
          <React.Fragment key={gi}>
            <div
              className={"lane-evt" + (evtSel ? " sel" : "") + (aiHotKey === "g" + gi ? " aihot" : "")}
              style={{ "--g-color": gc } as React.CSSProperties}
              onClick={() => { if (editingGi !== gi) onSelectEvent(gi); }}
            >
              <span className="chev" onClick={(ev) => { ev.stopPropagation(); onToggleCollapse(gi); }}>
                <Icon name="chevDown" size={13} stroke={2} />
              </span>
              <span
                className={"glabel-edit" + (g.label ? "" : " unnamed")}
                role="textbox"
                aria-label="Event name"
                title={g.label || "Untitled event"}
                contentEditable={editingGi === gi}
                suppressContentEditableWarning
                onDoubleClick={(ev) => {
                  ev.stopPropagation();
                  if (!onRenameEvent) return;
                  setEditingGi(gi);
                  // focus + select the text on the next tick (after contentEditable flips on)
                  const el = ev.currentTarget;
                  requestAnimationFrame(() => {
                    el.focus();
                    const s = window.getSelection();
                    if (s) s.selectAllChildren(el);
                  });
                }}
                onClick={(ev) => { if (editingGi === gi) ev.stopPropagation(); }}
                onKeyDown={inlineRenameKeyDown}
                onPaste={inlineRenamePaste}
                onBlur={(ev) => {
                  const v = commitRename(ev.currentTarget);
                  setEditingGi(null);
                  if (v !== g.label) onRenameEvent?.(gi, v);
                  if (!v) ev.currentTarget.textContent = "Untitled event";
                }}
              >
                {g.label || "Untitled event"}
              </span>
              {g.section && g.section !== "—" && (
                <span className="evt-section" title={`Section: ${g.section}`}>{g.section}</span>
              )}
              <span className="rng">
                {s.toFixed(2)}–{e.toFixed(2)}
                {g.linger ? " +" + g.linger + "s" : ""}
              </span>
            </div>
            {open && g.lines.map((ln, li) => (
              <React.Fragment key={li}>
                {li > 0 && <div className="line-div"><span>line break · \N</span></div>}
                {ln.toks.map((tok, ti) => {
                  const wid = tok.ids[0];
                  const ws = tok.ids.map((id) => project.words[id]).filter(Boolean);
                  const ext = cueExtent(ws, tok.anims_resolved ?? []);
                  const isSel = sel.tok && sel.gi === gi && sel.tok.li === li && sel.tok.ti === ti;
                  const multi = tok.ids.some((id) => selectedWords.has(id));
                  const merged = tok.ids.length > 1;
                  return (
                    <div
                      key={ti}
                      className={
                        "lane-row" +
                        (isSel ? " sel" : "") +
                        (multi ? " multi" : "") +
                        (tok.del ? " del" : "") +
                        (aiHotKey === "w" + wid ? " aihot" : "")
                      }
                      onClick={(ev) =>
                        onSelectWord(gi, li, ti, wid, { ctrl: ev.ctrlKey || ev.metaKey, shift: ev.shiftKey })
                      }
                      onDoubleClick={() => onCueOpen?.(gi, li, ti, wid)}
                      title="Double-click → open this cue in the Timeline"
                    >
                      <span className="lc word">
                        {merged && <Icon name="layers" size={11} />}
                        {tok.del ? <s>{tokText(project, tok)}</s> : tokText(project, tok)}
                        {merged && <span className="mtag">merged</span>}
                      </span>
                      <StartEnd ext={ext} side="start" />
                      <StartEnd ext={ext} side="end" />
                      <AnimChips project={project} gi={gi} wid={wid} />
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
