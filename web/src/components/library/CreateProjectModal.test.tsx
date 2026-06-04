import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateProjectModal } from "./CreateProjectModal";
import * as client from "../../api/client";

beforeEach(() => { vi.restoreAllMocks(); });

function setup(envSameHost = false) {
  vi.spyOn(client, "getEnv").mockResolvedValue({ same_host: envSameHost });
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(<CreateProjectModal onCreated={onCreated} onClose={onClose} />);
  return { onCreated, onClose };
}

describe("CreateProjectModal", () => {
  it("shows Suno advanced options by default and SRT options after switching", async () => {
    setup();
    expect(await screen.findByLabelText(/group by/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    expect(screen.getByLabelText(/line breaks/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/group by/i)).not.toBeInTheDocument();
  });

  it("hides the server-path option when not same-host", async () => {
    setup(false);
    await screen.findByLabelText(/group by/i);
    expect(screen.queryByRole("button", { name: /server path/i })).not.toBeInTheDocument();
  });

  it("shows the server-path option when same-host", async () => {
    setup(true);
    expect(await screen.findByRole("button", { name: /server path/i })).toBeInTheDocument();
  });

  it("shows the N field only for the every-N strategy", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /^SRT$/i }));
    expect(screen.queryByLabelText(/words per line/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/line breaks/i), { target: { value: "every_n" } });
    expect(screen.getByLabelText(/words per line/i)).toBeInTheDocument();
  });

  it("creates and calls onCreated on success", async () => {
    const { onCreated } = setup(false);
    vi.spyOn(client.projects, "create").mockResolvedValue({ opened: "song" });
    await screen.findByLabelText(/group by/i);
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "song" } });
    const file = new File(['{"aligned_lyrics":[]}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("song"));
  });

  it("shows the daemon error inline and stays open", async () => {
    const { onCreated } = setup(false);
    vi.spyOn(client.projects, "create").mockRejectedValue(new Error("name exists"));
    await screen.findByLabelText(/group by/i);
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "dup" } });
    const file = new File(['{}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(await screen.findByText(/name exists/i)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
