import { test, expect } from "@playwright/test";
import { resetProject, openAudit } from "./helpers";

test.beforeEach(async () => { await resetProject(); });

test("G-60 — Export popover opens and shows the form", async ({ page }) => {
  await openAudit(page);
  await page.getByRole("button", { name: "Export" }).click();
  const pop = page.locator(".export-pop");
  await expect(pop).toBeVisible();
  await expect(pop.locator(".exp-h")).toContainText("Export");
});

test("G-61 — burn-field default output name = <project>_subbed.mp4", async ({ page }) => {
  await openAudit(page);
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.locator('.export-pop input[aria-label="Output file"]'))
    .toHaveValue("audit_subbed.mp4");
});

test("G-62 — Download .ass triggers a real download named audit.ass with [Script Info]", async ({ page }) => {
  await openAudit(page);
  await page.getByRole("button", { name: "Export" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator('.export-pop [aria-label="Download .ass"]').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("audit.ass");

  // read the streamed content
  const stream = await download.createReadStream();
  let content = "";
  for await (const chunk of stream) content += chunk.toString();
  expect(content.length).toBeGreaterThan(0);
  expect(content).toContain("[Script Info]");
});

test("G-63 — Download .srt and .vtt trigger real downloads with the right content", async ({ page }) => {
  await openAudit(page);
  await page.getByRole("button", { name: "Export" }).click();

  // .srt
  const srtDl = page.waitForEvent("download");
  await page.locator('.export-pop [aria-label="Download .srt"]').click();
  const srt = await srtDl;
  expect(srt.suggestedFilename()).toBe("audit.srt");
  let srtText = "";
  for await (const chunk of await srt.createReadStream()) srtText += chunk.toString();
  expect(srtText).toMatch(/-->/);                     // SRT timing arrow

  // .vtt — a download closes the popover (onClose), so reopen Export first
  await page.getByRole("button", { name: "Export" }).click();
  const vttDl = page.waitForEvent("download");
  await page.locator('.export-pop [aria-label="Download .vtt"]').click();
  const vtt = await vttDl;
  expect(vtt.suggestedFilename()).toBe("audit.vtt");
  let vttText = "";
  for await (const chunk of await vtt.createReadStream()) vttText += chunk.toString();
  expect(vttText).toContain("WEBVTT");
});
