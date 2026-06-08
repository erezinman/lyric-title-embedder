import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProjectLibrary } from "./ProjectLibrary";
import * as client from "../../api/client";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(client.projects, "list").mockResolvedValue([]);
  vi.spyOn(client, "getEnv").mockResolvedValue({ file_access: "native", can_use_server_paths: true, can_burn_video: true });
});

describe("ProjectLibrary", () => {
  it("opens the create modal instead of calling onOpen('')", async () => {
    const onOpen = vi.fn();
    render(<ProjectLibrary onOpen={onOpen} />);
    fireEvent.click(screen.getAllByRole("button", { name: /new project/i })[0]);
    await waitFor(() => expect(screen.getByRole("heading", { name: /new project/i })).toBeInTheDocument());
    expect(onOpen).not.toHaveBeenCalled();
  });
});
