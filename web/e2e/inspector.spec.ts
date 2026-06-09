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

  // REWRITTEN for the pickers feature: the Fill swatch row is now a ColorPicker
  // field. Open it and pick the brand pink (#FF3DA6) swatch from the palette.
  const fillRow = prow(page, "word", "Fill");
  await fillRow.locator(".ksp-field").click();
  await page.locator('.ksp-dot[title="#FF3DA6"]').first().click({ force: true });

  await until(async () => {
    const tok = (await apiState()).layout[0].lines[0].toks[0];
    return typeof tok.style.primary === "string";
  });
  const primary = (await apiState()).layout[0].lines[0].toks[0].style.primary as string;
  expect(primary.toUpperCase()).toBe("#FF3DA6");

  // close the popover, then clear the override (inherit)
  await page.locator(".ksp-backdrop").click({ force: true });
  await fillRow.locator(".pclear").click();
  await until(async () => (await apiState()).layout[0].lines[0].toks[0].style.primary === undefined);
});

// FINDING G-22: the CUE bold toggle does NOT round-trip back to the inherited
// (undefined) state. Global bold is true, so the first toggle writes an explicit
// `false` override and the second writes explicit `true` — never clearing the
// override. Toggling an inherited boolean twice should return to inherited.
test("G-22 — bold toggle twice = state reverted (back to inherited)", async ({ page }) => {
  await openAudit(page);
  await selectWord0(page);
  await inspector(page);

  // REWRITTEN for the pickers feature: the standalone Bold toggle row was
  // replaced by the FontPicker's B button (typography is now owned by the font
  // picker). Open the cue-tier Font field popover, then toggle Bold.
  const fontRow = prow(page, "word", "Font");
  const boldOf = async () => (await apiState()).layout[0].lines[0].toks[0].style.bold;
  expect(await boldOf()).toBeUndefined();

  // Open the FontField fresh for EACH toggle. CRUCIAL: wait for the B button's
  // aria-pressed to reflect the CURRENT state before clicking — until() polls the
  // daemon, but the UI catches up a beat later via the WS echo, so without this
  // the second toggle would fire against a stale UI and just re-set the same value.
  // Scope to THIS row's popover — each tier renders its own Font picker with a
  // "Bold" button. The popover is a fixed-position overlay, so positional clicks
  // land on the wrong layer; fire the click on the element itself via .evaluate
  // (real handler, no hit-testing) — the standard technique for overlay controls.
  // The picker popover is portaled to <body> (pickers transparency fix), so the
  // Bold button + backdrop live at page level, not inside the row. Only one popover
  // is open at a time (we open this row's field below), so a page-scoped query is
  // unambiguous. The trigger (.ksp-field) still lives in the row.
  const b = page.locator('button[title="Bold"]');
  const toggleBold = async (pressedBefore: "true" | "false") => {
    await fontRow.locator(".ksp-field").click();
    await b.waitFor({ state: "visible" });
    await expect(b).toHaveAttribute("aria-pressed", pressedBefore);
    await b.evaluate((el: HTMLElement) => el.click());
    // close the popover (click its backdrop element) and wait for unmount
    await page.locator(".ksp-backdrop").evaluate((el: HTMLElement) => el.click());
    await b.waitFor({ state: "detached" });
  };
  // inherited bold is true → first toggle flips off to explicit false
  await toggleBold("true");
  await until(async () => (await boldOf()) === false);
  // UI now shows false → second toggle hits the inherited value and clears the override
  await toggleBold("false");
  await until(async () => (await boldOf()) === undefined);
});

// REWRITTEN for the animations migration: the legacy fade-defaults panel
// (.fg-panel.defaults) and globals.fade_in_ms field were removed — global fade
// defaults are now ordinary global-scope alpha animations. The surviving fade
// affordance is the OpsToolbar "Group fade-in" shortcut, which writes a fade_in
// animation onto an anim_tag over the selection (Editor.groupFade →
// add_animation scope:"tag"). This exercises that round-trip.
test("G-23 — OpsToolbar Group fade-in adds an anim_tag fade record; Clear in reverts", async ({ page }) => {
  await openAudit(page);
  await selectWord0(page);   // selects word 0 → enables Group fade-in

  expect((await apiState()).anim_tags.length).toBe(0);
  await page.locator(".minibtn", { hasText: "Group fade-in" }).click();
  await until(async () => (await apiState()).anim_tags.some(
    (t: any) => t.ids.includes(0) && t.anims.some((a: any) => a.name === "fade_in"),
  ));

  // Clear in → the fade record (and its tag) is removed; state back to baseline
  await page.locator(".minibtn", { hasText: "Clear in" }).click();
  await until(async () => !(await apiState()).anim_tags.some(
    (t: any) => t.anims.some((a: any) => a.name === "fade_in"),
  ));
});

// REWRITTEN for the animations migration: the EventStrip `accumulate` 3-way was
// removed (timing is now an animation concern — the AM-phase timing-mode picker), and
// set_layout_props no longer carries `accumulate`. The linger round-trip — the
// surviving windowing control on EventStrip — is retained.
test("G-24 — EventStrip linger change layout props; undo reverts", async ({ page }) => {
  await openAudit(page);
  // EventStrip only renders after explicit group select
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-evt").first().click();
  await page.locator(".evt-strip").waitFor();

  const baseLinger = (await apiState()).layout[0].linger ?? 0;

  // linger +0.1
  await page.locator(".evt-strip .pv-step .pm").last().click();
  await until(async () => Math.abs(((await apiState()).layout[0].linger ?? 0) - (baseLinger + 0.1)) < 1e-6);

  // revert via undo
  await apiCall("undo");
  await until(async () => ((await apiState()).layout[0].linger ?? 0) === baseLinger);
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

  // arrow-step up by 0.05 (ADJ-17: re-focus first — pressing during the post-Enter
  // echo re-render can drop the keystroke; behavior verified correct manually)
  await startInput.click();
  await startInput.press("ArrowUp");
  await until(async () => Math.abs((await startOf()) - 0.85) < 0.01);

  // revert by typing original
  await startInput.fill(base.toFixed(3));
  await startInput.press("Enter");
  await until(async () => Math.abs((await startOf()) - base) < 0.01);
});
