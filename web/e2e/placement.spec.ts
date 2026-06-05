import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { apiState, apiCall, resetProject, openAudit, until } from "./helpers";

test.beforeEach(async () => { await resetProject(); });

// Helper: read placement subset from daemon state.
async function placement() {
  return (await apiState()).placement as {
    align: number; margin_l: number; margin_r: number; margin_v: number;
    pos: [number, number] | null; use_pos?: boolean; play_w: number; play_h: number;
  };
}

// Switch the rail to the Project tab (where alignment + free-placement live).
async function projectTab(page: Page) {
  await page.locator(".rail-tab", { hasText: "Project" }).click();
}

// Pick an alignment via the 3x3 grid in the Project rail.
async function pickAlign(page: Page, n: number, label: string) {
  await projectTab(page);
  // The first .kit-sel in the rail is the Placement alignment grid.
  await page.locator(".rail-body .kit-sel").first().click();
  await page.locator(`.ag-cell[aria-label*="(${n})"]`, { hasText: "" }).first().click();
  // make sure the chosen label shows
  await expect(page.locator(".rail-body .kit-sel").first()).toContainText(label);
}

// FINDING G-01: set_globals placement changes are NOT undoable. The forward
// align change lands, but apiCall("undo") leaves align unchanged (stays 8).
test("G-01 — align grid: pick Top-Center updates placement.align + reverts via undo", async ({ page }) => {
  await openAudit(page);
  const base = await placement();
  expect(base.align).toBe(2); // seeded Bottom-Center

  await pickAlign(page, 8, "Top-Center");
  await until(async () => (await placement()).align === 8);

  // caption moves to the top: cap top should be in the upper portion of the stage
  const stage = await page.locator(".stage").boundingBox();
  const cap = await page.locator(".cap").boundingBox();
  expect(stage && cap).toBeTruthy();
  expect((cap!.y - stage!.y) / stage!.height).toBeLessThan(0.4);

  // revert
  await apiCall("undo");
  await until(async () => (await placement()).align === 2);
  expect(await placement()).toMatchObject({ align: 2 });
});

test("G-02 — free-placement toggle on adds use_pos+pos (pin replaces bbox); off restores", async ({ page }) => {
  await openAudit(page);
  const base = await placement();
  expect(base.pos).toBeNull();
  await expect(page.locator(".bbox")).toBeVisible();
  await expect(page.locator(".pinbox")).toHaveCount(0);

  await projectTab(page);
  await page.getByRole("switch", { name: "Free placement" }).click();
  await until(async () => {
    const p = await placement();
    return p.use_pos === true && Array.isArray(p.pos);
  });
  // UI: pin replaces bbox
  await expect(page.locator(".pinbox")).toBeVisible();
  await expect(page.locator(".bbox")).toHaveCount(0);

  // toggle off
  await page.getByRole("switch", { name: "Free placement" }).click();
  await until(async () => {
    const p = await placement();
    return !p.use_pos && p.pos == null;
  });
  await expect(page.locator(".bbox")).toBeVisible();
  await expect(page.locator(".pinbox")).toHaveCount(0);
});

// FINDING G-03: the box-body drag correctly writes margins + moves the caption,
// but the revert (apiCall("undo")) does NOT restore margins — placement edits
// via set_globals are not captured in the undo history.
test("G-03 — box body drag changes margins in state + caption position on screen; drag-back restores", async ({ page }) => {
  await openAudit(page);
  const base = await placement();
  const cap0 = await page.locator(".cap").boundingBox();

  const bbox = page.locator(".bbox");
  const box0 = (await bbox.boundingBox())!;
  const cx = box0.x + box0.width / 2;
  const cy = box0.y + box0.height / 2;

  // drag the box body up and left
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 120, cy - 80, { steps: 8 });
  await page.mouse.up();

  await until(async () => {
    const p = await placement();
    return p.margin_l !== base.margin_l || p.margin_v !== base.margin_v;
  });
  const moved = await placement();
  // moving left should reduce margin_l; moving up (bottom-anchored) increases margin_v
  expect(moved.margin_l).toBeLessThan(base.margin_l);
  expect(moved.margin_v).toBeGreaterThan(base.margin_v);

  // real geometry: caption moved up and left on screen (poll — the caption
  // re-renders from the committed placement a tick after the pointerup).
  await expect.poll(async () => (await page.locator(".cap").boundingBox())!.y)
    .toBeLessThan(cap0!.y - 1);
  const cap1 = await page.locator(".cap").boundingBox();
  expect(cap1!.x).toBeLessThan(cap0!.x + 1);

  // drag back (reverse) — margins return ~ to base (±3 px tolerance via undo for exactness)
  await apiCall("undo");
  await until(async () => {
    const p = await placement();
    return p.margin_l === base.margin_l && p.margin_v === base.margin_v && p.margin_r === base.margin_r;
  });
});

test("G-04 — n-handle resize: margin_v unchanged in state; box height visually persists", async ({ page }) => {
  await openAudit(page);
  const base = await placement();

  const bbox = page.locator(".bbox");
  const box0 = (await bbox.boundingBox())!;
  const handle = page.locator(".bbox .n");
  const hb = (await handle.boundingBox())!;
  const hx = hb.x + hb.width / 2;
  const hy = hb.y + hb.height / 2;

  // drag the north (top) handle UP — grows the band height; the anchored bottom
  // edge is unchanged, so margin_v (bottom-anchored) must NOT change.
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx, hy - 60, { steps: 6 });
  await page.mouse.up();

  // give the placement push time to land, then assert margin_v is stable
  await page.waitForTimeout(250);
  const after = await placement();
  expect(after.margin_v).toBe(base.margin_v);

  // box height persisted visually (taller than before, not snapped back)
  const box1 = (await bbox.boundingBox())!;
  expect(box1.height).toBeGreaterThan(box0.height + 10);
});

test("G-05 — Esc cancels a box drag: state unchanged", async ({ page }) => {
  await openAudit(page);
  const base = await placement();

  const bbox = page.locator(".bbox");
  const box0 = (await bbox.boundingBox())!;
  const cx = box0.x + box0.width / 2;
  const cy = box0.y + box0.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 100, cy - 60, { steps: 6 });
  // readout chip visible mid-drag
  await expect(page.locator(".drag-readout")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await page.waitForTimeout(250);
  expect(await placement()).toMatchObject({
    margin_l: base.margin_l, margin_r: base.margin_r, margin_v: base.margin_v,
  });
  await expect(page.locator(".drag-readout")).toHaveCount(0);
});

test("G-06 — drag readout chip shows margins mid-drag", async ({ page }) => {
  await openAudit(page);
  const bbox = page.locator(".bbox");
  const box0 = (await bbox.boundingBox())!;
  const cx = box0.x + box0.width / 2;
  const cy = box0.y + box0.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 40, cy - 20, { steps: 4 });
  const readout = page.locator(".drag-readout");
  await expect(readout).toBeVisible();
  await expect(readout).toContainText(/L \d+ · R \d+ · V \d+/);
  await page.mouse.up();
});
