// VideoControl.audit.test.tsx — Feature A: the four states (Empty / Attached /
// Swapping / Confirm-clear) render from project.video, attach/swap/clear dispatch
// contracts (via the onUpload/onClear callbacks the rail wires to /api/video),
// busy disables actions (re-entrancy), confirm-clear flow, filename ellipsis
// class, and meta formatting. Direct-render of VideoControl plus an Editor-level
// pass to prove the rail wires the video object through from the WS echo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { VideoControl, fmtDuration, baseName } from "./VideoControl";
import { Editor } from "../Editor";
import { setupFakeWS } from "../../test-util/fakews";
import { mockApi, emitState } from "../../test-util/dispatch";
import { baseProject, withVideo } from "../../test-util/fixtures";
import type { VideoMeta } from "../../types";

const VID: VideoMeta = { path: "/clips/bleating_obsession.mp4", w: 1920, h: 1080, duration_s: 42.18 };

// A deferred promise so we can hold onUpload/onClear "in flight" and assert the
// Swapping/busy state, then resolve to exit it.
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("VideoControl — pure helpers", () => {
  it("fmtDuration formats seconds → M:SS.ms", () => {
    expect(fmtDuration(42.18)).toBe("0:42.18");
    expect(fmtDuration(125.5)).toBe("2:05.50");
    expect(fmtDuration(0)).toBe("0:00.00");
  });
  it("fmtDuration → em-dash for null/non-finite", () => {
    expect(fmtDuration(null)).toBe("—");
    expect(fmtDuration(Infinity)).toBe("—");
  });
  it("baseName strips directory (both separators)", () => {
    expect(baseName("/a/b/clip.mp4")).toBe("clip.mp4");
    expect(baseName("C:\\v\\x.mov")).toBe("x.mov");
  });
});

describe("VideoControl — states (direct render)", () => {
  const renderVC = (video: VideoMeta | null, spies: { onUpload?: (f: File) => Promise<void>; onClear?: () => Promise<void> } = {}) =>
    render(<VideoControl video={video}
      onUpload={spies.onUpload ?? (async () => {})}
      onClear={spies.onClear ?? (async () => {})} />);

  it("Empty — no video: dropwell + Attach button", () => {
    renderVC(null);
    expect(screen.getByText(/drop a video/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /attach video/i })).toBeInTheDocument();
    expect(screen.getByText(/\.mp4 · \.mov · \.mkv/)).toBeInTheDocument();
  });

  it("Attached — filename + meta (WxH · M:SS.ms · linked)", () => {
    renderVC(VID);
    const fname = screen.getByText("bleating_obsession.mp4");
    expect(fname).toBeInTheDocument();
    expect(fname).toHaveClass("vc-fname"); // ellipsis/no-wrap class
    expect(screen.getByText("1920×1080")).toBeInTheDocument();
    expect(screen.getByText(/0:42\.18/)).toBeInTheDocument();
    expect(screen.getByText("linked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /swap video/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear video/i })).toBeInTheDocument();
  });

  it("Attached — null probe meta degrades to em-dashes (no crash)", () => {
    renderVC({ path: "/x/y.mov", w: null, h: null, duration_s: null });
    expect(screen.getByText("y.mov")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument(); // dims dash
  });

  it("Confirm-clear — clear opens inline confirm that reassures cues kept", () => {
    renderVC(VID);
    fireEvent.click(screen.getByRole("button", { name: /clear video/i }));
    expect(screen.getByText(/cues & styling are kept/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^clear video$/i })).toBeInTheDocument();
  });

  it("Confirm-clear — Cancel returns to Attached without clearing", () => {
    const onClear = vi.fn(async () => {});
    renderVC(VID, { onClear });
    fireEvent.click(screen.getByRole("button", { name: /clear video/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.getByText("bleating_obsession.mp4")).toBeInTheDocument();
  });

  it("Confirm-clear — confirming calls onClear", async () => {
    const onClear = vi.fn(async () => {});
    renderVC(VID, { onClear });
    fireEvent.click(screen.getByRole("button", { name: /clear video/i }));
    fireEvent.click(screen.getByRole("button", { name: /^clear video$/i }));
    await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1));
  });

  it("Swapping — busy shows spinner + indeterminate bar, action buttons gone", async () => {
    const d = deferred();
    const onUpload = vi.fn(() => d.promise);
    renderVC(VID, { onUpload });
    const file = new File([new Uint8Array([1, 2])], "new.mov", { type: "video/quicktime" });
    // drive an upload via the swap button → hidden input change
    const input = document.querySelector(".vc-file-input") as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    expect(screen.getByRole("progressbar", { name: /re-probing/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /swap video/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /clear video/i })).toBeNull();
    expect(onUpload).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve(); });
  });

  it("Swapping — busy blocks re-entrancy (no double upload)", async () => {
    const d = deferred();
    const onUpload = vi.fn(() => d.promise);
    renderVC(VID, { onUpload });
    const file = new File([new Uint8Array([1])], "a.mp4");
    const input = document.querySelector(".vc-file-input") as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    // a second change while busy must be ignored
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    expect(onUpload).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve(); });
  });
});

describe("VideoControl — Editor-level wiring", () => {
  beforeEach(() => { setupFakeWS(); mockApi(); });

  async function mountEditor(video: VideoMeta | null) {
    render(<Editor projectName="s" onHome={() => {}} />);
    await waitFor(() => expect((globalThis as unknown as { WebSocket: { last: unknown } }).WebSocket).toBeTruthy());
    const p = video ? withVideo(baseProject(), video.path, video) : baseProject();
    emitState(p);
    return p;
  }

  it("rail renders Empty when project.video is null", async () => {
    await mountEditor(null);
    expect(await screen.findByRole("button", { name: /attach video/i })).toBeInTheDocument();
  });

  it("rail renders Attached meta from the video object echo", async () => {
    await mountEditor(VID);
    expect(await screen.findByText("bleating_obsession.mp4")).toBeInTheDocument();
    // dims also appear in the Canvas row, so scope to the VideoControl meta line.
    const linked = screen.getByText("linked");
    const meta = linked.closest(".vc-fmeta") as HTMLElement;
    expect(meta).toHaveTextContent("1920×1080");
    expect(meta).toHaveTextContent("0:42.18");
  });

  it("clear → DELETE /api/video", async () => {
    await mountEditor(VID);
    fireEvent.click(await screen.findByRole("button", { name: /clear video/i }));
    fireEvent.click(screen.getByRole("button", { name: /^clear video$/i }));
    await waitFor(() => {
      const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
      const del = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes("/api/video") && (c[1] as RequestInit)?.method === "DELETE");
      expect(del).toBeTruthy();
    });
  });
});
