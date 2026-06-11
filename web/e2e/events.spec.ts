// e2e/events.spec.ts — Event-authoring round-trip against the REAL daemon + the
// seeded "audit" project (Phase 5). Exercises the Events panel in the Project
// rail: section (incl. Custom…), color (the "color is its brand" guarantee —
// recolors the CueLanes lane bar AND a Timeline cue block), rename (panel +
// CueLanes header), split/merge (group structure), and persistence across a
// project re-open (autosave round-trip).
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { apiState, resetProject, openAudit, until, DAEMON } from "./helpers";

test.beforeEach(async () => { await resetProject(); });

// "#36E2FF" → "rgb(54, 226, 255)" — browsers serialise CSS colors as rgb().
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

// The Events panel lives in the Project rail (default rail tab). Make sure it's
// the active tab and the panel rendered a row per event.
async function openEventsPanel(page: Page): Promise<void> {
  await openAudit(page);
  await page.locator(".rail-tab", { hasText: "Project" }).click();
  await page.locator(".ev-panel .ev").first().waitFor();
}

// Re-open the project WITHOUT restoring pristine — mirrors dock.spec G-17: let the
// autosave land, then hit /api/projects/open directly so we read what survived.
async function reopenAfterAutosave(name = "audit"): Promise<void> {
  await new Promise((r) => setTimeout(r, 700));   // > autosave debounce (400ms)
  const r = await fetch(`${DAEMON}/api/projects/open`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error(`reopen failed: ${r.status}`);
}

test("EV-1 — Events panel shows one row per event", async ({ page }) => {
  await openEventsPanel(page);
  const groups = (await apiState()).layout.length;
  expect(groups).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".ev-panel .ev")).toHaveCount(groups);
});

test("EV-2 — section <select> writes layout[gi].section; Custom… persists", async ({ page }) => {
  await openEventsPanel(page);
  const rows = page.locator(".ev-panel .ev");

  // base section via the enum <select> on row 0
  await rows.nth(0).locator("select.sec-sel").selectOption("Chorus");
  await until(async () => (await apiState()).layout[0].section === "Chorus");
  expect((await apiState()).layout[0].section).toBe("Chorus");

  // Custom… on row 1 → modal → type → Save
  await rows.nth(1).locator("select.sec-sel").selectOption("__custom");
  const modal = page.locator(".modal-back .modal");
  await modal.waitFor();
  await modal.locator("input.m-in").fill("Refrain");
  await modal.getByRole("button", { name: "Save" }).click();
  await until(async () => (await apiState()).layout[1].section === "Refrain");
  expect((await apiState()).layout[1].section).toBe("Refrain");
  // the sticky custom value shows in the panel select
  await expect(rows.nth(1).locator("select.sec-sel")).toHaveValue("Refrain");
});

test("EV-3 — color is its brand: dot → swatch recolors lane bar AND a Timeline block", async ({ page }) => {
  await openEventsPanel(page);
  const PICK = "#36E2FF";                 // a popover swatch, distinct from the index default
  const pickRgb = hexToRgb(PICK);

  // pick the swatch for event 0 via the color dot → popover
  await page.locator(".ev-panel .ev").nth(0).locator("button.dot").click();
  await page.locator(".cpop").waitFor();
  await page.locator(`.cpop button.csw[aria-label="Set color ${PICK}"]`).click();
  await until(async () => (await apiState()).layout[0].color === PICK);
  expect((await apiState()).layout[0].color).toBe(PICK);

  // (a) CueLanes lane bar — the group header carries --g-color = the picked hex.
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-evt").first().waitFor();
  const gColor = await page.locator(".lane-evt").first()
    .evaluate((el) => getComputedStyle(el).getPropertyValue("--g-color").trim());
  expect(gColor.toLowerCase()).toBe(PICK.toLowerCase());

  // (b) Timeline cue block — a block of group 0 has background = the picked color.
  await page.locator(".dock-tab", { hasText: "Timeline" }).click();
  await page.locator(".wt .wt-block").first().waitFor();
  // group 0's first word is "alpha" (title starts with "alpha"); read its bg.
  const blockBg = await page.locator('.wt .wt-block[title^="alpha"]').first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(blockBg).toBe(pickRgb);
});

