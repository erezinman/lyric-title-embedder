import { test, expect } from "@playwright/test";
import { apiState, apiCall, resetProject, openAudit, until } from "./helpers";

test.beforeEach(async () => { await resetProject(); });

const timeLabel = (page: import("@playwright/test").Page) => page.locator(".transport .time");

test("G-30 — Play advances the time label (real rAF) and pause freezes it", async ({ page }) => {
  await openAudit(page);
  const label = timeLabel(page);
  await expect(label).toContainText("0:00.00");

  await page.locator(".tbtn.play").click();
  // wait for the clock to advance
  await expect.poll(async () => (await label.textContent()) ?? "").not.toContain("0:00.00");
  await page.locator(".tbtn.play").click(); // pause
  const frozen = await label.textContent();
  await page.waitForTimeout(300);
  expect(await label.textContent()).toBe(frozen);
});

test("G-31 — seek +/- moves the time label", async ({ page }) => {
  await openAudit(page);
  const label = timeLabel(page);
  await page.locator(".transport .tbtn").last().click(); // skip forward (+2)
  await expect(label).toContainText("0:02.00");
  await page.locator(".transport .tbtn").first().click(); // skip back (-2)
  await expect(label).toContainText("0:00.00");
});

test("G-32 — undo button (TopBar) reverts a UI edit against real history", async ({ page }) => {
  await openAudit(page);
  // make an edit via UI: group fontsize via inspector
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-evt").first().click();
  await page.locator(".rail-tab", { hasText: "Inspector" }).click();
  const sizeRow = page.locator(`.tier3.group .prow`, { has: page.locator(".pl", { hasText: "Size" }) });
  await sizeRow.locator(".pm").last().click();
  await until(async () => typeof (await apiState()).layout[0].style.fontsize === "number");

  // undo via TopBar button (title Undo)
  await page.locator('.topbar button[title="Undo"]').click();
  await until(async () => (await apiState()).layout[0].style.fontsize === undefined);
});

test("G-33 — rail tabs switch Project <-> Inspector", async ({ page }) => {
  await openAudit(page);
  await page.locator(".rail-tab", { hasText: "Project" }).click();
  await expect(page.locator(".rail-body .insp")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Free placement" })).toBeVisible();
  await page.locator(".rail-tab", { hasText: "Inspector" }).click();
  await expect(page.locator(".rail-body .insp")).toBeVisible();
});

test("G-34 — dock tabs switch Timeline <-> Cue lanes", async ({ page }) => {
  await openAudit(page);
  await page.locator(".dock-tab", { hasText: "Timeline" }).click();
  await expect(page.locator(".wt")).toBeVisible();
  await expect(page.locator(".lanes")).toHaveCount(0);
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await expect(page.locator(".lanes")).toBeVisible();
});

// FINDING G-35: the .stage element declares `aspect-ratio: 16/9` in CSS but its
// rendered box is NOT 16:9 (observed ~2.85:1) — the stage is stretched to fill
// its column instead of being letterboxed to 16:9. This is the squash-bug class.
test("G-35 — horizontal splitter drag changes stage size AND keeps 16:9", async ({ page }) => {
  await openAudit(page);
  const stage = page.locator(".stage");
  const before = (await stage.boundingBox())!;

  const split = page.locator(".splitter.horizontal");
  const sb = (await split.boundingBox())!;
  const cx = sb.x + sb.width / 2;
  const cy = sb.y + sb.height / 2;
  // drag the dock divider DOWN -> grows the stage area above it
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 80, { steps: 8 });
  await page.mouse.up();

  const after = (await stage.boundingBox())!;
  expect(Math.abs(after.height - before.height)).toBeGreaterThan(10);
  // stage keeps 16:9 (the squash-bug guard)
  const ratio = after.width / after.height;
  expect(ratio).toBeGreaterThan(1.77);
  expect(ratio).toBeLessThan(1.79);
});

test("G-36 — splitter double-click resets to default height", async ({ page }) => {
  await openAudit(page);
  const dock = page.locator(".dock");
  const defaultH = (await dock.boundingBox())!.height;

  const split = page.locator(".splitter.horizontal");
  const sb = (await split.boundingBox())!;
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, sb.y - 60, { steps: 6 });
  await page.mouse.up();
  expect(Math.abs((await dock.boundingBox())!.height - defaultH)).toBeGreaterThan(10);

  await split.dblclick();
  await expect.poll(async () => Math.round((await dock.boundingBox())!.height)).toBe(Math.round(defaultH));
});

test("G-37 — pane sizes persist across page reload (localStorage)", async ({ page }) => {
  await openAudit(page);
  // nudge rail wider via keyboard arrow on the vertical splitter
  const vsplit = page.locator(".splitter.vertical");
  await vsplit.focus();
  const railBefore = (await page.locator(".rail").boundingBox())!.width;
  await vsplit.press("ArrowRight");
  await vsplit.press("ArrowRight");
  await expect.poll(async () => (await page.locator(".rail").boundingBox())!.width).toBeGreaterThan(railBefore + 10);
  const railAfter = (await page.locator(".rail").boundingBox())!.width;

  // localStorage holds the new width
  const stored = await page.evaluate(() => Number(localStorage.getItem("kss.railW")));
  expect(Math.abs(stored - railAfter)).toBeLessThan(4);

  // reload returns to the library; re-open the project and the persisted width applies
  await page.reload();
  await openAudit(page);
  const railReloaded = (await page.locator(".rail").boundingBox())!.width;
  expect(Math.abs(railReloaded - railAfter)).toBeLessThan(4);
});
