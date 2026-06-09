import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpsToolbar } from "./OpsToolbar";

describe("OpsToolbar", () => {
  it("group-fade and merge fire their callbacks", async () => {
    const onGroupFade = vi.fn(); const onMergeWords = vi.fn();
    render(<OpsToolbar selCount={2} canGroupFade={true} fadeMembership={null} canMergeWords={true}
      mergeOn={false} canUnmerge={false} canMergeEvents={false} canSplitEvent={false} canBreakLine={false} breakLineOn={false} hasEvent={false} wordDeleted={false}
      onGroupFade={onGroupFade} onClearFade={() => {}} onMergeWords={onMergeWords} onUnmerge={() => {}} onMergeEvents={() => {}}
      onSplitEvent={() => {}} onBreakLine={() => {}} onUngroupEvent={() => {}} onDelete={() => {}} />);
    await userEvent.click(screen.getByText(/Group fade-in/i));
    expect(onGroupFade).toHaveBeenCalledWith("in");
    await userEvent.click(screen.getByText(/Merge words/i));
    expect(onMergeWords).toHaveBeenCalled();
  });

  // Kit-match: the button label flips to "Join line" when a break already
  // exists after the selected cue (pressing would JOIN), and reads "Break line"
  // otherwise. State is conveyed by the label, not a persistent highlight.
  const baseProps = {
    selCount: 1, canGroupFade: false, fadeMembership: null, canMergeWords: false,
    mergeOn: false, canUnmerge: false, canMergeEvents: false, canSplitEvent: false,
    canBreakLine: true, hasEvent: false, wordDeleted: false,
    onGroupFade: () => {}, onClearFade: () => {}, onMergeWords: () => {}, onUnmerge: () => {},
    onMergeEvents: () => {}, onSplitEvent: () => {}, onBreakLine: () => {}, onUngroupEvent: () => {}, onDelete: () => {},
  } as const;

  it("Break line label flips to Join line when breakLineOn", () => {
    const { rerender } = render(<OpsToolbar {...baseProps} breakLineOn={false} />);
    expect(screen.getByText("Break line")).toBeTruthy();
    expect(screen.queryByText("Join line")).toBeNull();

    rerender(<OpsToolbar {...baseProps} breakLineOn={true} />);
    expect(screen.getByText("Join line")).toBeTruthy();
    expect(screen.queryByText("Break line")).toBeNull();
  });
});
