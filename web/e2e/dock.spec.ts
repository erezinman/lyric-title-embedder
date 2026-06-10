import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { apiState, apiCall, resetProject, openAudit, until } from "./helpers";

test.beforeEach(async () => { await resetProject(); });

// Cue lanes live in the dock under the "Cue lanes" tab (default dockTab=lanes).
// .lane-row are word rows; .lane-evt are group headers.
async function ensureLanes(page: Page) {
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-row").first().waitFor();
}

// Read toks of group gi from state as arrays of id-arrays per line.
async function toksOf(gi: number): Promise<number[][]> {
  const s = await apiState();
  const out: number[][] = [];
  for (const ln of s.layout[gi].lines) for (const t of ln.toks) out.push(t.ids);
  return out;
}

test("G-10 — ctrl-click multi-select is VISIBLE (.multi row style differs)", async ({ page }) => {
  await openAudit(page);
  await ensureLanes(page);
  const rows = page.locator(".lane-row");

  // baseline computed background of an unselected row
  const bgOf = (i: number) =>
    rows.nth(i).evaluate((el) => {
      const s = getComputedStyle(el);
      return s.backgroundColor + "|" + s.boxShadow + "|" + s.borderColor;
    });
  const before = await bgOf(1);

  // plain click row 0, ctrl-click row 1 -> both multi
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ["Control"] });
  await expect(rows.nth(1)).toHaveClass(/multi/);

  const after = await bgOf(1);
  // The .multi class MUST produce a visually distinct row.
  expect(after).not.toBe(before);
});

test("G-11 — shift-range selects contiguous cues by time", async ({ page }) => {
  await openAudit(page);
  await ensureLanes(page);
  const rows = page.locator(".lane-row");
  await rows.nth(0).click();
  await rows.nth(3).click({ modifiers: ["Shift"] });
  // rows 0..3 (alpha..delta) should all be multi
  for (let i = 0; i < 4; i++) await expect(rows.nth(i)).toHaveClass(/multi/);
});

test("G-12 — merge 3 words -> toks [[0,1,2],[3]] in state; undo reverts", async ({ page }) => {
  await openAudit(page);
  await ensureLanes(page);
  const base = await toksOf(0);
  expect(base.slice(0, 4)).toEqual([[0], [1], [2], [3]]);

  const rows = page.locator(".lane-row");
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ["Control"] });
  await rows.nth(2).click({ modifiers: ["Control"] });
  await page.getByRole("button", { name: "Merge words" }).click();

  await until(async () => {
    const t = await toksOf(0);
    return t.length >= 2 && t[0].length === 3;
  });
  const merged = await toksOf(0);
  expect(merged[0]).toEqual([0, 1, 2]);
  expect(merged[1]).toEqual([3]);

  await apiCall("undo");
  await until(async () => {
    const t = await toksOf(0);
    return t[0].length === 1 && t.length === base.length;
  });
  expect(await toksOf(0)).toEqual(base);
});

test("G-13 — break-line toggles line count 2->3->2 in state + divider count in UI", async ({ page }) => {
  await openAudit(page);
  await ensureLanes(page);
  const linesOf = async () => (await apiState()).layout[0].lines.length;
  expect(await linesOf()).toBe(2);

  // select first word of line 0 (alpha) and break after it -> 3 lines
  const rows = page.locator(".lane-row");
  await rows.nth(0).click();
  await page.getByRole("button", { name: "Break line" }).click();
  await until(async () => (await linesOf()) === 3);
  // dividers = lines-1 = 2
  await expect(page.locator(".line-div")).toHaveCount(2);

  // toggle off: the break following a cue joins again -> back to 2
  // re-select alpha (now last in its single-word line 0); the button now reads
  // "Join line" (kit-match: the label flips when pressing would JOIN)
  await page.locator(".lane-row").nth(0).click();
  await page.getByRole("button", { name: "Join line" }).click();
  await until(async () => (await linesOf()) === 2);
  await expect(page.locator(".line-div")).toHaveCount(1);
});

