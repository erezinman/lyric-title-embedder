import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { apiState, apiCall, resetProject, openAudit, until } from "./helpers";

test.beforeEach(async () => { await resetProject(); });

// Each case: NO UI interaction -> side-channel apiCall -> until(UI reflects) ->
// .toast.ai appeared -> apiCall("undo") -> UI reverts.

async function ensureLanes(page: Page) {
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-row").first().waitFor();
}

test("G-40 — external set_group_style fontsize: GROUP tier prow + toast + undo", async ({ page }) => {
  await openAudit(page);
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-evt").first().click();
  await page.locator(".rail-tab", { hasText: "Inspector" }).click();

  await apiCall("set_group_style", { gi: 0, partial: { fontsize: 120 } });
  await until(async () => (await apiState()).layout[0].style.fontsize === 120);
  await expect(page.locator(".tier3.group .prow", { has: page.locator(".pl", { hasText: "Size" }) }))
    .toContainText("120");
  await expect(page.locator(".toast.ai")).toBeVisible();

  await apiCall("undo");
  await until(async () => (await apiState()).layout[0].style.fontsize === undefined);
});

test("G-41 — external set_cue_style primary: caption span color + undo", async ({ page }) => {
  await openAudit(page);
  await ensureLanes(page);
  await apiCall("set_cue_style", { word_ids: [0], partial: { primary: "#FF3DA6" } });
  await until(async () => (await apiState()).layout[0].lines[0].toks[0].style.primary === "#FF3DA6");
  await expect(page.locator(".toast.ai")).toBeVisible();
  await apiCall("undo");
  await until(async () => (await apiState()).layout[0].lines[0].toks[0].style.primary === undefined);
});

test("G-42 — external set_word_text: lane row text updates + undo", async ({ page }) => {
  await openAudit(page);
  await ensureLanes(page);
  await apiCall("set_word_text", { wid: 0, text: "ALPHAX" });
  await until(async () => (await apiState()).words[0].text === "ALPHAX");
  await expect(page.locator(".lane-row").first()).toContainText("ALPHAX");
  await apiCall("undo");
  await until(async () => (await apiState()).words[0].text === "alpha");
  await expect(page.locator(".lane-row").first()).not.toContainText("ALPHAX");
});

test("G-43 — external set_word_times: WordTrack block geometry + undo", async ({ page }) => {
  await openAudit(page);
  await page.locator(".dock-tab", { hasText: "Timeline" }).click();
  const block = page.locator(".wt .block").first();
  await block.waitFor();
  const left0 = (await block.boundingBox())!.x;

  const base = (await apiState()).words[0];
  await apiCall("set_word_times", { updates: [{ wid: 0, start: 3.0, end: 3.7 }] });
  await until(async () => Math.abs((await apiState()).words[0].start - 3.0) < 1e-6);
  await expect.poll(async () => (await block.boundingBox())!.x).toBeGreaterThan(left0 + 10);

  await apiCall("undo");
  await until(async () => Math.abs((await apiState()).words[0].start - base.start) < 1e-6);
});

test("G-44 — external break_line: divider count + undo", async ({ page }) => {
  await openAudit(page);
  await ensureLanes(page);
  expect((await apiState()).layout[0].lines.length).toBe(2);
  await apiCall("break_line", { gi: 0, li: 0, ti: 0, after: true });
  await until(async () => (await apiState()).layout[0].lines.length === 3);
  await expect(page.locator(".line-div")).toHaveCount(2);
  await apiCall("undo");
  await until(async () => (await apiState()).layout[0].lines.length === 2);
});

test("G-45 — external merge_word_span: merged badge + undo", async ({ page }) => {
  await openAudit(page);
  await ensureLanes(page);
  await apiCall("merge_word_span", { gi: 0, li: 0, ti_first: 0, ti_last: 1, sep: " " });
  await until(async () => (await apiState()).layout[0].lines[0].toks[0].ids.length === 2);
  await expect(page.locator(".lane-row .mtag").first()).toBeVisible();
  await apiCall("undo");
  await until(async () => (await apiState()).layout[0].lines[0].toks[0].ids.length === 1);
});

