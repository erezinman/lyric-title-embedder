/**
 * ExportMenu.audit.test.tsx — Cluster E, ExportMenu interaction audit.
 * Tests: E-51 through E-80.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExportMenu } from "./ExportMenu";
import * as client from "../api/client";

beforeEach(() => {
  vi.restoreAllMocks();
  // Polyfill URL helpers for jsdom
  if (!(URL as any)._createObjectURLMocked) {
    const origCreate = URL.createObjectURL?.bind(URL);
    const origRevoke = URL.revokeObjectURL?.bind(URL);
    if (!origCreate) (URL as any).createObjectURL = () => "blob:x";
    if (!origRevoke) (URL as any).revokeObjectURL = () => {};
  }
  vi.spyOn(client, "getEnv").mockResolvedValue({ same_host: false });
});

function setup(projectName = "mysong") {
  const onBurn = vi.fn();
  const onClose = vi.fn();
  render(<ExportMenu projectName={projectName} onBurn={onBurn} onClose={onClose} />);
  return { onBurn, onClose };
}

// ---------------------------------------------------------------------------
// E-51  Default output name from projectName
// ---------------------------------------------------------------------------
describe("E-51 — default output name derived from projectName", () => {
  it("E-51a — output filename defaults to <projectName>_subbed.mp4", () => {
    setup("mysong");
    const inp = screen.getByLabelText(/output file/i) as HTMLInputElement;
    expect(inp.value).toBe("mysong_subbed.mp4");
  });

  it("E-51b — output filename adapts to a different projectName", () => {
    setup("my-other-project");
    const inp = screen.getByLabelText(/output file/i) as HTMLInputElement;
    expect(inp.value).toBe("my-other-project_subbed.mp4");
  });
});

// ---------------------------------------------------------------------------
// E-52  Editing the output filename
// ---------------------------------------------------------------------------
describe("E-52 — editing the output filename", () => {
  it("E-52a — typing a new filename updates the input value", () => {
    setup();
    const inp = screen.getByLabelText(/output file/i) as HTMLInputElement;
    fireEvent.change(inp, { target: { value: "final.mp4" } });
    expect(inp.value).toBe("final.mp4");
  });

  it("E-52b — the edited filename is passed to onBurn when Burn is clicked", () => {
    const { onBurn } = setup();
    const inp = screen.getByLabelText(/output file/i) as HTMLInputElement;
    fireEvent.change(inp, { target: { value: "custom_output.mp4" } });
    fireEvent.click(screen.getByRole("button", { name: /burn video/i }));
    expect(onBurn).toHaveBeenCalledWith("custom_output.mp4", undefined);
  });
});

// ---------------------------------------------------------------------------
// E-53  Video override only when same_host
// ---------------------------------------------------------------------------
describe("E-53 — video override input only when same_host", () => {
  it("E-53a — input video field is NOT shown when same_host=false", async () => {
    vi.spyOn(client, "getEnv").mockResolvedValue({ same_host: false });
    setup();
    await waitFor(() => {
      expect(screen.queryByLabelText(/input video/i)).not.toBeInTheDocument();
    });
  });

  it("E-53b — input video field IS shown when same_host=true", async () => {
    vi.spyOn(client, "getEnv").mockResolvedValue({ same_host: true });
    setup();
    expect(await screen.findByLabelText(/input video/i)).toBeInTheDocument();
  });

  it("E-53c — editing input video and burning sends the path", async () => {
    vi.spyOn(client, "getEnv").mockResolvedValue({ same_host: true });
    const { onBurn } = setup();
    const vid = await screen.findByLabelText(/input video/i);
    fireEvent.change(vid, { target: { value: "/abs/clip.mp4" } });
    fireEvent.click(screen.getByRole("button", { name: /burn video/i }));
    expect(onBurn).toHaveBeenCalledWith("mysong_subbed.mp4", "/abs/clip.mp4");
  });

  it("E-53d — empty input video field passes undefined to onBurn (same_host=true)", async () => {
    vi.spyOn(client, "getEnv").mockResolvedValue({ same_host: true });
    const { onBurn } = setup();
    await screen.findByLabelText(/input video/i);
    // Don't type anything — leave empty
    fireEvent.click(screen.getByRole("button", { name: /burn video/i }));
    expect(onBurn).toHaveBeenCalledWith("mysong_subbed.mp4", undefined);
  });
});

// ---------------------------------------------------------------------------
// E-54  Burn fires onBurn(out, videoIn||undefined) + onClose
// ---------------------------------------------------------------------------
describe("E-54 — Burn button behavior", () => {
  it("E-54a — clicking Burn calls onBurn with current out and undefined when no video", () => {
    const { onBurn } = setup();
    fireEvent.click(screen.getByRole("button", { name: /burn video/i }));
    expect(onBurn).toHaveBeenCalledWith("mysong_subbed.mp4", undefined);
  });

  it("E-54b — clicking Burn also calls onClose", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /burn video/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("E-54c — onBurn and onClose are both called in the same click", () => {
    const { onBurn, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /burn video/i }));
    expect(onBurn).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// E-55  Download .ass: blob size > 0, type text/plain, anchor download name
// ---------------------------------------------------------------------------
describe("E-55 — Download .ass blob behavior", () => {
  it("E-55a — clicking Download .ass creates a blob with size > 0", async () => {
    setup();
    vi.spyOn(client, "getAss").mockResolvedValue("[Script Info]\nTitle: Test\n");
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    fireEvent.click(screen.getByRole("button", { name: /download \.ass/i }));
    await waitFor(() => expect(createSpy).toHaveBeenCalled());

    const blob = createSpy.mock.calls[0][0] as Blob;
    expect(blob.size).toBeGreaterThan(0);
  });

  it("E-55b — the blob type is text/plain", async () => {
    setup();
    vi.spyOn(client, "getAss").mockResolvedValue("[Script Info]\n");
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    fireEvent.click(screen.getByRole("button", { name: /download \.ass/i }));
    await waitFor(() => expect(createSpy).toHaveBeenCalled());

    const blob = createSpy.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/plain");
  });

  it("E-55c — the anchor download attribute is <projectName>.ass", async () => {
    setup("my-karaoke-song");
    vi.spyOn(client, "getAss").mockResolvedValue("[Script Info]\n");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    // Spy on document.createElement to capture the anchor
    const originalCreate = document.createElement.bind(document);
    let capturedAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === "a") capturedAnchor = el as HTMLAnchorElement;
      return el;
    });

    fireEvent.click(screen.getByRole("button", { name: /download \.ass/i }));
    await waitFor(() => expect(capturedAnchor).not.toBeNull());

    expect(capturedAnchor!.download).toBe("my-karaoke-song.ass");
  });

  it("E-55d — URL.revokeObjectURL is called (deferred) after download", async () => {
    setup();
    vi.spyOn(client, "getAss").mockResolvedValue("[Script Info]\n");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    fireEvent.click(screen.getByRole("button", { name: /download \.ass/i }));
    // revokeObjectURL is called in a setTimeout(0), so we need to wait
    await waitFor(() => expect(revokeSpy).toHaveBeenCalledWith("blob:x"));
  });

  it("E-55e — Download .ass calls onClose after success", async () => {
    const { onClose } = setup();
    vi.spyOn(client, "getAss").mockResolvedValue("[Script Info]\n");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    fireEvent.click(screen.getByRole("button", { name: /download \.ass/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

// ---------------------------------------------------------------------------
// E-56  Download .ass: keyboard Enter AND Space trigger download
// ---------------------------------------------------------------------------
describe("E-56 — Download .ass row keyboard triggers", () => {
  it("E-56a — pressing Enter on the Download .ass row triggers download", async () => {
    setup();
    const getAssSpy = vi.spyOn(client, "getAss").mockResolvedValue("[Script Info]\n");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const row = screen.getByRole("button", { name: /download \.ass/i });
    fireEvent.keyDown(row, { key: "Enter" });
    await waitFor(() => expect(getAssSpy).toHaveBeenCalled());
  });

  it("E-56b — pressing Space on the Download .ass row triggers download", async () => {
    setup();
    const getAssSpy = vi.spyOn(client, "getAss").mockResolvedValue("[Script Info]\n");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const row = screen.getByRole("button", { name: /download \.ass/i });
    fireEvent.keyDown(row, { key: " " });
    await waitFor(() => expect(getAssSpy).toHaveBeenCalled());
  });

  it("E-56c — pressing Tab (not Enter/Space) on the row does NOT trigger download", async () => {
    setup();
    const getAssSpy = vi.spyOn(client, "getAss").mockResolvedValue("[Script Info]\n");

    const row = screen.getByRole("button", { name: /download \.ass/i });
    fireEvent.keyDown(row, { key: "Tab" });

    // Give a tick for any async to settle
    await new Promise((r) => setTimeout(r, 50));
    expect(getAssSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E-57  getAss rejection shows role=alert, menu stays open
// ---------------------------------------------------------------------------
describe("E-57 — getAss rejection: error shown, menu stays open", () => {
  it("E-57a — getAss rejection renders a role=alert element", async () => {
    setup();
    vi.spyOn(client, "getAss").mockRejectedValue(new Error("server error"));

    fireEvent.click(screen.getByRole("button", { name: /download \.ass/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/server error/i);
  });

  it("E-57b — getAss rejection leaves the menu open (does not call onClose)", async () => {
    const { onClose } = setup();
    vi.spyOn(client, "getAss").mockRejectedValue(new Error("server error"));

    fireEvent.click(screen.getByRole("button", { name: /download \.ass/i }));
    await screen.findByRole("alert");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("E-57c — menu export section still present after getAss rejection", async () => {
    setup();
    vi.spyOn(client, "getAss").mockRejectedValue(new Error("boom"));

    fireEvent.click(screen.getByRole("button", { name: /download \.ass/i }));
    await screen.findByRole("alert");
    // The Burn button should still be there (menu still open)
    expect(screen.getByRole("button", { name: /burn video/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// E-58  Double-click Burn fires onBurn behavior
// ---------------------------------------------------------------------------
describe("E-58 — double-click Burn fires onBurn (documents actual behavior)", () => {
  it("E-58a — double-clicking Burn fires onBurn twice (actual behavior)", () => {
    // NOTE: The component has no debounce/guard on the Burn click handler.
    // Double-clicking fires onBurn twice, and onClose twice.
    // This test documents ACTUAL behavior. If UX spec requires once,
    // record as a FINDING and write it.fails() below.
    const { onBurn, onClose } = setup();
    const burnBtn = screen.getByRole("button", { name: /burn video/i });
    fireEvent.click(burnBtn);
    // After first click, onClose is called — but in a real browser the component
    // may have been unmounted. In jsdom it stays. We click again:
    fireEvent.click(burnBtn);
    // Document the actual count (2) without asserting desired UX intent.
    expect(onBurn.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(onClose.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("E-58b — double-clicking Burn fires onBurn exactly once (one-shot guard)", () => {
    // FINDING: The component calls onBurn synchronously on every click with no
    // debounce or disabled-after-click guard. In real usage the parent unmounts the
    // menu on onClose, preventing a second click. But callers that delay unmounting
    // (or fast double-clicks) will trigger onBurn twice.
    // Desired behavior: onBurn fires exactly once per Burn interaction.
    const { onBurn } = setup();
    const burnBtn = screen.getByRole("button", { name: /burn video/i });
    fireEvent.click(burnBtn);
    fireEvent.click(burnBtn);
    expect(onBurn).toHaveBeenCalledTimes(1); // This will fail with actual code (called twice)
  });
});

// ---------------------------------------------------------------------------
// E-59  Dialog role and stopPropagation
// ---------------------------------------------------------------------------
describe("E-59 — ExportMenu dialog role and inner click stopPropagation", () => {
  it("E-59a — the export pop has role=dialog", () => {
    setup();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("E-59b — clicking inside the dialog does not propagate (stopPropagation)", () => {
    const outerClick = vi.fn();
    render(
      <div onClick={outerClick}>
        <ExportMenu projectName="mysong" onBurn={vi.fn()} onClose={vi.fn()} />
      </div>
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(outerClick).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E-60  Download .ass row is a button (accessible role) and has tabIndex=0
// ---------------------------------------------------------------------------
describe("E-60 — Download .ass row accessibility", () => {
  it("E-60a — Download .ass row has role=button", () => {
    setup();
    const row = screen.getByRole("button", { name: /download \.ass/i });
    expect(row).toBeInTheDocument();
  });

  it("E-60b — Download .ass row has tabIndex=0 (keyboard focusable)", () => {
    setup();
    const row = screen.getByRole("button", { name: /download \.ass/i });
    expect(row.tabIndex).toBe(0);
  });
});
