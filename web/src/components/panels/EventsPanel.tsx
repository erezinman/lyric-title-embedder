// EventsPanel.tsx — the Events panel (Project rail). Authors the SRT-import gaps:
// group cues into events, name them, set a section + brand color, set linger.
// Column grid: 26px(dot) · 1fr(name) · 150px(section) · 120px(window) · 90px(linger) · 64px(cues).
//
// Model reconciliation (spec §1): events partition words.
//  - "Split at cue" splits the FOCUSED group at the focused cue's LINE boundary
//    (split_event(gi, li)) — the create primitive ("New from selection"), no empty push.
//  - "Merge selected" is enabled only when ≥2 selected events have CONSECUTIVE gi;
//    it dispatches merge_events(sortedGidxs).
import { useState, useRef, useCallback } from "react";
import { Icon } from "../icons/Icon";
import { SEC_BASE, PALETTE, oneLine, type EventRow } from "../../model/events";

export interface EventsPanelProps {
  events: EventRow[];
  /** gi of the currently focused event (for Split at cue), or null. */
  focusedGi: number | null;
  onSetLabel: (gi: number, label: string) => void;
  onSetSection: (gi: number, section: string) => void;
  onSetColor: (gi: number, color: string) => void;
  onSetLinger: (gi: number, linger: number) => void;
  /** Merge a contiguous run of events into one (sorted gidxs). */
  onMerge: (gidxs: number[]) => void;
  /** Split the focused group at the given line boundary into a new event. */
  onSplit: (gi: number) => void;
}

function sectionOptions(section: string): { value: string; label: string; custom?: boolean }[] {
  const base = SEC_BASE.map((s) => ({ value: s, label: s }));
  const opts: { value: string; label: string; custom?: boolean }[] = [...base];
  // sticky option for a current custom value not in the enum
  if (section && !SEC_BASE.includes(section as (typeof SEC_BASE)[number])) {
    opts.push({ value: section, label: section });
  }
  opts.push({ value: "__custom", label: "Custom…", custom: true });
  return opts;
}