test("G-46 — external delete_words (toggle_word_del): strikethrough + undo", async ({ page }) => {
  await openAudit(page);
  await ensureLanes(page);
  await apiCall("delete_words", { word_ids: [0] });
  await until(async () => (await apiState()).layout[0].lines[0].toks[0].del === true);
  await expect(page.locator(".lane-row").first()).toHaveClass(/del/);
  await apiCall("undo");
  await until(async () => !(await apiState()).layout[0].lines[0].toks[0].del);
});

test("G-47 — external set_layout_props linger: group header +linger + undo", async ({ page }) => {
  await openAudit(page);
  await ensureLanes(page);
  await apiCall("set_layout_props", { gi: 0, linger: 1.5, accumulate: "words" });
  await until(async () => ((await apiState()).layout[0].linger ?? 0) === 1.5);
  await expect(page.locator(".lane-evt").first().locator(".rng")).toContainText("+1.5s");
  await apiCall("undo");
  await until(async () => ((await apiState()).layout[0].linger ?? 0) !== 1.5);
});

test("G-48 — external make_fade_tag: fin_tags populated + lane fade cell grouped + undo", async ({ page }) => {
  await openAudit(page);
  await ensureLanes(page);
  await apiCall("make_fade_tag", { kind: "in", word_ids: [0] });
  await until(async () => (await apiState()).fin_tags.some((t: any) => t.ids.includes(0)));
  await expect(page.locator(".lane-row").first().locator(".lc.fade.grouped").first()).toBeVisible();
  await apiCall("undo");
  await until(async () => !(await apiState()).fin_tags.some((t: any) => t.ids.includes(0)));
});

test("G-49 — external set_fade_defaults: FadeDefaults panel value + undo", async ({ page }) => {
  await openAudit(page);
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-row").first().click();
  await page.locator(".rail-tab", { hasText: "Inspector" }).click();
  const base = (await apiState()).globals.fade_in_ms as number;

  await apiCall("set_fade_defaults", { fade_in_ms: base + 100 });
  await until(async () => (await apiState()).globals.fade_in_ms === base + 100);
  await expect(page.locator(".fg-panel.defaults .fd-row", { has: page.locator(".fd-l", { hasText: "Fade-in" }) }))
    .toContainText(String(base + 100));
  await apiCall("undo");
  await until(async () => (await apiState()).globals.fade_in_ms === base);
});

// FINDING G-50: external set_globals align lands and the UI reflects it, but
// undo does not revert align (placement edits bypass undo history).
test("G-50 — external set_globals align: align grid label + caption shift + undo", async ({ page }) => {
  test.fail();
  await openAudit(page);
  await page.locator(".rail-tab", { hasText: "Project" }).click();
  await apiCall("set_globals", { partial: { align: 8 } });
  await until(async () => (await apiState()).placement.align === 8);
  await expect(page.locator(".rail-body .kit-sel").first()).toContainText("Top-Center");
  await apiCall("undo");
  await until(async () => (await apiState()).placement.align === 2);
});

// FINDING G-51: external set_globals use_pos+pos lands (pin appears), but undo
// does not clear use_pos/pos (placement edits bypass undo history).
test("G-51 — external set_globals use_pos+pos: pin appears + undo", async ({ page }) => {
  test.fail();
  await openAudit(page);
  await expect(page.locator(".bbox")).toBeVisible();
  await apiCall("set_globals", { partial: { use_pos: true, pos: [960, 540] } });
  await until(async () => {
    const p = (await apiState()).placement;
    return p.use_pos === true && Array.isArray(p.pos);
  });
  await expect(page.locator(".pinbox")).toBeVisible();
  await apiCall("undo");
  await until(async () => {
    const p = (await apiState()).placement;
    return !p.use_pos && p.pos == null;
  });
  await expect(page.locator(".bbox")).toBeVisible();
});

test("G-52 — external split_event then merge_events round-trip in state + lane headers", async ({ page }) => {
  await openAudit(page);
  await ensureLanes(page);
  const baseGroups = (await apiState()).layout.length;
  expect(baseGroups).toBe(2);

  // split group 0 (Verse 1, 2 lines) at line_index 1 -> 3 groups
  await apiCall("split_event", { gi: 0, line_index: 1 });
  await until(async () => (await apiState()).layout.length === 3);
  await expect(page.locator(".lane-evt")).toHaveCount(3);

  // merge the two halves back -> 2 groups
  await apiCall("merge_events", { gidxs: [0, 1] });
  await until(async () => (await apiState()).layout.length === 2);
  await expect(page.locator(".lane-evt")).toHaveCount(2);
});
