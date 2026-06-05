import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { apiState, apiCall, resetProject, openAudit, until } from "./helpers";

test.beforeEach(async () => { await resetProject(); });

// Open the Inspector rail tab; optionally select a word first.
async function inspector(page: Page) {
  await page.locator(".rail-tab", { hasText: "Inspector" }).click();
}
async function selectWord0(page: Page) {
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-row").first().click();
}

// Find a prow by its label text within a given tier class.
function prow(page: Page, tier: string, label: string) {
  return page.locator(`.tier3.${tier} .prow`, { has: page.locator(".pl", { hasText: label }) });
}

test("G-20 — group fontsize stepper sets layout[0].style.fontsize + caption em; clear reverts", async ({ page }) => {
  await openAudit(page);
  // select the group (lane-evt) so GROUP tier shows and is the active gi
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-evt").first().click();
  await inspector(page);

  const sizeRow = prow(page, "group", "Size");
  // step up twice
  await sizeRow.locator(".pm").last().click();
  await sizeRow.locator(".pm").last().click();

  await until(async () => typeof (await apiState()).layout[0].style.fontsize === "number");
  const fs = (await apiState()).layout[0].style.fontsize;
  expect(fs).toBeGreaterThan(0);

  // clear override -> back to undefined
  await sizeRow.locator(".pclear").click();
  await until(async () => (await apiState()).layout[0].style.fontsize === undefined);
});

test("G-21 — cue color swatch sets tok style.primary + caption span color; clear reverts", async ({ page }) => {
  await openAudit(page);
  await selectWord0(page);
  await inspector(page);

  const fillRow = prow(page, "word", "Fill");
  // pick the pink swatch (#FF3DA6)
  await fillRow.locator('.sw-dot').nth(1).click();

  await until(async () => {
    const tok = (await apiState()).layout[0].lines[0].toks[0];
    return typeof tok.style.primary === "string";
  });
  const primary = (await apiState()).layout[0].lines[0].toks[0].style.primary as string;
  expect(primary.toUpperCase()).toBe("#FF3DA6");

  // caption span color reflects it (when this word is in the active group's caption)
  // clear
  await fillRow.locator(".pclear").click();
  await until(async () => (await apiState()).layout[0].lines[0].toks[0].style.primary === undefined);
});

// FINDING G-22: the CUE bold toggle does NOT round-trip back to the inherited
// (undefined) state. Global bold is true, so the first toggle writes an explicit
// `false` override and the second writes explicit `true` — never clearing the
// override. Toggling an inherited boolean twice should return to inherited.
test("G-22 — bold toggle twice = state reverted (back to inherited)", async ({ page }) => {
  test.fail();
  await openAudit(page);
  await selectWord0(page);
  await inspector(page);

  const boldRow = prow(page, "word", "Bold");
  const boldOf = async () => (await apiState()).layout[0].lines[0].toks[0].style.bold;
  expect(await boldOf()).toBeUndefined();

  // first toggle flips off the inherited true -> explicit false
  await boldRow.locator(".pv-ctl").click();
  await until(async () => (await boldOf()) === false);
  // second toggle should clear the override (revert to inherited undefined)
  await boldRow.locator(".pv-ctl").click();
  await until(async () => (await boldOf()) === undefined);
});

test("G-23 — fade defaults stepper: fade_in_ms 250 ->300 ->250 via +/-", async ({ page }) => {
  await openAudit(page);
  await selectWord0(page);
  await inspector(page);

  const base = (await apiState()).globals.fade_in_ms as number;
  const row = page.locator(".fg-panel.defaults .fd-row", { has: page.locator(".fd-l", { hasText: "Fade-in" }) });

  await row.locator(".pm").last().click();   // +50
  await until(async () => (await apiState()).globals.fade_in_ms === base + 50);
  await row.locator(".pm").first().click();  // -50
  await until(async () => (await apiState()).globals.fade_in_ms === base);
});

test("G-24 — EventStrip accumulate + linger change layout props; undo reverts", async ({ page }) => {
  await openAudit(page);
  // EventStrip only renders after explicit group select
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-evt").first().click();
  await page.locator(".evt-strip").waitFor();

  const base = await apiState();
  const baseAcc = base.layout[0].accumulate;
  const baseLinger = base.layout[0].linger ?? 0;

  // set accumulate -> lines
  await page.locator(".evt-strip .seg2 button", { hasText: "lines" }).click();
  await until(async () => (await apiState()).layout[0].accumulate === "lines");

  // linger +0.1
  await page.locator(".evt-strip .pv-step .pm").last().click();
  await until(async () => Math.abs(((await apiState()).layout[0].linger ?? 0) - (baseLinger + 0.1)) < 1e-6);

  // revert via undos
  await apiCall("undo");
  await apiCall("undo");
  await until(async () => {
    const s = await apiState();
    return s.layout[0].accumulate === baseAcc && (s.layout[0].linger ?? 0) === baseLinger;
  });
});

test("G-25 — TimingPanel numeric commit + arrow-step + revert by typing original", async ({ page }) => {
  await openAudit(page);
  await selectWord0(page);
  await inspector(page);

  // unlock
  await page.locator(".lock-pill").click();
  await expect(page.locator(".lock-pill")).toContainText("unlocked");

  const startOf = async () => (await apiState()).words[0].start as number;
  const base = await startOf();

  const startInput = page.locator('.timing input[aria-label="Start"]');
  await startInput.fill("0.800");
  await startInput.press("Enter");
  await until(async () => Math.abs((await startOf()) - 0.8) < 0.01);

  // arrow-step up by 0.05
  await startInput.press("ArrowUp");
  await until(async () => Math.abs((await startOf()) - 0.85) < 0.01);

  // revert by typing original
  await startInput.fill(base.toFixed(3));
  await startInput.press("Enter");
  await until(async () => Math.abs((await startOf()) - base) < 0.01);
});
