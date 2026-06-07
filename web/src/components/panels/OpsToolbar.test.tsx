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
});
