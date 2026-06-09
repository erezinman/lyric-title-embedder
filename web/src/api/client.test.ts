import { describe, it, expect, vi, beforeEach } from "vitest";
import { call, getFrameUrl, projects, burn, getEnv, getSrt, getVtt } from "./client";

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
  it("list GETs /api/projects (enriched metadata objects)", async () => {
    const meta = [
      { name: "a", modified: 1700000000, duration_s: 65, caption: ["hi", "there"] },
      { name: "b", modified: null, duration_s: null, caption: null },
    ];
    mockFetch(200, meta);
    expect(await projects.list()).toEqual(meta);
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

describe("getEnv", () => {
  it("returns the capabilities object", async () => {
    const caps = { file_access: "transfer", can_use_server_paths: false, can_burn_video: false };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(caps), { status: 200 })));
    expect(await getEnv()).toEqual(caps);
  });
});

describe("subtitle downloads", () => {
  it("getSrt fetches /api/srt as text", async () => {
    const f = vi.fn(async () => new Response("1\n00:00:01,000 --> 00:00:02,000\nhi\n", { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await getSrt()).toContain("00:00:01,000");
    expect(f).toHaveBeenCalledWith("/api/srt");
  });
  it("getVtt fetches /api/vtt as text", async () => {
    const f = vi.fn(async () => new Response("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi\n", { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await getVtt()).toContain("WEBVTT");
    expect(f).toHaveBeenCalledWith("/api/vtt");
  });
});

describe("projects.create", () => {
  it("posts FormData to /api/projects/create and returns opened", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ opened: "x" }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    const fd = new FormData();
    fd.set("name", "x"); fd.set("source", "srt");
    const r = await projects.create(fd);
    expect(r).toEqual({ opened: "x" });
    const call0 = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(call0[0]).toBe("/api/projects/create");
    expect(call0[1].method).toBe("POST");
    expect(call0[1].body).toBeInstanceOf(FormData);
  });

  it("throws the daemon error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 409 })));
    await expect(projects.create(new FormData())).rejects.toThrow("boom");
  });
});