export function EventsPanel({
  events, focusedGi, onSetLabel, onSetSection, onSetColor, onSetLinger, onMerge, onSplit,
}: EventsPanelProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // color popover: which gi (or null)
  const [colorFor, setColorFor] = useState<number | null>(null);
  // custom-section modal: { gi } or null
  const [customFor, setCustomFor] = useState<number | null>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const toggleRow = useCallback((gi: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(gi)) next.delete(gi); else next.add(gi);
      return next;
    });
  }, []);

  // Merge is contiguous-only: enabled when ≥2 selected gi form a consecutive run.
  const selSorted = [...selected].sort((a, b) => a - b);
  const contiguous = selSorted.length >= 2 &&
    selSorted.every((g, i) => i === 0 || g === selSorted[i - 1] + 1);
  const canMerge = contiguous;
  const canSplit = focusedGi != null;

  return (
    <div className="ev-panel">
      <div className="panel-h">
        <span className="t">Events</span>
        <span className="sub">group · name · section · linger</span>
        <div className="toolbar">
          <button type="button" className="tb" disabled={!canMerge}
            onClick={() => canMerge && onMerge(selSorted)}>
            <Icon name="layers" size={12} />Merge selected
          </button>
          <button type="button" className="tb" disabled={!canSplit}
            onClick={() => canSplit && onSplit(focusedGi!)}>
            <Icon name="scissors" size={12} />Split at cue
          </button>
        </div>
      </div>

      <div className="evhead">
        <span></span>
        <span>Name <span className="tag-auth">author</span></span>
        <span>Section <span className="tag-auth">author</span></span>
        <span className="imp">Window <span className="tag-imp">srt</span></span>
        <span>Linger</span>
        <span>Cues</span>
      </div>

      <div className="ev-list">
        {events.map((e) => {
          const isSel = selected.has(e.gi);
          const opts = sectionOptions(e.section);
          const named = !!e.label;
          return (
            <div
              key={e.gi}
              className={"ev" + (isSel ? " sel" : "")}
              style={{ ["--ev" as string]: e.color }}
              onClick={(ev) => {
                const t = ev.target as HTMLElement;
                if (t.closest(".name,select,.stepper,.dot")) return;
                toggleRow(e.gi);
              }}
            >
              <span className="namewrap" style={{ gridColumn: "1" }}>
                <button
                  type="button"
                  className="dot"
                  aria-label={`Recolor event ${e.gi}`}
                  title="Recolor group — rebrands its lane + cue blocks"
                  style={{ background: e.color }}
                  onClick={() => setColorFor((c) => (c === e.gi ? null : e.gi))}
                />
              </span>
              <span className="namewrap">
                <NameCell
                  label={e.label}
                  named={named}
                  onCommit={(v) => onSetLabel(e.gi, v)}
                />
              </span>
              <select
                className="sec-sel"
                aria-label={`Section for event ${e.gi}`}
                value={SEC_BASE.includes(e.section as (typeof SEC_BASE)[number]) || (e.section && opts.some((o) => o.value === e.section)) ? (e.section || "—") : "—"}
                onChange={(ev) => {
                  const v = ev.target.value;
                  if (v === "__custom") setCustomFor(e.gi);
                  else onSetSection(e.gi, v);
                }}
              >
                {opts.map((o, i) => (
                  <option key={`${o.value}-${i}`} value={o.value}>{o.label}</option>
                ))}
              </select>
              <span className="win">
                <b>{e.win_start.toFixed(1)}</b>–<b>{e.win_end.toFixed(1)}</b>s
              </span>
              <span className="stepper">
                <button type="button" aria-label={`Decrease linger for event ${e.gi}`}
                  onClick={() => onSetLinger(e.gi, Math.max(0, +(e.linger - 0.1).toFixed(2)))}>−</button>
                <span className="sv">{e.linger.toFixed(1)}</span>
                <button type="button" aria-label={`Increase linger for event ${e.gi}`}
                  onClick={() => onSetLinger(e.gi, +(e.linger + 0.1).toFixed(2))}>＋</button>
              </span>
              <span className="cuecount">{e.cueCount} cue{e.cueCount > 1 ? "s" : ""}</span>
            </div>
          );
        })}
      </div>

      <div className="legend">
        <span><span className="tag-imp">srt</span> imported from the file (read-only here)</span>
        <span><span className="tag-auth">author</span> can't come from SRT — you set it</span>
      </div>

      {colorFor != null && (
        <>
          <div className="cpop-back" onClick={() => setColorFor(null)} />
          <div className="cpop" role="listbox" aria-label="Event color">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className="csw"
                aria-label={`Set color ${c}`}
                style={{ background: c }}
                onClick={() => { onSetColor(colorFor, c); setColorFor(null); }}
              />
            ))}
          </div>
        </>
      )}

      {customFor != null && (
        <CustomSectionModal
          inputRef={customInputRef}
          initial={
            SEC_BASE.includes((events.find((e) => e.gi === customFor)?.section ?? "") as (typeof SEC_BASE)[number])
              ? ""
              : (events.find((e) => e.gi === customFor)?.section ?? "")
          }
          onCancel={() => setCustomFor(null)}
          onSave={(v) => {
            const clean = oneLine(v);
            onSetSection(customFor, clean || "—");
            setCustomFor(null);
          }}
        />
      )}
    </div>
  );
}

// ── Name cell — contenteditable, single-line rules §6 ──────────────────────
function NameCell({ label, named, onCommit }: { label: string; named: boolean; onCommit: (v: string) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const display = named ? label : "Untitled event";
  return (
    <>
      <span
        ref={ref}
        className={"name" + (named ? "" : " unnamed")}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Event name"
        title={named ? label : "Untitled event"}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLElement).blur(); }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const txt = oneLine(e.clipboardData.getData("text") || "");
          document.execCommand("insertText", false, txt);
        }}
        onBlur={(e) => {
          const v = oneLine(e.currentTarget.textContent || "");
          if (v !== label) onCommit(v);
          // restore the displayed placeholder when emptied
          if (!v) e.currentTarget.textContent = "Untitled event";
        }}
      >
        {display}
      </span>
      <button
        type="button"
        className="pencil"
        aria-label="Edit name"
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          el.focus();
          const sel = window.getSelection();
          if (sel) { sel.selectAllChildren(el); }
        }}
      >
        ✎
      </button>
    </>
  );
}

// ── Custom-section modal — single-line, maxlength 40, empty→"—" ─────────────
function CustomSectionModal({
  inputRef, initial, onCancel, onSave,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  initial: string;
  onCancel: () => void;
  onSave: (v: string) => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" role="dialog" aria-label="Custom section">
        <div className="m-h">Custom section</div>
        <input
          ref={inputRef}
          className="m-in"
          type="text"
          maxLength={40}
          autoFocus
          aria-label="Custom section name"
          placeholder="e.g. Refrain · Drop · Tag…"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onSave(val); }
            else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          }}
        />
        <div className="m-act">
          <button type="button" className="tb" onClick={onCancel}>Cancel</button>
          <button type="button" className="tb primary" onClick={() => onSave(val)}>Save</button>
        </div>
      </div>
    </div>
  );
}
