/**
 * animations.spec.ts — Cluster AP (e2e round-trip, real daemon). Test design §8.
 *
 * Round-trip template: baseline = apiState() → ACT (UI or side-channel apiCall) →
 * assert state diff AND UI (classes/geometry) → INVERSE → assert state + UI back at
 * baseline. resetProject() between tests (pristine-snapshot + reopen; the daemon
 * autosaves, so reset waits out the debounce then restores the pristine on-disk
 * project and re-opens — re-migrating the legacy-shaped pristine).
 *
 * Side-channel apiCall(tool,args) = MCP-agent impersonation (never via the UI).
 *
 * NOTE — scope name: the Inspector/strip UI dispatches the selection scope as "cue";
 * the engine's canonical carrier name is "tag". The MCP tools accept both (a "cue"
 * alias was added to mcp_server/tools.py during this phase — see the session
 * findings). Side-channel calls below use whichever the spec text names.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { apiState, apiCall, resetProject, openAudit, until } from "./helpers";

test.beforeEach(async () => { await resetProject(); });

// A fade_in alpha animation record (the migrated fade preset shape).
const FADE_IN = (id = "ap_fade") => ({
  id, name: "fade_in", channel: "alpha", mode: "percue", group_id: null,
  segments: [{ t0: { anchor: "cue_start", offset: 0, unit: "ms" },
               t1: { anchor: "cue_start", offset: 250, unit: "ms" }, from: "FF", to: "00", accel: 1 }],
  enabled: true,
});

// A pop (scale_x) animation. NOTE: the migration synthesises an ALPHA appearance
// animation onto every group/cue (a_glob_appear / a_g*_appear). A freshly-added
// GLOBAL alpha fade therefore overlaps that group-scope appearance window and is
// dropped by cross-scope conflict resolution (narrowest-wins) — so it never produces
// a per-cue strip. Strip-visibility AP tests use a scale_x `pop` record, which is on
// a different channel and resolves cleanly alongside the appearance anims.
const POP = (id = "ap_pop") => ({
  id, name: "pop", channel: "scale_x", mode: "percue", group_id: null,
  segments: [{ t0: { anchor: "cue_start", offset: 0, unit: "ms" },
               t1: { anchor: "cue_start", offset: 180, unit: "ms" }, from: 1, to: 1.18, accel: 1 }],
  enabled: true,
});

async function selectWord0(page: Page) {
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-row").first().click();
}
async function openTimeline(page: Page) {
  await page.locator(".dock-tab", { hasText: "Timeline" }).click();
  await page.locator(".wt .block").first().waitFor();
}

// ── AP-1 — add a fade preset via the UI (OpsToolbar Group fade-in) ───────────
test("AP-1 — UI Group fade-in adds anim_tag + ANIMATION 'fade in' chip; Clear in → baseline", async ({ page }) => {
  await openAudit(page);
  await selectWord0(page);

  expect((await apiState()).anim_tags.length).toBe(0);
  await page.locator(".minibtn", { hasText: "Group fade-in" }).click();
  await until(async () => (await apiState()).anim_tags.some(
    (t: any) => t.ids.includes(0) && t.anims.some((a: any) => a.name === "fade_in")));
  // UI: the lane row's ANIMATION cell gains an own "fade in" chip
  await expect(page.locator(".lane-row").first().locator(".lc.anim .achip.own", { hasText: /fade in/i }).first()).toBeVisible();

  // inverse: Clear in → both state and UI back to baseline
  await page.locator(".minibtn", { hasText: "Clear in" }).click();
  await until(async () => !(await apiState()).anim_tags.some(
    (t: any) => t.anims.some((a: any) => a.name === "fade_in")));
  await expect(page.locator(".lane-row").first().locator(".lc.anim .achip", { hasText: /fade in/i })).toHaveCount(0);
});

// ── AP-2 — add_animation via SIDE-CHANNEL (MCP) → live UI; undo reverts ───────
test("AP-2 — side-channel global add renders strip + inspector row live; undo reverts", async ({ page }) => {
  await openAudit(page);
  await page.locator(".rail-tab", { hasText: "Inspector" }).click();
  await openTimeline(page);

  await apiCall("add_animation", { scope: "global", ref: null, anim: POP("g_live") });
  await until(async () => ((await apiState()).globals.animations ?? []).some((a: any) => a.id === "g_live"));
  // strip appears on the timeline with zero UI interaction
  await expect(page.locator('.astrip[data-aid="g_live"]').first()).toBeVisible();
  // inspector GLOBAL-tier row appears
  await expect(page.locator(".tier.append.global")).toContainText("pop");

  // side-channel undo → UI reverts
  await apiCall("undo");
  await until(async () => !((await apiState()).globals.animations ?? []).some((a: any) => a.id === "g_live"));
  await expect(page.locator('.astrip[data-aid="g_live"]')).toHaveCount(0);
  await expect(page.locator(".tier.append.global")).not.toContainText("pop");
});

// ── AP-3 — tombstone/restore round-trip at cue scope on an inherited global ──
test("AP-3 — UI remove(inherited global) → tombstone, restore → baseline", async ({ page }) => {
  await openAudit(page);
  // seed the inherited global animation via side-channel
  await apiCall("add_animation", { scope: "global", ref: null, anim: FADE_IN("g_inh") });
  await until(async () => ((await apiState()).globals.animations ?? []).some((a: any) => a.id === "g_inh"));

  await selectWord0(page);
  await page.locator(".rail-tab", { hasText: "Inspector" }).click();
  // expand the CUE tier inherited disclosure to reach the inherited global row
  await page.locator(".tier.append.cue .inh-disc").click();
  const inhFade = page.locator(".tier.append.cue .ov-row.inherited", { hasText: "fade_in" });
  await inhFade.waitFor();
  // remove the inherited row → writes a tombstone (suppress) at the narrow (cue/tag) scope
  await inhFade.locator('button[aria-label="Remove animation"]').click();
  await until(async () => {
    const tags = (await apiState()).anim_tags;
    return tags.some((t: any) => (t.suppress ?? []).includes("g_inh"));
  });
  const tomb = page.locator(".tier.append.cue .ov-row.tomb", { hasText: "fade_in" });
  await expect(tomb).toContainText(/removed here/i);

  // restore → tombstone cleared, state back to "global only" baseline
  await tomb.locator('button[aria-label="Restore"]').click();
  await until(async () => !(await apiState()).anim_tags.some((t: any) => (t.suppress ?? []).includes("g_inh")));
  await expect(page.locator(".tier.append.cue .ov-row.tomb", { hasText: "fade_in" })).toHaveCount(0);
});

// ── AP-4 — timing-mode round-trip (side-channel; picker not yet UI-wired) ────
// FINDING: the TimingModePicker (AM cluster) component exists and is unit-tested but
// is NOT wired into the Editor inspector (the live AnimSection edit affordance only
// toggles `enabled`). So a UI mode change is not yet reachable; this asserts the
// set_animation_props {mode} round-trip via the side channel, which IS the contract
// the picker will dispatch. (AX-08 carries the same finding on the jsdom side.)
test("AP-4 — set_animation_props mode Together ↔ Per cue round-trips in state", async ({ page }) => {
  await openAudit(page);
  await apiCall("add_animation", { scope: "group", ref: 0, anim: {
    ...FADE_IN("g_mode"), name: "pop", channel: "scale_x", mode: "percue",
    segments: [{ t0: { anchor: "cue_start", offset: 0, unit: "ms" },
                 t1: { anchor: "cue_start", offset: 180, unit: "ms" }, from: 1, to: 1.18, accel: 1 }],
  } });
  await until(async () => (await apiState()).layout[0].animations.some((a: any) => a.id === "g_mode"));
  const modeOf = async () => (await apiState()).layout[0].animations.find((a: any) => a.id === "g_mode").mode;
  expect(await modeOf()).toBe("percue");

  await apiCall("set_animation_props", { scope: "group", ref: 0, anim_id: "g_mode", partial: { mode: "together" } });
  await until(async () => (await modeOf()) === "together");

  await apiCall("set_animation_props", { scope: "group", ref: 0, anim_id: "g_mode", partial: { mode: "percue" } });
  await until(async () => (await modeOf()) === "percue");
});

// ── AP-5 — drag-retime a focused strip against real geometry; drag back ──────
test("AP-5 — drag a focused strip handle by +Npx retimes offsets; drag back ≈ baseline", async ({ page }) => {
  await openAudit(page);
  await apiCall("add_animation", { scope: "global", ref: null, anim: POP("g_drag") });
  await until(async () => ((await apiState()).globals.animations ?? []).some((a: any) => a.id === "g_drag"));

  await openTimeline(page);
  // Phase 4: at H-zoom 1 (68px/s) a 180ms strip is a sub-18px glyph chip and tiny
  // neighbouring glyphs overlap the hit target. Zoom H to max so it expands into a
  // wide, isolated real bar with clear handles (the prototype's "zoom in" workflow).
  await page.locator('.tl-zoom input[aria-label="Horizontal zoom"]').fill("3");
  const strip = page.locator('.astrip[data-aid="g_drag"]').first();
  await strip.waitFor();
  // 2-click focus: 1st selects the cue, 2nd focuses the anim (handles appear)
  await strip.click();
  await strip.click();
  await page.locator('.astrip[data-aid="g_drag"].foc .h.h-r').first().waitFor();

  const baseT1 = () =>
    (apiState().then((s) => s.globals.animations.find((a: any) => a.id === "g_drag").segments[0].t1.offset));
  const t1_0 = await baseT1();

  // Drive the drag via real PointerEvents. The WordTrack drag handler binds
  // pointermove/pointerup on `window` after a pointerdown on the handle, so we
  // dispatch PointerEvents directly (Playwright mouse emits mouse events, which the
  // pointer-only handler ignores) — this is the genuine retime path.
  const dragRight = async (dx: number) => {
    await page.evaluate((dx) => {
      const h = document.querySelector('.astrip[data-aid="g_drag"] .h.h-r') as HTMLElement;
      const b = h.getBoundingClientRect();
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      // altKey bypasses magnet snapping: this spec asserts the RAW px<->ms retime contract (cf. jsdom AT-11)
      h.dispatchEvent(new PointerEvent("pointerdown", { clientX: cx, clientY: cy, bubbles: true, pointerId: 1, altKey: true }));
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: cx + dx, clientY: cy, bubbles: true, pointerId: 1, altKey: true }));
      window.dispatchEvent(new PointerEvent("pointerup", { clientX: cx + dx, clientY: cy, bubbles: true, pointerId: 1, altKey: true }));
    }, dx);
  };

  // drag the right handle +60px → t1 offset grows
  await dragRight(60);
  await until(async () => (await baseT1()) > t1_0 + 1);
  const t1_after = await baseT1();
  expect(t1_after).toBeGreaterThan(t1_0);

  // drag back -60px → offset returns to ≈ baseline (px→ms rounding tolerance)
  await dragRight(-60);
  await until(async () => Math.abs((await baseT1()) - t1_0) <= 8);
  void t1_after;
});

// ── AP-6 — animations AUTOSAVE: edit → wait > debounce → read project.json ───
test("AP-6 — added animation autosaves to project.json on disk", async ({ page }) => {
  await openAudit(page);
  await apiCall("add_animation", { scope: "global", ref: null, anim: FADE_IN("g_save") });
  await until(async () => ((await apiState()).globals.animations ?? []).some((a: any) => a.id === "g_save"));

  // wait past the autosave debounce (400ms) then read the daemon's project.json
  await new Promise((r) => setTimeout(r, 900));
  const { projectsDir } = JSON.parse(readFileSync(join(tmpdir(), "kss-e2e-pids.json"), "utf-8"));
  const disk = JSON.parse(readFileSync(join(projectsDir, "audit", "project.json"), "utf-8"));
  // the serialized cues carry the global animation (persisted across the autosave)
  const persisted = JSON.stringify(disk).includes("g_save");
  expect(persisted).toBe(true);
  // resetProject (afterEach via beforeEach of the next test) restores the pristine.
});

// ── AP-7 — legacy migration on open: state carries anim carriers, no legacy keys ─
test("AP-7 — opened project carries anim carriers and NO fin_tags/fade/accumulate", async ({ page }) => {
  await openAudit(page);
  const s = await apiState();
  // migrated carriers present
  expect(s).toHaveProperty("anim_tags");
  expect(Array.isArray(s.anim_tags)).toBe(true);
  expect(s.layout[0]).toHaveProperty("animations");
  expect(s.layout[0]).toHaveProperty("suppress");
  // per-cue resolved list present (daemon-filled)
  expect(s.layout[0].lines[0].toks[0]).toHaveProperty("anims_resolved");
  // NO legacy keys anywhere
  expect(s).not.toHaveProperty("fin_tags");
  expect(s).not.toHaveProperty("fout_tags");
  expect(s.globals).not.toHaveProperty("fade_in_ms");
  expect(s.globals).not.toHaveProperty("fade_out_ms");
  for (const g of s.layout) {
    expect(g).not.toHaveProperty("fade");
    expect(g).not.toHaveProperty("accumulate");
  }
});

// ── AP-8 — WS push render: side-channel add → strip appears; remove → gone ───
test("AP-8 — side-channel add_animation strip appears within the WS window; remove → disappears", async ({ page }) => {
  await openAudit(page);
  await openTimeline(page);
  await expect(page.locator('.astrip[data-aid="g_ws"]')).toHaveCount(0);

  await apiCall("add_animation", { scope: "global", ref: null, anim: POP("g_ws") });
  // the strip appears purely from the WS state push (no UI interaction)
  await expect(page.locator('.astrip[data-aid="g_ws"]').first()).toBeVisible({ timeout: 5000 });

  await apiCall("remove_animation", { scope: "global", ref: null, anim_id: "g_ws" });
  await expect(page.locator('.astrip[data-aid="g_ws"]')).toHaveCount(0);
});
