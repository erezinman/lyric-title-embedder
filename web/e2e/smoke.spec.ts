import { test, expect } from "@playwright/test";
import { apiState, apiCall, resetProject, openAudit, until } from "./helpers";

test.beforeEach(async () => { await resetProject(); });

test("infra: seeded project opens; side-channel edit syncs to UI and reverts", async ({ page }) => {
  await openAudit(page);
  const s0 = await apiState();
  expect(s0.words).toHaveLength(9);
  expect(s0.layout.map((g: any) => g.label)).toEqual(["Verse 1", "Chorus"]);

  // side-channel edit (MCP path): bold off on group 0 -> UI inspector unaffected here,
  // but state must change and the external toast must appear
  await apiCall("set_group_style", { gi: 0, partial: { fontsize: 90 } });
  await until(async () => (await apiState()).layout[0].style.fontsize === 90);
  await expect(page.locator(".toast.ai")).toBeVisible();

  // revert via side-channel undo; state returns to baseline
  await apiCall("undo");
  await until(async () => (await apiState()).layout[0].style.fontsize === undefined);
});