test("G-14 — delete then restore round-trip (state del flag + strikethrough)", async ({ page }) => {
  await openAudit(page);
  await ensureLanes(page);
  const delOf = async () => (await apiState()).layout[0].lines[0].toks[0].del;
  expect(await delOf()).toBeFalsy();

  const rows = page.locator(".lane-row");
  await rows.nth(0).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await until(async () => (await delOf()) === true);
  await expect(rows.nth(0)).toHaveClass(/del/);
  await expect(rows.nth(0).locator("s")).toBeVisible();

  // toolbar now says Restore
  await rows.nth(0).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await until(async () => !(await delOf()));
  await expect(page.locator(".lane-row").nth(0)).not.toHaveClass(/del/);
});

// Coherent packing (the default density): cues are absolutely positioned by time
// in packed rows. Two cues of the SAME group never overlap in time → they share a
// row; and non-overlapping cues of DIFFERENT groups merge onto one row too. (A
// stray position:relative once dropped blocks into normal flow → vertical stack.)
test("G-14b — Coherent packs non-overlapping cues onto a shared row", async ({ page }) => {
  await openAudit(page);
  await page.locator(".dock-tab", { hasText: "Timeline" }).click();
  // The small audit project now defaults to Lanes density; select Coherent explicitly
  // so this test exercises the coherent packing semantics deterministically.
  await page.locator('.tl-toolrow .seg button[data-mode="coherent"]').click();
  await expect(page.locator(".tl-toolrow .seg button.on")).toHaveAttribute("data-mode", "coherent");
  await page.locator(".wt .wt-block").first().waitFor();
  await page.waitForTimeout(550);   // let the FLIP reflow from the default Lanes settle

  const byTitle = (prefix: string) =>
    page.locator(`.wt .wt-block[title^="${prefix}"]`).first();

  // same-group pair (Verse 1: alpha @0.5, bravo @1.5): same row, left→right by time
  const a = (await page.locator(".wt .wt-block").nth(0).boundingBox())!;
  const b = (await page.locator(".wt .wt-block").nth(1).boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(3);
  expect(b.x).toBeGreaterThan(a.x + a.width / 2);

  // cross-group, non-overlapping (Verse 1 ends 7.2 < Chorus "hotel" starts 7.5):
  // Coherent merges the two groups onto a single row.
  const alpha = (await byTitle("alpha").boundingBox())!;
  const hotel = (await byTitle(" hotel").boundingBox())!;
  expect(Math.abs(alpha.y - hotel.y)).toBeLessThan(3);
  expect(hotel.x).toBeGreaterThan(alpha.x + alpha.width / 2);
});

// Phase 4: the density toggle (.seg) reflows rows. Lanes (one row per group) yields
// MORE .wt-row than Coherent (groups share rows). The selected cue stays pinned at
// its viewport y across the toggle.
test("G-14c — Lanes yields more rows than Coherent; selected cue stays pinned", async ({ page }) => {
  await openAudit(page);
  await page.locator(".dock-tab", { hasText: "Timeline" }).click();
  await page.locator(".wt .wt-block").first().waitFor();

  const seg = page.locator(".tl-toolrow .seg");
  // The small audit project now defaults to Lanes density; select Coherent first so we
  // can measure the Coherent→Lanes reflow.
  await seg.locator('button[data-mode="coherent"]').click();
  await expect(seg.locator("button.on")).toHaveAttribute("data-mode", "coherent");

  // select the first cue so it can be pinned, then record its viewport y in Coherent
  const sel = page.locator(".wt .wt-block.sel").first();
  if (!(await sel.count())) {
    await page.locator(".wt .wt-block").first().click();
  }
  const selBlock = page.locator(".wt .wt-block.sel").first();
  await selBlock.waitFor();
  const yBefore = (await selBlock.boundingBox())!.y;
  const coherentRows = await page.locator(".wt .wt-row").count();

  // switch to Lanes
  await seg.locator('button[data-mode="lanes"]').click();
  await expect(seg.locator("button.on")).toHaveAttribute("data-mode", "lanes");
  await page.locator(".wt.lanes .wt-gutter").first().waitFor();
  // let the FLIP transition settle
  await page.waitForTimeout(550);

  const lanesRows = await page.locator(".wt .wt-row").count();
  expect(lanesRows).toBeGreaterThan(coherentRows);

  // the selected cue's viewport y is preserved within a small tolerance
  const yAfter = (await page.locator(".wt .wt-block.sel").first().boundingBox())!.y;
  expect(Math.abs(yAfter - yBefore)).toBeLessThan(24);
});

test("G-15 — WordTrack drag (unlocked) shifts word times; drag-back ~ restores", async ({ page }) => {
  await openAudit(page);
  // switch to Timeline tab
  await page.locator(".dock-tab", { hasText: "Timeline" }).click();
  await page.locator(".wt .block").first().waitFor();

  // unlock timings via TimingPanel — first select a word so the panel renders.
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-row").first().click();
  await page.locator(".rail-tab", { hasText: "Inspector" }).click();
  await page.locator(".lock-pill").click();
  await expect(page.locator(".lock-pill")).toContainText("unlocked");

  await page.locator(".dock-tab", { hasText: "Timeline" }).click();
  const block = page.locator(".wt .block").first();
  await block.waitFor();

  const base = (await apiState()).words[0].start as number;
  const bb = (await block.boundingBox())!;
  const cx = bb.x + bb.width / 2;
  const cy = bb.y + bb.height / 2;

  // drag right by ~90px over the area
  const area = (await page.locator(".wt-area").first().boundingBox())!;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 90, cy, { steps: 8 });
  await page.mouse.up();

  await until(async () => Math.abs((await apiState()).words[0].start - base) > 0.05);
  const moved = (await apiState()).words[0].start as number;
  const dt = moved - base;
  // expected dt = (90 / areaWidth) * dur ; dur derived from state
  const s = await apiState();
  const dur = Math.max(8, ...s.words.map((w: any) => w.end)) + 1.5;
  const expected = (90 / area.width) * dur;
  expect(Math.abs(dt - expected)).toBeLessThan(0.05 + expected * 0.2);

  // revert
  await apiCall("undo");
  await until(async () => Math.abs((await apiState()).words[0].start - base) < 0.001);
});

