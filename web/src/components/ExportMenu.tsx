import { useCallback, useEffect, useState } from "react";
import { getAss, getEnv, lint, type LintIssue, type LintSeverity } from "../api/client";
import { Icon } from "./icons/Icon";

const SEV_META: Record<LintSeverity, { cls: string; icon: string }> = {
  blocking: { cls: "block", icon: "alertCircle" },
  advisory: { cls: "adv", icon: "alertTriangle" },
  info: { cls: "info", icon: "info" },
};

// Human title + scope detail per issue code. The detail names the scope the way
// the mockup does (word "…" / Verse 1 / \pos(…)).
function rowText(it: LintIssue): { title: string; detail: string; jumpable: boolean } {
  const w = it.where;
  switch (it.code) {
    case "anim_overlap":
      return {
        title: "Two animations overlap in the same scope",
        detail: `${w.scope ?? "?"}-scope · channel ${String(w.channel ?? "?")}`,
        jumpable: w.word_id != null,
      };
    case "anim_invalid":
      return { title: "Invalid animation", detail: it.msg, jumpable: w.word_id != null };
    case "anim_clamped":
      return {
        title: "Trigger clamped to event window",
        detail: it.msg,
        jumpable: w.word_id != null,
      };
    case "pos_off_canvas": {
      const pos = w.pos ? `\\pos(${w.pos[0]}, ${w.pos[1]})` : "\\pos";
      return { title: "Caption sits partly off-canvas", detail: `${pos} · clamped into frame`, jumpable: false };
    }
    default:
      return { title: it.code, detail: it.msg, jumpable: w.word_id != null };
  }
}

