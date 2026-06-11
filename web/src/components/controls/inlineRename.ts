// inlineRename.ts — shared single-line contenteditable rename handlers (spec §6).
// Used by the CueLanes event header and the WordTrack Lanes gutter; EventsPanel
// shares the same `oneLine` collapse/trim rule from model/events.
import { oneLine } from "../../model/events";

/** Enter commits without inserting a newline: preventDefault + blur (fires commit). */
export function inlineRenameKeyDown(e: React.KeyboardEvent<HTMLElement>): void {
  if (e.key === "Enter") {
    e.preventDefault();
    (e.target as HTMLElement).blur();
  }
}

/** Paste as plain text, collapsing line breaks to a single space. */
export function inlineRenamePaste(e: React.ClipboardEvent<HTMLElement>): void {
  e.preventDefault();
  const txt = oneLine(e.clipboardData.getData("text") || "");
  document.execCommand("insertText", false, txt);
}

/** Read + sanitize the committed value from a contenteditable element. */
export function commitRename(el: HTMLElement): string {
  return oneLine(el.textContent ?? "");
}
