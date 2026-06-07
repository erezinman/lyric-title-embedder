// OpsToolbar.tsx — contextual ops toolbar.
// Ported from design-system/ui_kits/desktop-app/panels.jsx with model-alignment edits.

import { Icon } from "../icons/Icon";

export interface OpsToolbarProps {
  selCount: number;
  canGroupFade: boolean;
  fadeMembership: "in" | "out" | null;
  canMergeWords: boolean;
  mergeOn: boolean;
  canUnmerge: boolean;
  canMergeEvents: boolean;
  canSplitEvent: boolean;
  canBreakLine: boolean;
  breakLineOn: boolean;
  hasEvent: boolean;
  wordDeleted: boolean;
  onGroupFade: (kind: "in" | "out") => void;
  onClearFade: (kind: "in" | "out") => void;
  onMergeWords: () => void;
  onUnmerge: () => void;
  onMergeEvents: () => void;
  onSplitEvent: () => void;
  onBreakLine: () => void;
  onUngroupEvent: () => void;
  onDelete: () => void;
}

export function OpsToolbar({
  selCount, canGroupFade, fadeMembership,
  canMergeWords, mergeOn, canUnmerge, canMergeEvents, canSplitEvent, canBreakLine, breakLineOn,
  hasEvent, wordDeleted,
  onGroupFade, onClearFade, onMergeWords, onUnmerge, onMergeEvents,
  onSplitEvent, onBreakLine, onUngroupEvent, onDelete,
}: OpsToolbarProps) {
  return (
    <div className="cue-tools-wrap">
      <div className="cue-tools">
        <button className={"minibtn primary" + (fadeMembership === "in" ? " on" : "")}
          aria-pressed={fadeMembership === "in"}
          onClick={() => onGroupFade("in")} disabled={!canGroupFade}>
          <Icon name="sparkles" size={13} />Group fade-in
        </button>
        <button className={"minibtn primary" + (fadeMembership === "out" ? " on" : "")}
          aria-pressed={fadeMembership === "out"}
          onClick={() => onGroupFade("out")} disabled={!canGroupFade}>
          <Icon name="sparkles" size={13} />Group fade-out
        </button>
        {fadeMembership && (
          <button className="minibtn" onClick={() => onClearFade(fadeMembership)}>
            <Icon name="close" size={13} />Clear {fadeMembership}
          </button>
        )}
        <span className="sep" />
        <button className={"minibtn" + (mergeOn ? " on" : "")} aria-pressed={mergeOn}
          onClick={onMergeWords} disabled={!canMergeWords}>
          <Icon name="layers" size={13} />Merge words
        </button>
        <button className="minibtn" onClick={onUnmerge} disabled={!canUnmerge}>
          <Icon name="scissors" size={13} />Unmerge
        </button>
        <button className={"minibtn" + (breakLineOn ? " on" : "")} aria-pressed={breakLineOn}
          onClick={onBreakLine} disabled={!canBreakLine}>
          <Icon name="scissors" size={13} />Break line
        </button>
        <button className="minibtn" onClick={onMergeEvents} disabled={!canMergeEvents}>
          <Icon name="layers" size={13} />Merge events
        </button>
        <button className="minibtn" onClick={onSplitEvent} disabled={!canSplitEvent}>
          <Icon name="scissors" size={13} />Split event
        </button>
        <button className="minibtn" onClick={onUngroupEvent} disabled={!hasEvent}>
          <Icon name="scissors" size={13} />Ungroup event
        </button>
        <button className={"minibtn" + (wordDeleted ? " on" : "")} aria-pressed={wordDeleted}
          onClick={onDelete} disabled={!selCount}>
          <Icon name={wordDeleted ? "undo" : "close"} size={13} />
          {wordDeleted ? "Restore" : "Delete"}
        </button>
        {/* Q7: dock copies removed by designer decision — undo/redo are TopBar-only
            (plus Ctrl/⌘+Z / Ctrl+Y) since history is global, not dock-scoped. */}
        <span className="sel-count">
          {selCount ? selCount + " selected" : "shift-click words to multi-select"}
        </span>
      </div>
    </div>
  );
}
