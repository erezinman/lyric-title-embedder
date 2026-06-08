import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExportMenu } from "./ExportMenu";
import * as client from "../api/client";

// Desktop bridge mock with a live getter so isDesktop toggles per test (default off).
const dt = vi.hoisted(() => ({ isDesktop: false, pickOpen: vi.fn(), pickSave: vi.fn() }));
vi.mock("../model/desktop", () => ({
  get isDesktop() { return dt.isDesktop; },
  pickOpen: (o: unknown) => dt.pickOpen(o),
  pickSave: (o: unknown) => dt.pickSave(o),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  dt.isDesktop = false; dt.pickOpen.mockReset(); dt.pickSave.mockReset();
  (URL as any).createObjectURL ??= () => "blob:x";
  (URL as any).revokeObjectURL ??= () => {};
  vi.spyOn(client, "getEnv").mockResolvedValue({ file_access: "native", can_use_server_paths: true, can_burn_video: true });
});

function setup() {
  const onBurn = vi.fn();
  const onClose = vi.fn();
  render(<ExportMenu projectName="mysong" onBurn={onBurn} onClose={onClose} />);
  return { onBurn, onClose };
}

describe("ExportMenu", () => {
  it("downloads the .ass as a blob", async () => {
    setup();
    vi.spyOn(client, "getAss").mockResolvedValue("[Script Info]\n");
    const urlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: /download \.ass/i }));
    await waitFor(() => expect(urlSpy).toHaveBeenCalled());
    const blob = urlSpy.mock.calls[0][0] as Blob;
    expect(blob.size).toBeGreaterThan(0);
  });

  it("burns with the edited output name", () => {
    const { onBurn } = setup();
    const out = screen.getByLabelText(/output file/i) as HTMLInputElement;
    expect(out.value).toBe("mysong_subbed.mp4");
    fireEvent.change(out, { target: { value: "final.mp4" } });
    fireEvent.click(screen.getByRole("button", { name: /burn video/i }));
    expect(onBurn).toHaveBeenCalledWith("final.mp4", undefined);
  });

  it("offers a video override in native mode", async () => {
    const { onBurn } = setup();
    const vid = await screen.findByLabelText(/input video/i);
    fireEvent.change(vid, { target: { value: "/abs/clip.mp4" } });
    fireEvent.click(screen.getByRole("button", { name: /burn video/i }));
    expect(onBurn).toHaveBeenCalledWith("mysong_subbed.mp4", "/abs/clip.mp4");
  });
});

describe("ExportMenu — desktop Browse…", () => {
  it("Browse… sets the burn output path via the native save picker", async () => {
    dt.isDesktop = true;
    dt.pickSave.mockResolvedValue("/abs/out.mp4");
    setup();
    const browse = await screen.findByRole("button", { name: /browse output/i });
    fireEvent.click(browse);
    await waitFor(() =>
      expect((screen.getByLabelText(/output file/i) as HTMLInputElement).value).toBe("/abs/out.mp4"));
  });

  it("no Browse… buttons when not desktop", async () => {
    setup();
    await screen.findByLabelText(/output file/i);
    expect(screen.queryByRole("button", { name: /browse output/i })).not.toBeInTheDocument();
  });
});