test("G-16 — timing lock gating: a locked WordTrack drag does nothing to state", async ({ page }) => {
  await openAudit(page);
  await page.locator(".dock-tab", { hasText: "Timeline" }).click();
  const block = page.locator(".wt .block").first();
  await block.waitFor();
  // ensure locked: .wt should NOT have unlocked class
  await expect(page.locator(".wt")).not.toHaveClass(/unlocked/);

  const base = (await apiState()).words[0].start as number;
  const bb = (await block.boundingBox())!;
  const cx = bb.x + bb.width / 2;
  const cy = bb.y + bb.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 90, cy, { steps: 8 });
  await page.mouse.up();

  await page.waitForTimeout(300);
  expect((await apiState()).words[0].start).toBe(base);
});

// ADJ-19 (user-reported): edits must SURVIVE re-opening the project — the
// daemon autosaves; before this, every edit lived only in memory.
test("G-17 — a line break persists across project re-open (autosave)", async ({ page }) => {
  await openAudit(page);
  const n0 = (await apiState()).layout[0].lines.length;
  await page.locator(".lane-row", { hasText: "bravo" }).first().click();
  await page.getByRole("button", { name: "Break line" }).click();
  await until(async () => (await apiState()).layout[0].lines.length === n0 + 1);
  await new Promise((r) => setTimeout(r, 700));   // let the autosave land
  // re-open WITHOUT restoring pristine (direct API, not resetProject)
  await fetch("http://127.0.0.1:8799/api/projects/open", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "audit" }),
  });
  await until(async () => (await apiState()).layout[0].lines.length === n0 + 1);
});