export function ExportMenu({
  projectName, onBurn, onClose, onJump, wordCount, eventCount,
}: {
  projectName: string;
  onBurn: (out: string, videoIn?: string) => void;
  onClose: () => void;
  // Navigate the editor: select `wordId` and move the playhead to `time` (s).
  onJump?: (wordId: number, time: number) => void;
  // Optional totals for the clean-state summary ("{n} words · {m} events validated").
  wordCount?: number;
  eventCount?: number;
}) {
  const [out, setOut] = useState(`${projectName}_subbed.mp4`);
  const [videoIn, setVideoIn] = useState("");
  const [sameHost, setSameHost] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [burning, setBurning] = useState(false);

  // Pre-flight lint. `null` == not yet checked / unavailable (button stays plain).
  const [issues, setIssues] = useState<LintIssue[] | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => { void getEnv().then((e) => setSameHost(e.same_host)).catch(() => setSameHost(false)); }, []);

  const runCheck = useCallback(() => {
    setChecking(true);
    lint()
      .then((list) => setIssues(list))
      .catch(() => setIssues(null))   // lint unavailable → don't gate; plain Burn
      .finally(() => setChecking(false));
  }, []);

  // Auto-check on open.
  useEffect(() => { runCheck(); }, [runCheck]);

  const downloadAss = async () => {
    try {
      const text = await getAss();
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${projectName}.ass`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);   // defer: revoking synchronously races the download in some engines
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const blocking = (issues ?? []).filter((i) => i.severity === "blocking");
  const advisory = (issues ?? []).filter((i) => i.severity === "advisory");
  const checked = issues != null;
  const clean = checked && issues!.length === 0;
  const hasBlocking = blocking.length > 0;
  const advisoryOnly = checked && !hasBlocking && advisory.length > 0;

  // Burn label: keep "Burn video" by default (no check / clean) so the gate is
  // additive; advisory-only reads "Burn anyway"; blocking disables.
  const burnLabel = advisoryOnly ? "Burn anyway" : "Burn video";

  const handleBurn = () => {
    if (burning || hasBlocking) return;
    setBurning(true);
    onBurn(out, videoIn || undefined);
    onClose();
  };

  const handleJump = (it: LintIssue) => {
    const w = it.where;
    if (w.word_id != null && onJump) onJump(w.word_id, typeof w.time === "number" ? w.time : 0);
  };

  const countBadge = (() => {
    if (!checked) return null;
    if (clean) return <span className="lint-count ok">clean</span>;
    const total = issues!.length;
    if (advisoryOnly) {
      const n = advisory.length;
      return <span className="lint-count warn">{n} advisory</span>;
    }
    return <span className="lint-count warn">{total} {total === 1 ? "issue" : "issues"}</span>;
  })();

  return (
    <div className="export-pop" role="dialog" onClick={(e) => e.stopPropagation()}>
      <div className="exp-h">Export</div>

      {/* Pre-flight lint panel */}
      <div className="lint-panel" data-testid="lint-panel">
        <div className="lint-ph">
          <span className="lint-shield"><Icon name="shield" size={15} /></span>
          <h3 className="lint-title">Pre-flight</h3>
          {countBadge}
          <button className="lint-recheck" type="button" onClick={runCheck} disabled={checking}>
            {checking ? "Checking…" : "Check"}</button>
        </div>

        {clean ? (
          <div className="lint-clean">
            <span className="lint-ring"><Icon name="check" size={20} stroke={2.2} /></span>
            <span className="lint-ct">No issues found</span>
            {(wordCount != null || eventCount != null) && (
              <span className="lint-cs">{wordCount ?? 0} words · {eventCount ?? 0} events validated</span>
            )}
          </div>
        ) : checked && issues!.length > 0 ? (
          <div className="lint-list" role="list">
            {issues!.map((it, idx) => {
              const meta = SEV_META[it.severity];
              const { title, detail, jumpable } = rowText(it);
              return (
                <div className="lint-w" role="listitem" key={`${it.code}-${idx}`} data-severity={it.severity}>
                  <span className={`lint-sev ${meta.cls}`}><Icon name={meta.icon} size={12} stroke={2.2} /></span>
                  <div className="lint-wbody">
                    <div className="lint-wt">{title}</div>
                    <div className="lint-wd">{detail}</div>
                    {it.code === "pos_off_canvas" ? (
                      <span className="lint-jump lint-jump-static">Open placement <Icon name="chevRight" size={11} stroke={2.2} /></span>
                    ) : jumpable ? (
                      <button type="button" className="lint-jump" onClick={() => handleJump(it)}>
                        Jump to cue <Icon name="chevRight" size={11} stroke={2.2} />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {checked && (
          <div className="lint-note" role="status">
            {hasBlocking ? (
              <><b className="blk">{blocking.length} blocking</b> {blocking.length === 1 ? "issue" : "issues"} must be resolved before burn.</>
            ) : advisoryOnly ? (
              <>Advisories won&apos;t block — review or <b>burn anyway</b>.</>
            ) : (
              <>All checks passed.</>
            )}
          </div>
        )}
      </div>

      <div className="exp-div" />

      <div className="exp-sec">
        <label className="exp-l" htmlFor="exp-out">Output filename</label>
        <input id="exp-out" className="exp-inp mono" aria-label="Output file"
               value={out} onChange={(e) => setOut(e.target.value)} />
        {sameHost && (
          <>
            <label className="exp-l" htmlFor="exp-vid">Input video <span className="exp-opt">optional · same-host path · defaults to project video</span></label>
            <input id="exp-vid" className="exp-inp mono" aria-label="Input video" placeholder="project video"
                   value={videoIn} onChange={(e) => setVideoIn(e.target.value)} />
          </>
        )}
        {err && <div className="form-err" role="alert">{err}</div>}
        <button className={"btn exp-burn " + (advisoryOnly ? "go" : "primary")}
                disabled={burning || hasBlocking}
                onClick={handleBurn}>
          <Icon name="film" size={15} />{burnLabel}
        </button>
      </div>
      <div className="exp-div" />
      <div className="exp-row" role="button" tabIndex={0} aria-label="Download .ass"
           onClick={() => void downloadAss()}
           onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void downloadAss(); } }}>
        <span className="exp-row-i"><Icon name="download" size={16} /></span>
        <span className="exp-row-t">
          <b>Download .ass</b>
          <span className="exp-row-s">Subtitle file only — no render</span>
        </span>
      </div>
    </div>
  );
}
