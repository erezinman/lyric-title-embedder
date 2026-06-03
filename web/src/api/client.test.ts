import { describe, it, expect, vi, beforeEach } from "vitest";
import { call, getFrameUrl, projects, burn } from "./client";

beforeEach(() => { vi.restoreAllMocks(); });

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }) as Response
  );
}

describe("call", () => {
  it("POSTs {tool,args} and unwraps result", async () => {
    const f = mockFetch(200, { result: { gi: 0 } });
    const r = await call("set_group_style", { gi: 0, partial: { bold: true } });
    expect(r).toEqual({ gi: 0 });
    expect(f).toHaveBeenCalledWith("/api/call", expect.objectContaining({ method: "POST" }));
    const sent = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(sent).toEqual({ tool: "set_group_style", args: { gi: 0, partial: { bold: true } } });
  });
  it("throws on {error}", async () => {
    mockFetch(422, { error: "boom" });
    await expect(call("undo", {})).rejects.toThrow("boom");
  });
});

describe("projects", () => {
  it("list GETs /api/projects", async () => {
    mockFetch(200, ["a", "b"]);
    expect(await projects.list()).toEqual(["a", "b"]);
  });
  it("open POSTs name", async () => {
    const f = mockFetch(200, {});
    await projects.open("song1");
    expect(f).toHaveBeenCalledWith("/api/projects/open", expect.objectContaining({ method: "POST" }));
  });
});

describe("burn", () => {
  it("returns job_id", async () => {
    mockFetch(200, { job_id: "j1" });
    expect(await burn("out.mp4")).toEqual({ job_id: "j1" });
  });
});

describe("getFrameUrl", () => {
  it("builds a frame url for t", () => {
    expect(getFrameUrl(13.5)).toBe("/api/frame?t=13.5");
  });
});