test("EV-4 — rename writes layout[gi].label (panel + CueLanes header)", async ({ page }) => {
  await openEventsPanel(page);

  // panel rename — contenteditable .name on row 0
  const name0 = page.locator(".ev-panel .ev").nth(0).locator(".name");
  await name0.click();
  await name0.evaluate((el) => { el.textContent = ""; });
  await name0.type("Opening");
  await name0.blur();
  await until(async () => (await apiState()).layout[0].label === "Opening");
  expect((await apiState()).layout[0].label).toBe("Opening");

  // CueLanes header rename — double-click .glabel-edit on group 1
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  const hdr = page.locator(".lane-evt").nth(1).locator(".glabel-edit");
  await hdr.dblclick();
  await hdr.evaluate((el) => { el.textContent = ""; });
  await hdr.type("Second");
  await hdr.blur();
  await until(async () => (await apiState()).layout[1].label === "Second");
  expect((await apiState()).layout[1].label).toBe("Second");
});

test("EV-5 — split raises event count, merge lowers it (layout.length)", async ({ page }) => {
  await openEventsPanel(page);
  const n0 = (await apiState()).layout.length;
  expect(n0).toBeGreaterThanOrEqual(2);

  // Split needs the focused group to have ≥2 lines. Ensure group 0 has 2 lines
  // (break after its first cue if it's currently a single line).
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-row").first().waitFor();
  await page.locator(".lane-row").nth(0).click();           // select first cue (focuses gi 0)
  if ((await apiState()).layout[0].lines.length < 2) {
    await page.getByRole("button", { name: "Break line" }).click();
    await until(async () => (await apiState()).layout[0].lines.length >= 2);
  }

  // Split at cue (focused group 0 → splits at the line boundary) → +1 event
  await page.locator(".rail-tab", { hasText: "Project" }).click();
  await page.locator(".ev-panel").waitFor();
  await page.getByRole("button", { name: "Split at cue" }).click();
  await until(async () => (await apiState()).layout.length === n0 + 1);
  expect((await apiState()).layout.length).toBe(n0 + 1);

  // Merge two contiguous events (rows 0 + 1) → −1 event. Toggle selection by
  // clicking a non-interactive cell (.cuecount) — the row's onClick ignores
  // clicks that land on .name/select/.stepper/.dot.
  const rows = page.locator(".ev-panel .ev");
  await rows.nth(0).locator(".cuecount").click();
  await rows.nth(1).locator(".cuecount").click();
  await expect(rows.nth(0)).toHaveClass(/sel/);
  await expect(rows.nth(1)).toHaveClass(/sel/);
  const mergeBtn = page.getByRole("button", { name: "Merge selected" });
  await expect(mergeBtn).toBeEnabled();
  await mergeBtn.click();
  await until(async () => (await apiState()).layout.length === n0);
  expect((await apiState()).layout.length).toBe(n0);
});

test("EV-6 — section + color + label SURVIVE a project re-open (autosave)", async ({ page }) => {
  await openEventsPanel(page);
  const PICK = "#FFC24B";
  const rows = page.locator(".ev-panel .ev");

  // author event 0: section, color, label
  await rows.nth(0).locator("select.sec-sel").selectOption("Bridge");
  await until(async () => (await apiState()).layout[0].section === "Bridge");

  await rows.nth(0).locator("button.dot").click();
  await page.locator(".cpop").waitFor();
  await page.locator(`.cpop button.csw[aria-label="Set color ${PICK}"]`).click();
  await until(async () => (await apiState()).layout[0].color === PICK);

  const name0 = rows.nth(0).locator(".name");
  await name0.click();
  await name0.evaluate((el) => { el.textContent = ""; });
  await name0.type("Authored");
  await name0.blur();
  await until(async () => (await apiState()).layout[0].label === "Authored");

  // re-open WITHOUT restoring pristine — the daemon autosaved.
  await reopenAfterAutosave();

  const g0 = (await apiState()).layout[0];
  expect(g0.section).toBe("Bridge");
  expect(g0.color).toBe(PICK);
  expect(g0.label).toBe("Authored");
});
