/**
 * ProjectLibrary.audit.test.tsx — Cluster E, ProjectLibrary interaction audit.
 * Tests: E-01 through E-10.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProjectLibrary } from "./ProjectLibrary";
import * as client from "../../api/client";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(client, "getEnv").mockResolvedValue({ file_access: "native", can_use_server_paths: true, can_burn_video: true });
});

// ---------------------------------------------------------------------------
// E-01  Library lists projects from projects.list
// ---------------------------------------------------------------------------
describe("E-01 — library lists projects from projects.list", () => {
  it("E-01a — renders a card for each name returned by projects.list", async () => {
    vi.spyOn(client.projects, "list").mockResolvedValue(["alpha", "bravo", "charlie"]);
    render(<ProjectLibrary onOpen={vi.fn()} />);
    expect(await screen.findByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("bravo")).toBeInTheDocument();
    expect(screen.getByText("charlie")).toBeInTheDocument();
  });

  it("E-01b — renders no project cards when list returns []", async () => {
    vi.spyOn(client.projects, "list").mockResolvedValue([]);
    const { container } = render(<ProjectLibrary onOpen={vi.fn()} />);
    // Wait for the list effect to settle (the "New project" card is always present)
    await waitFor(() => {
      const grid = container.querySelector(".lib-grid");
      expect(grid).toBeInTheDocument();
    });
    // Only the "new" card should be in the grid, no .nm elements
    const nms = container.querySelectorAll(".nm");
    expect(nms).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// E-02  Clicking a project card calls onOpen(name)
// ---------------------------------------------------------------------------
describe("E-02 — clicking a project card calls onOpen(name)", () => {
  it("E-02a — clicking the card for 'alpha' calls onOpen('alpha')", async () => {
    vi.spyOn(client.projects, "list").mockResolvedValue(["alpha", "bravo"]);
    const onOpen = vi.fn();
    render(<ProjectLibrary onOpen={onOpen} />);
    fireEvent.click(await screen.findByText("alpha"));
    expect(onOpen).toHaveBeenCalledWith("alpha");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("E-02b — clicking different cards calls onOpen with their respective names", async () => {
    vi.spyOn(client.projects, "list").mockResolvedValue(["alpha", "bravo"]);
    const onOpen = vi.fn();
    render(<ProjectLibrary onOpen={onOpen} />);
    await screen.findByText("alpha");
    fireEvent.click(screen.getByText("bravo"));
    expect(onOpen).toHaveBeenCalledWith("bravo");
  });
});

// ---------------------------------------------------------------------------
// E-03  Both New-project entry points open the modal
// ---------------------------------------------------------------------------
describe("E-03 — both New-project entry points open the modal", () => {
  it("E-03a — header 'New project' button opens the create modal", async () => {
    vi.spyOn(client.projects, "list").mockResolvedValue([]);
    render(<ProjectLibrary onOpen={vi.fn()} />);
    // The header button is the first button with 'New project' text
    const buttons = screen.getAllByRole("button", { name: /new project/i });
    fireEvent.click(buttons[0]);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /new project/i })).toBeInTheDocument()
    );
  });

  it("E-03b — grid 'New project' card opens the create modal", async () => {
    vi.spyOn(client.projects, "list").mockResolvedValue([]);
    const { container } = render(<ProjectLibrary onOpen={vi.fn()} />);
    // Wait for render; click the `.proj.new` grid card
    await waitFor(() => expect(container.querySelector(".proj.new")).toBeInTheDocument());
    fireEvent.click(container.querySelector(".proj.new") as HTMLElement);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /new project/i })).toBeInTheDocument()
    );
  });

  it("E-03c — both entry points lead to the same modal (heading present)", async () => {
    vi.spyOn(client.projects, "list").mockResolvedValue([]);
    const { container, unmount } = render(<ProjectLibrary onOpen={vi.fn()} />);
    await waitFor(() => expect(container.querySelector(".proj.new")).toBeInTheDocument());

    // Via grid card
    fireEvent.click(container.querySelector(".proj.new") as HTMLElement);
    const heading = await screen.findByRole("heading", { name: /new project/i });
    expect(heading).toBeInTheDocument();
    unmount();
  });
});

// ---------------------------------------------------------------------------
// E-04  Modal close returns to library intact
// ---------------------------------------------------------------------------
describe("E-04 — modal close returns to library intact", () => {
  it("E-04a — after closing the modal, the library heading is still visible", async () => {
    vi.spyOn(client.projects, "list").mockResolvedValue(["song-1"]);
    render(<ProjectLibrary onOpen={vi.fn()} />);
    await screen.findByText("song-1");

    // Open modal via header button
    fireEvent.click(screen.getAllByRole("button", { name: /new project/i })[0]);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /new project/i })).toBeInTheDocument()
    );

    // Close via × button
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /new project/i })).not.toBeInTheDocument()
    );

    // Library content still present
    expect(screen.getByText("Your projects")).toBeInTheDocument();
    expect(screen.getByText("song-1")).toBeInTheDocument();
  });

  it("E-04b — project cards remain clickable after modal close", async () => {
    vi.spyOn(client.projects, "list").mockResolvedValue(["song-1"]);
    const onOpen = vi.fn();
    render(<ProjectLibrary onOpen={onOpen} />);
    await screen.findByText("song-1");

    // Open and close modal
    fireEvent.click(screen.getAllByRole("button", { name: /new project/i })[0]);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /new project/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /new project/i })).not.toBeInTheDocument()
    );

    // Card still works
    fireEvent.click(screen.getByText("song-1"));
    expect(onOpen).toHaveBeenCalledWith("song-1");
  });
});

// ---------------------------------------------------------------------------
// E-05  List failure renders empty grid without crash
// ---------------------------------------------------------------------------
describe("E-05 — list failure renders empty grid without crash", () => {
  it("E-05a — rejected projects.list results in no project cards, no error thrown", async () => {
    vi.spyOn(client.projects, "list").mockRejectedValue(new Error("network error"));
    const { container } = render(<ProjectLibrary onOpen={vi.fn()} />);
    // Should not crash — wait for effect to settle
    await waitFor(() => {
      const grid = container.querySelector(".lib-grid");
      expect(grid).toBeInTheDocument();
    });
    expect(container.querySelectorAll(".nm")).toHaveLength(0);
    // Library chrome still present
    expect(screen.getByText("Your projects")).toBeInTheDocument();
  });

  it("E-05b — after list failure, New project entry points are still functional", async () => {
    vi.spyOn(client.projects, "list").mockRejectedValue(new Error("network error"));
    render(<ProjectLibrary onOpen={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Your projects")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: /new project/i })[0]);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /new project/i })).toBeInTheDocument()
    );
  });
});

// ---------------------------------------------------------------------------
// E-06  onCreated callback closes modal and opens project
// ---------------------------------------------------------------------------
describe("E-06 — onCreated closes modal and calls onOpen(name)", () => {
  it("E-06a — successful create closes modal and calls onOpen with returned name", async () => {
    vi.spyOn(client.projects, "list").mockResolvedValue([]);
    vi.spyOn(client, "getEnv").mockResolvedValue({ file_access: "native", can_use_server_paths: true, can_burn_video: true });
    vi.spyOn(client.projects, "create").mockResolvedValue({ opened: "new-song" });
    const onOpen = vi.fn();
    render(<ProjectLibrary onOpen={onOpen} />);

    // Open modal
    await waitFor(() => screen.getAllByRole("button", { name: /new project/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /new project/i })[0]);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /new project/i })).toBeInTheDocument()
    );

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/project name/i), { target: { value: "new-song" } });
    const file = new File(['{"aligned_lyrics":[]}'], "a.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/lyrics file/i), { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("new-song"));
    // Modal should be gone
    expect(screen.queryByRole("heading", { name: /new project/i })).not.toBeInTheDocument();
  });
});
