import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { apiState, resetProject, openAudit, until } from "./helpers";

test.beforeEach(async () => { await resetProject(); });

async function selectWord0(page: Page) {
  await page.locator(".dock-tab", { hasText: "Cue lanes" }).click();
  await page.locator(".lane-row").first().click();
  await page.locator(".rail-tab", { hasText: "Inspector" }).click();
}
// own animations on the cue tag covering word 0
async function cueAnims(): Promise<Array<Record<string, unknown>>> {
  const s = await apiState();
  const tag = (s.anim_tags ?? []).find((t: { ids: number[] }) => t.ids.includes(0));
  return (tag?.anims ?? []) as Array<Record<string, unknown>>;
}

test("AC-1 — ＋Custom adds a custom record; flipping Property to Scale pairs scale_x+scale_y (lead id kept)", async ({ page }) => {
  await openAudit(page);
  await selectWord0(page);
  const cueTier = page.locator(".tier.append.cue");

  await cueTier.getByRole("button", { name: /Add animation/i }).click();
  await cueTier.getByRole("button", { name: /Custom/i }).click();

  // a single custom record is added on the cue tag
  await until(async () => { const a = await cueAnims(); return a.length === 1 && a[0].custom === true; });
  const leadId = (await cueAnims())[0].id as string;
  expect((await cueAnims())[0].channel).toBe("primary");

  // change Property → Scale in the open row's CustomEditor
  const editing = cueTier.locator(".ov-row.anim-ov.editing");
  await editing.locator(".cb-select").first().selectOption("scale_x");

  // now two records (scale_x + scale_y) sharing the preserved lead id as group_id
  await until(async () => (await cueAnims()).length === 2);
  const anims = await cueAnims();
  expect(anims.map((a) => a.channel)).toEqual(["scale_x", "scale_y"]);
  expect(anims[0].id).toBe(leadId);                       // lead id preserved
  expect(anims[0].group_id).toBe(leadId);
  expect(anims[1].group_id).toBe(leadId);
});

test("AC-2 — editing a Pop preset's timing window moves BOTH scale channels (sibling-sync)", async ({ page }) => {
  await openAudit(page);
  await selectWord0(page);
  const cueTier = page.locator(".tier.append.cue");

  await cueTier.getByRole("button", { name: /Add animation/i }).click();
  await cueTier.getByRole("button", { name: /^Pop$/i }).click();
  await until(async () => (await cueAnims()).length === 2); // scale_x + scale_y

  // the new row opened expanded → SegmentTiming "To" offset; bump it up
  const editing = cueTier.locator(".ov-row.anim-ov.editing");
  const toRow = editing.locator(".seg-timing .cb-row", { hasText: "To" });
  const before = (await cueAnims())[0] as { segments: { t1: { offset: number } }[] };
  const t1Before = before.segments[0].t1.offset;
  await toRow.locator(".cb-step .pm").last().click(); // "+" bumps t1 by 10ms

  await until(async () => {
    const a = await cueAnims();
    return (a[0] as { segments: { t1: { offset: number } }[] }).segments[0].t1.offset !== t1Before;
  });
  const a = await cueAnims() as { channel: string; segments: { t1: { offset: number } }[] }[];
  // both siblings moved to the same new offset
  expect(a[0].segments[0].t1.offset).toBe(a[1].segments[0].t1.offset);
  expect(a[0].segments[0].t1.offset).toBe(t1Before + 10);
});
