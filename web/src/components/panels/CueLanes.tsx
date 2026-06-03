import React from "react";
import type { Project, Token } from "../../types";
import { resolveFade, eventWindow, wordSchedule, type WordSched } from "../../model/resolve";
import { colorForIndex } from "../../model/palette";
import { Icon } from "../icons/Icon";

export interface CueLanesProps {
  project: Project;
  sel: { scope: "global" | "group" | "cue"; gi: number; tok: { li: number; ti: number } | null };
  selectedWords: Set<number>;
  collapsed: Set<number>;
  aiHotKey: string | null;
  onSelectWord: (gi: number, li: number, ti: number, wid: number, mods: { ctrl?: boolean; shift?: boolean }) => void;
  onSelectEvent: (gi: number) => void;
  onToggleCollapse: (gi: number) => void;
}

function tokText(project: Project, tok: Token): string {
  return tok.ids.map((id) => project.words[id].text).join(tok.sep || " ");
}

interface FadeCellProps {
  sched: WordSched;
  kind: "in" | "out";
  project: Project;
  gi: number;
  wid: number;
}

function FadeCell({ sched, kind, project, gi, wid }: FadeCellProps) {
  const inGroup = kind === "in" ? sched.inFin : sched.inFout;
  if (kind === "out" && !sched.inFout) return <span className="lc fade none">· none</span>;

  const trigger = kind === "in" ? sched.start_s : sched.fout_at;
  const fade = resolveFade(project, gi);
  const dur = kind === "in" ? fade.fade_in_ms : fade.fade_out_ms;

  // "inherited vs overridden": inherited (grey) when project.layout[gi].fade[key] == null
  const fadeKey = kind === "in" ? "fade_in_ms" : "fade_out_ms";
  const inherited = project.layout[gi].fade[fadeKey] == null;

  // Color band: colorForIndex(tagIndex)
  const tagArr = kind === "in" ? project.fin_tags : project.fout_tags;
  const tagIndex = tagArr.findIndex((t) => t.ids.includes(wid));
  const band = inGroup && tagIndex >= 0 ? colorForIndex(tagIndex) : "transparent";

  // Trigger display: show "auto" grey/italic when null; solid when set
  const tagTrigger = kind === "in"
    ? (project.fin_tags.find((t) => t.ids.includes(wid))?.trigger ?? null)
    : (project.fout_tags.find((t) => t.ids.includes(wid))?.trigger ?? null);
  const isAutoTrigger = tagTrigger === null;

  return (
    <span
      className={"lc fade" + (inGroup ? " grouped" : "") + (inherited ? " inh" : " ovr")}
      style={{ "--band": band } as React.CSSProperties}
    >
      {isAutoTrigger
        ? <span style={{ color: "var(--fg-dim,grey)", fontStyle: "italic" }}>auto</span>
        : <span>@{(trigger ?? 0).toFixed(2)}</span>
      }
      {" / "}{dur}
    </span>
  );
}

export function CueLanes({
  project, sel, selectedWords, collapsed, aiHotKey,
  onSelectWord, onSelectEvent, onToggleCollapse,
}: CueLanesProps) {
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
        const gc = colorForIndex(gi);
        const evtSel = sel.scope === "group" && sel.gi === gi && !sel.tok;
        return (
          <React.Fragment key={gi}>
            <div
              className={"lane-evt" + (evtSel ? " sel" : "") + (aiHotKey === "g" + gi ? " aihot" : "")}
              style={{ "--g-color": gc } as React.CSSProperties}
              onClick={() => onSelectEvent(gi)}
            >
              <span
                className="chev"
                onClick={(ev) => { ev.stopPropagation(); onToggleCollapse(gi); }}
              >
                <Icon name="chevDown" size={13} stroke={2} />
              </span>
              {g.label}
              <span className={"acc-badge acc-" + g.accumulate}>{g.accumulate}</span>
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
                  const sched = wordSchedule(project, gi, wid);
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
                    >
                      <span className="lc word">
                        {merged && <Icon name="layers" size={11} />}
                        {tok.del
                          ? <s>{tokText(project, tok)}</s>
                          : tokText(project, tok)
                        }
                        {merged && <span className="mtag">merged</span>}
                      </span>
                      <FadeCell sched={sched} kind="in" project={project} gi={gi} wid={wid} />
                      <FadeCell sched={sched} kind="out" project={project} gi={gi} wid={wid} />
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
