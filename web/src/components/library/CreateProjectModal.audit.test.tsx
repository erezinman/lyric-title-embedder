/**
 * CreateProjectModal.audit.test.tsx — Cluster E, CreateProjectModal interaction audit.
 * Tests: E-11 through E-50.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateProjectModal } from "./CreateProjectModal";
import * as client from "../../api/client";

beforeEach(() => {
  vi.restoreAllMocks();
});

function setup(sameHost = false) {
  vi.spyOn(client, "getEnv").mockResolvedValue({ same_host: sameHost });
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(<CreateProjectModal onCreated={onCreated} onClose={onClose} />);
  return { onCreated, onClose };
}

// ---------------------------------------------------------------------------
// E-11  Source toggle Suno ⇄ SRT: advanced section swap
// ---------------------------------------------------------------------------
describe("E-11 — source toggle Suno⇄SRT swaps advanced fields", () => {
  it("E-11a — Suno default shows group_by and skip_dashes, not line_break/n_words", async () => {
    setup();
    expect(await screen.findByLabelText(/group by/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/line breaks/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/words per line/i)).not.toBeInTheDocument();
  });

  it("E-11b — switching to SRT shows line_break, hides group_by and skip_dashes", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    expect(screen.getByLabelText(/line breaks/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/group by/i)).not.toBeInTheDocument();
    // skip_dashes is a checkbox; the span text should not appear
    expect(screen.queryByText(/skip dash/i)).not.toBeInTheDocument();
  });

  it("E-11c — toggling back to Suno restores group_by field", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    expect(screen.queryByLabelText(/group by/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Suno JSON$/i }));
    expect(screen.getByLabelText(/group by/i)).toBeInTheDocument();
  });

  it("E-11d — toggling back to Suno after setting group_by=line preserves the 'line' selection", async () => {
    setup();
    const groupBy = await screen.findByLabelText(/group by/i);
    fireEvent.change(groupBy, { target: { value: "line" } });
    expect((groupBy as HTMLSelectElement).value).toBe("line");

    // Switch to SRT then back
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Suno JSON$/i }));

    const restoredGroupBy = screen.getByLabelText(/group by/i) as HTMLSelectElement;
    expect(restoredGroupBy.value).toBe("line");
  });

  it("E-11e — toggling back to Suno after setting skip_dashes to false preserves unchecked state", async () => {
    setup();
    await screen.findByLabelText(/group by/i);

    // skip_dashes defaults to true; uncheck it
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);

    // Switch to SRT then back
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Suno JSON$/i }));

    const restored = screen.getByRole("checkbox") as HTMLInputElement;
    expect(restored.checked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E-12  accept= attribute on lyrics file input switches with source
// ---------------------------------------------------------------------------
describe("E-12 — lyrics file input accept attribute switches with source", () => {
  it("E-12a — Suno source: lyrics file input accepts .json", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    const fileInput = screen.getByLabelText(/lyrics file/i) as HTMLInputElement;
    expect(fileInput.accept).toContain(".json");
  });

  it("E-12b — SRT source: lyrics file input accepts .srt", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    const fileInput = screen.getByLabelText(/lyrics file/i) as HTMLInputElement;
    expect(fileInput.accept).toContain(".srt");
  });

  it("E-12c — toggling back to Suno restores .json accept", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Suno JSON$/i }));
    const fileInput = screen.getByLabelText(/lyrics file/i) as HTMLInputElement;
    expect(fileInput.accept).toContain(".json");
  });
});

// ---------------------------------------------------------------------------
// E-13  Upload ⇄ Server-path mode switching (same_host:true)
// ---------------------------------------------------------------------------
describe("E-13 — upload⇄server-path mode switching (same_host:true)", () => {
  it("E-13a — switching lyrics to path shows lyrics path input, hides file input", async () => {
    setup(true);
    await screen.findByLabelText(/group by/i);
    const serverPathBtns = await screen.findAllByRole("button", { name: /server path/i });
    fireEvent.click(serverPathBtns[0]); // lyrics server path
    expect(screen.getByLabelText(/lyrics server path/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/lyrics file/i)).not.toBeInTheDocument();
  });

  it("E-13b — switching lyrics back to upload restores file input", async () => {
    setup(true);
    await screen.findByLabelText(/group by/i);
    const serverPathBtns = await screen.findAllByRole("button", { name: /server path/i });
    fireEvent.click(serverPathBtns[0]); // switch to path
    fireEvent.click(screen.getAllByRole("button", { name: /^Upload$/i })[0]); // switch back
    expect(screen.getByLabelText(/lyrics file/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/lyrics server path/i)).not.toBeInTheDocument();
  });

  it("E-13c — switching lyrics modes twice (upload→path→upload) restores file input", async () => {
    setup(true);
    await screen.findByLabelText(/group by/i);
    const serverBtns = await screen.findAllByRole("button", { name: /server path/i });

    fireEvent.click(serverBtns[0]); // to path
    expect(screen.getByLabelText(/lyrics server path/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /^Upload$/i })[0]); // back to upload
    expect(screen.getByLabelText(/lyrics file/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/lyrics server path/i)).not.toBeInTheDocument();
  });

  it("E-13d — path value is preserved across a path→upload→path round-trip", async () => {
    // NOTE: This test documents DESIRED behavior. If it fails, the finding is
    // that the path state is reset when switching modes (not persisted across round-trip).
    setup(true);
    await screen.findByLabelText(/group by/i);
    const serverBtns = await screen.findAllByRole("button", { name: /server path/i });

    // Enter path
    fireEvent.click(serverBtns[0]);
    fireEvent.change(screen.getByLabelText(/lyrics server path/i), { target: { value: "/data/song.json" } });

    // Switch to upload then back to path
    fireEvent.click(screen.getAllByRole("button", { name: /^Upload$/i })[0]);
    const serverBtns2 = screen.getAllByRole("button", { name: /server path/i });
    fireEvent.click(serverBtns2[0]);

    // Path value should still be /data/song.json (state preserved in React)
    const pathInput = screen.getByLabelText(/lyrics server path/i) as HTMLInputElement;
    expect(pathInput.value).toBe("/data/song.json");
  });

  it("E-13e — video path follows same round-trip preservation pattern", async () => {
    setup(true);
    await screen.findByLabelText(/group by/i);
    const serverBtns = await screen.findAllByRole("button", { name: /server path/i });

    // Switch video to path
    fireEvent.click(serverBtns[1]);
    fireEvent.change(screen.getByLabelText(/video server path/i), { target: { value: "/media/clip.mp4" } });

    // Switch back and forth
    fireEvent.click(screen.getAllByRole("button", { name: /^Upload$/i })[1]);
    const serverBtns2 = screen.getAllByRole("button", { name: /server path/i });
    fireEvent.click(serverBtns2[1]);

    const pathInput = screen.getByLabelText(/video server path/i) as HTMLInputElement;
    expect(pathInput.value).toBe("/media/clip.mp4");
  });
});

// ---------------------------------------------------------------------------
// E-14  same_host:false hides BOTH path options
// ---------------------------------------------------------------------------
describe("E-14 — same_host:false hides both path options", () => {
  it("E-14a — no server-path buttons when same_host=false", async () => {
    setup(false);
    await screen.findByLabelText(/group by/i);
    expect(screen.queryByRole("button", { name: /server path/i })).not.toBeInTheDocument();
  });

  it("E-14b — lyrics file input is shown (upload mode), not path input", async () => {
    setup(false);
    await screen.findByLabelText(/group by/i);
    expect(screen.getByLabelText(/lyrics file/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/lyrics server path/i)).not.toBeInTheDocument();
  });

  it("E-14c — video file input is shown (upload mode), not path input", async () => {
    setup(false);
    await screen.findByLabelText(/group by/i);
    expect(screen.getByLabelText(/video file/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/video server path/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// E-15  Every field: name input
// ---------------------------------------------------------------------------
describe("E-15 — name input field", () => {
  it("E-15a — project name input starts empty", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    const inp = screen.getByLabelText(/project name/i) as HTMLInputElement;
    expect(inp.value).toBe("");
  });

  it("E-15b — typing into name input updates its value", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    const inp = screen.getByLabelText(/project name/i) as HTMLInputElement;
    fireEvent.change(inp, { target: { value: "my-song" } });
    expect(inp.value).toBe("my-song");
  });
});

// ---------------------------------------------------------------------------
// E-16  Every field: lyrics file / path
// ---------------------------------------------------------------------------
describe("E-16 — lyrics file / path fields", () => {
  it("E-16a — lyrics file input is type=file", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    const inp = screen.getByLabelText(/lyrics file/i) as HTMLInputElement;
    expect(inp.type).toBe("file");
  });

  it("E-16b — lyrics server path input accepts typed text (same_host)", async () => {
    setup(true);
    await screen.findByLabelText(/group by/i);
    const serverBtns = await screen.findAllByRole("button", { name: /server path/i });
    fireEvent.click(serverBtns[0]);
    const inp = screen.getByLabelText(/lyrics server path/i) as HTMLInputElement;
    fireEvent.change(inp, { target: { value: "/music/file.json" } });
    expect(inp.value).toBe("/music/file.json");
  });
});

// ---------------------------------------------------------------------------
// E-17  Every field: video file / path
// ---------------------------------------------------------------------------
describe("E-17 — video file / path fields", () => {
  it("E-17a — video file input accepts video/* MIME types", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    const inp = screen.getByLabelText(/video file/i) as HTMLInputElement;
    expect(inp.accept).toContain("video/");
  });

  it("E-17b — video server path input works when same_host and in path mode", async () => {
    setup(true);
    await screen.findByLabelText(/group by/i);
    const serverBtns = await screen.findAllByRole("button", { name: /server path/i });
    fireEvent.click(serverBtns[1]); // video server path
    const inp = screen.getByLabelText(/video server path/i) as HTMLInputElement;
    fireEvent.change(inp, { target: { value: "/videos/clip.mp4" } });
    expect(inp.value).toBe("/videos/clip.mp4");
  });
});

// ---------------------------------------------------------------------------
// E-18  Every field: group_by select (Suno)
// ---------------------------------------------------------------------------
describe("E-18 — group_by select (Suno mode)", () => {
  it("E-18a — group_by defaults to 'section'", async () => {
    setup();
    const sel = await screen.findByLabelText(/group by/i) as HTMLSelectElement;
    expect(sel.value).toBe("section");
  });

  it("E-18b — can change group_by to 'line'", async () => {
    setup();
    const sel = await screen.findByLabelText(/group by/i) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: "line" } });
    expect(sel.value).toBe("line");
  });

  it("E-18c — can change group_by back to 'section'", async () => {
    setup();
    const sel = await screen.findByLabelText(/group by/i) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: "line" } });
    fireEvent.change(sel, { target: { value: "section" } });
    expect(sel.value).toBe("section");
  });
});

// ---------------------------------------------------------------------------
// E-19  Every field: skip_dashes checkbox (Suno) — revert
// ---------------------------------------------------------------------------
describe("E-19 — skip_dashes checkbox (Suno mode)", () => {
  it("E-19a — skip_dashes checkbox defaults to checked (true)", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    const cb = screen.getByRole("checkbox") as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it("E-19b — clicking unchecks skip_dashes", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    const cb = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(cb);
    expect(cb.checked).toBe(false);
  });

  it("E-19c — double-click on skip_dashes reverts to checked (action→revert)", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    const cb = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(cb); // uncheck
    expect(cb.checked).toBe(false);
    fireEvent.click(cb); // re-check (revert)
    expect(cb.checked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E-20  Every field: line_break select all 4 options (SRT)
// ---------------------------------------------------------------------------
describe("E-20 — line_break select (SRT mode)", () => {
  it("E-20a — line_break select defaults to 'none'", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    const sel = screen.getByLabelText(/line breaks/i) as HTMLSelectElement;
    expect(sel.value).toBe("none");
  });

  it("E-20b — line_break can be set to 'every_n'", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    const sel = screen.getByLabelText(/line breaks/i) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: "every_n" } });
    expect(sel.value).toBe("every_n");
  });

  it("E-20c — line_break can be set to 'punctuation'", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    const sel = screen.getByLabelText(/line breaks/i) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: "punctuation" } });
    expect(sel.value).toBe("punctuation");
  });

  it("E-20d — line_break can be set to 'per_cue'", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    const sel = screen.getByLabelText(/line breaks/i) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: "per_cue" } });
    expect(sel.value).toBe("per_cue");
  });

  it("E-20e — all 4 line_break options are present in the select", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    const sel = screen.getByLabelText(/line breaks/i) as HTMLSelectElement;
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values).toContain("none");
    expect(values).toContain("every_n");
    expect(values).toContain("punctuation");
    expect(values).toContain("per_cue");
  });
});

// ---------------------------------------------------------------------------
// E-21  n_words field: only shown for every_n, min 1 clamp, double-step
// ---------------------------------------------------------------------------
describe("E-21 — n_words field (SRT every_n)", () => {
  it("E-21a — n_words field not shown for other line_break modes", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    expect(screen.queryByLabelText(/words per line/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/line breaks/i), { target: { value: "punctuation" } });
    expect(screen.queryByLabelText(/words per line/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/line breaks/i), { target: { value: "per_cue" } });
    expect(screen.queryByLabelText(/words per line/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/line breaks/i), { target: { value: "none" } });
    expect(screen.queryByLabelText(/words per line/i)).not.toBeInTheDocument();
  });

  it("E-21b — n_words field shown when line_break=every_n", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    fireEvent.change(screen.getByLabelText(/line breaks/i), { target: { value: "every_n" } });
    expect(screen.getByLabelText(/words per line/i)).toBeInTheDocument();
  });

  it("E-21c — n_words defaults to 5", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    fireEvent.change(screen.getByLabelText(/line breaks/i), { target: { value: "every_n" } });
    const inp = screen.getByLabelText(/words per line/i) as HTMLInputElement;
    expect(Number(inp.value)).toBe(5);
  });

  it("E-21d — n_words clamps to minimum 1 when 0 is entered", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    fireEvent.change(screen.getByLabelText(/line breaks/i), { target: { value: "every_n" } });
    const inp = screen.getByLabelText(/words per line/i) as HTMLInputElement;
    fireEvent.change(inp, { target: { value: "0" } });
    expect(Number(inp.value)).toBeGreaterThanOrEqual(1);
  });

  it("E-21e — n_words clamps to minimum 1 when negative is entered", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    fireEvent.change(screen.getByLabelText(/line breaks/i), { target: { value: "every_n" } });
    const inp = screen.getByLabelText(/words per line/i) as HTMLInputElement;
    fireEvent.change(inp, { target: { value: "-3" } });
    expect(Number(inp.value)).toBeGreaterThanOrEqual(1);
  });

  it("E-21f — n_words double-step: change from 5 to 10 then to 20", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    fireEvent.change(screen.getByLabelText(/line breaks/i), { target: { value: "every_n" } });
    const inp = screen.getByLabelText(/words per line/i) as HTMLInputElement;
    fireEvent.change(inp, { target: { value: "10" } });
    expect(Number(inp.value)).toBe(10);
    fireEvent.change(inp, { target: { value: "20" } });
    expect(Number(inp.value)).toBe(20);
  });

  it("E-21g — n_words has min=1 attribute on the input", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    fireEvent.change(screen.getByLabelText(/line breaks/i), { target: { value: "every_n" } });
    const inp = screen.getByLabelText(/words per line/i) as HTMLInputElement;
    expect(inp.min).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// E-22  Create gating: disabled states
// ---------------------------------------------------------------------------
describe("E-22 — Create button gating", () => {
  it("E-22a — Create is disabled when name is empty (no lyrics either)", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    const btn = screen.getByRole("button", { name: /^create$/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("E-22b — Create is disabled with name but no lyrics file selected", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "my-song" } });
    const btn = screen.getByRole("button", { name: /^create$/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("E-22c — Create is disabled with lyrics file but empty name", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    const file = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });
    const btn = screen.getByRole("button", { name: /^create$/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("E-22d — Create is enabled with name + lyrics file", async () => {
    setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "my-song" } });
    const file = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });
    const btn = screen.getByRole("button", { name: /^create$/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("E-22e — Create is disabled with name + empty path (path mode, same_host)", async () => {
    setup(true);
    await screen.findByLabelText(/group by/i);
    const serverBtns = await screen.findAllByRole("button", { name: /server path/i });
    fireEvent.click(serverBtns[0]); // switch lyrics to path mode
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "my-song" } });
    // path is empty, Create should be disabled
    const btn = screen.getByRole("button", { name: /^create$/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("E-22f — Create is enabled with name + non-empty server path (path mode, same_host)", async () => {
    setup(true);
    await screen.findByLabelText(/group by/i);
    const serverBtns = await screen.findAllByRole("button", { name: /server path/i });
    fireEvent.click(serverBtns[0]);
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "my-song" } });
    fireEvent.change(screen.getByLabelText(/lyrics server path/i), { target: { value: "/data/song.json" } });
    const btn = screen.getByRole("button", { name: /^create$/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E-23  Busy state disables Create and Cancel
// ---------------------------------------------------------------------------
describe("E-23 — busy state disables Create and Cancel", () => {
  it("E-23a — while creating (busy), Create button is disabled", async () => {
    const { onCreated } = setup(false);
    // Hang create so we can check the busy state
    let resolve!: (v: { opened: string }) => void;
    vi.spyOn(client.projects, "create").mockReturnValue(new Promise((r) => { resolve = r; }));
    await screen.findByLabelText(/group by/i);

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "song" } });
    const file = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    // Busy — Create should be disabled
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /^create$/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    // Resolve so we don't leave the promise hanging
    resolve({ opened: "song" });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("E-23b — while creating (busy), Cancel button is disabled", async () => {
    setup(false);
    let resolve!: (v: { opened: string }) => void;
    vi.spyOn(client.projects, "create").mockReturnValue(new Promise((r) => { resolve = r; }));
    await screen.findByLabelText(/group by/i);

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "song" } });
    const file = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      const cancel = screen.getByRole("button", { name: /^cancel$/i }) as HTMLButtonElement;
      expect(cancel.disabled).toBe(true);
    });

    resolve({ opened: "song" });
    await waitFor(() => {
      const cancel = screen.getByRole("button", { name: /^cancel$/i }) as HTMLButtonElement;
      expect(cancel.disabled).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// E-24  Create success: FormData keys for Suno
// ---------------------------------------------------------------------------
describe("E-24 — FormData keys on successful Suno create", () => {
  it("E-24a — Suno create posts: name, source=suno_json, lyrics_file, group_by, skip_dashes", async () => {
    const { onCreated } = setup(false);
    const createSpy = vi.spyOn(client.projects, "create").mockResolvedValue({ opened: "my-song" });
    await screen.findByLabelText(/group by/i);

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "my-song" } });
    const file = new File(['{"aligned_lyrics":[]}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("my-song"));

    const fd: FormData = createSpy.mock.calls[0][0];
    expect(fd.get("name")).toBe("my-song");
    expect(fd.get("source")).toBe("suno_json");
    expect(fd.get("lyrics_file")).toBe(file);
    expect(fd.get("group_by")).toBe("section"); // default
    expect(fd.get("skip_dashes")).toBe("true");  // default
  });

  it("E-24b — Suno create with group_by=line posts group_by=line", async () => {
    const { onCreated } = setup(false);
    const createSpy = vi.spyOn(client.projects, "create").mockResolvedValue({ opened: "my-song" });
    await screen.findByLabelText(/group by/i);

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "my-song" } });
    const file = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/group by/i), { target: { value: "line" } });

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    const fd: FormData = createSpy.mock.calls[0][0];
    expect(fd.get("group_by")).toBe("line");
  });

  it("E-24c — Suno create with skip_dashes unchecked posts skip_dashes=false", async () => {
    const { onCreated } = setup(false);
    const createSpy = vi.spyOn(client.projects, "create").mockResolvedValue({ opened: "my-song" });
    await screen.findByLabelText(/group by/i);

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "my-song" } });
    const file = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("checkbox")); // uncheck

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    const fd: FormData = createSpy.mock.calls[0][0];
    expect(fd.get("skip_dashes")).toBe("false");
  });

  it("E-24d — Suno create does NOT include SRT-specific keys (line_break, n_words)", async () => {
    const { onCreated } = setup(false);
    const createSpy = vi.spyOn(client.projects, "create").mockResolvedValue({ opened: "my-song" });
    await screen.findByLabelText(/group by/i);

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "my-song" } });
    const file = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    const fd: FormData = createSpy.mock.calls[0][0];
    expect(fd.get("line_break")).toBeNull();
    expect(fd.get("n_words")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// E-25  Create success: FormData keys for SRT
// ---------------------------------------------------------------------------
describe("E-25 — FormData keys on successful SRT create", () => {
  it("E-25a — SRT create posts: name, source=srt, lyrics_file, line_break, n_words (none)", async () => {
    const { onCreated } = setup(false);
    const createSpy = vi.spyOn(client.projects, "create").mockResolvedValue({ opened: "my-srt" });
    await screen.findByLabelText(/group by/i);

    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "my-srt" } });
    const file = new File(["1\n00:00:01,000 --> 00:00:02,000\nHello"], "a.srt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("my-srt"));

    const fd: FormData = createSpy.mock.calls[0][0];
    expect(fd.get("name")).toBe("my-srt");
    expect(fd.get("source")).toBe("srt");
    expect(fd.get("lyrics_file")).toBe(file);
    expect(fd.get("line_break")).toBe("none");
    expect(fd.get("n_words")).toBe("5"); // default
  });

  it("E-25b — SRT create with every_n includes n_words in FormData", async () => {
    const { onCreated } = setup(false);
    const createSpy = vi.spyOn(client.projects, "create").mockResolvedValue({ opened: "my-srt" });
    await screen.findByLabelText(/group by/i);

    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "my-srt" } });
    const file = new File(["1\n00:00:01,000 --> 00:00:02,000\nHello"], "a.srt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/line breaks/i), { target: { value: "every_n" } });
    fireEvent.change(screen.getByLabelText(/words per line/i), { target: { value: "8" } });

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    const fd: FormData = createSpy.mock.calls[0][0];
    expect(fd.get("line_break")).toBe("every_n");
    expect(fd.get("n_words")).toBe("8");
  });

  it("E-25c — SRT create does NOT include Suno-specific keys (group_by, skip_dashes)", async () => {
    const { onCreated } = setup(false);
    const createSpy = vi.spyOn(client.projects, "create").mockResolvedValue({ opened: "my-srt" });
    await screen.findByLabelText(/group by/i);

    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "my-srt" } });
    const file = new File(["x"], "a.srt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    const fd: FormData = createSpy.mock.calls[0][0];
    expect(fd.get("group_by")).toBeNull();
    expect(fd.get("skip_dashes")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// E-26  Create: video included only when chosen
// ---------------------------------------------------------------------------
describe("E-26 — video included in FormData only when chosen", () => {
  it("E-26a — video NOT included when no video file selected", async () => {
    const { onCreated } = setup(false);
    const createSpy = vi.spyOn(client.projects, "create").mockResolvedValue({ opened: "s" });
    await screen.findByLabelText(/group by/i);

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "s" } });
    const lf = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [lf] } });

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    const fd: FormData = createSpy.mock.calls[0][0];
    // No video_file set — should be null
    expect(fd.get("video_file")).toBeNull();
  });

  it("E-26b — video_file IS included when a video file is selected", async () => {
    const { onCreated } = setup(false);
    const createSpy = vi.spyOn(client.projects, "create").mockResolvedValue({ opened: "s" });
    await screen.findByLabelText(/group by/i);

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "s" } });
    const lf = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [lf] } });
    const vf = new File(["videodata"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText(/video file/i), { target: { files: [vf] } });

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    const fd: FormData = createSpy.mock.calls[0][0];
    expect(fd.get("video_file")).toBe(vf);
  });

  it("E-26c — video_path included only when non-empty (same_host path mode)", async () => {
    const { onCreated } = setup(true);
    const createSpy = vi.spyOn(client.projects, "create").mockResolvedValue({ opened: "s" });
    await screen.findByLabelText(/group by/i);

    // Switch lyrics to path mode first (index 0), then video (index 1)
    const serverBtns = await screen.findAllByRole("button", { name: /server path/i });
    fireEvent.click(serverBtns[0]); // lyrics → path
    fireEvent.change(screen.getByLabelText(/lyrics server path/i), { target: { value: "/music/a.json" } });

    // Now get fresh button list and switch video to path
    const serverBtns2 = screen.getAllByRole("button", { name: /server path/i });
    fireEvent.click(serverBtns2[1]); // video → path
    fireEvent.change(screen.getByLabelText(/video server path/i), { target: { value: "/media/clip.mp4" } });

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "s" } });

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    const fd: FormData = createSpy.mock.calls[0][0];
    expect(fd.get("video_path")).toBe("/media/clip.mp4");
  });
});

// ---------------------------------------------------------------------------
// E-27  Modal error path
// ---------------------------------------------------------------------------
describe("E-27 — modal error path: rejected create shows banner, modal stays, Create re-enabled", () => {
  it("E-27a — rejected create shows error banner with message", async () => {
    setup(false);
    vi.spyOn(client.projects, "create").mockRejectedValue(new Error("already exists"));
    await screen.findByLabelText(/group by/i);

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "dup" } });
    const file = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/already exists/i);
  });

  it("E-27b — after rejected create, modal is still open (heading present)", async () => {
    const { onCreated, onClose } = setup(false);
    vi.spyOn(client.projects, "create").mockRejectedValue(new Error("boom"));
    await screen.findByLabelText(/group by/i);

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "dup" } });
    const file = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await screen.findByRole("alert");
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /new project/i })).toBeInTheDocument();
  });

  it("E-27c — after rejected create, Create button is re-enabled", async () => {
    setup(false);
    vi.spyOn(client.projects, "create").mockRejectedValue(new Error("boom"));
    await screen.findByLabelText(/group by/i);

    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "dup" } });
    const file = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await screen.findByRole("alert");
    const btn = screen.getByRole("button", { name: /^create$/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E-28  Overlay click closes; inner click does NOT; Close (×) and Cancel close
// ---------------------------------------------------------------------------
describe("E-28 — modal close mechanics", () => {
  it("E-28a — clicking the overlay (.modal-overlay) calls onClose", async () => {
    const { onClose } = setup();
    await screen.findByLabelText(/group by/i);
    const overlay = document.querySelector(".modal-overlay") as HTMLElement;
    expect(overlay).toBeInTheDocument();
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("E-28b — clicking inside the modal (.modal) does NOT call onClose", async () => {
    const { onClose } = setup();
    await screen.findByLabelText(/group by/i);
    const modal = document.querySelector(".modal.cpm") as HTMLElement;
    expect(modal).toBeInTheDocument();
    fireEvent.click(modal);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("E-28c — clicking the × button calls onClose", async () => {
    const { onClose } = setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("E-28d — clicking Cancel calls onClose", async () => {
    const { onClose } = setup();
    await screen.findByLabelText(/group by/i);
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
