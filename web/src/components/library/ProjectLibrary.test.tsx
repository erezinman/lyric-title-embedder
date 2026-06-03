import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectLibrary } from "./ProjectLibrary";
import * as client from "../../api/client";

describe("ProjectLibrary", () => {
  it("lists projects from the API and opens on click", async () => {
    vi.spyOn(client.projects, "list").mockResolvedValue(["song1", "song2"]);
    const onOpen = vi.fn();
    render(<ProjectLibrary onOpen={onOpen} />);
    await waitFor(() => screen.getByText("song1"));
    await userEvent.click(screen.getByText("song1"));
    expect(onOpen).toHaveBeenCalledWith("song1");
  });
});
