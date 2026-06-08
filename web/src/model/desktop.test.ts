import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => { delete (globalThis as { kss?: unknown }).kss; vi.resetModules(); });

describe("desktop bridge", () => {
  it("isDesktop is false and pickers resolve null when no window.kss", async () => {
    vi.resetModules();
    const mod = await import("./desktop");
    expect(mod.isDesktop).toBe(false);
    expect(await mod.pickOpen()).toBeNull();
    expect(await mod.pickSave()).toBeNull();
  });

  it("delegates to window.kss when present", async () => {
    const pickOpen = vi.fn(async () => "/abs/in.json");
    const pickSave = vi.fn(async () => "/abs/out.mp4");
    (globalThis as { kss?: unknown }).kss = { isDesktop: true, pickOpen, pickSave };
    vi.resetModules();
    const mod = await import("./desktop");
    expect(mod.isDesktop).toBe(true);
    expect(await mod.pickOpen({ filters: [{ name: "JSON", extensions: ["json"] }] })).toBe("/abs/in.json");
    expect(await mod.pickSave({ defaultPath: "x.mp4" })).toBe("/abs/out.mp4");
    expect(pickOpen).toHaveBeenCalledWith({ filters: [{ name: "JSON", extensions: ["json"] }] });
    expect(pickSave).toHaveBeenCalledWith({ defaultPath: "x.mp4" });
  });
});
