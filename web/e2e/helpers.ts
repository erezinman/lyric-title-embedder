// e2e/helpers.ts — shared helpers for the audit e2e tier.
import type { Page } from "@playwright/test";
import { readFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const DAEMON = "http://127.0.0.1:8799";

/** The daemon's authoritative project state (the "internal data state"). */
export async function apiState(): Promise<Record<string, any>> {
  const r = await fetch(`${DAEMON}/api/state`);
  if (!r.ok) throw new Error(`/api/state ${r.status}`);
  return r.json();
}

/** Side-channel tool call — impersonates the MCP agent (never via the UI). */
export async function apiCall(tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const r = await fetch(`${DAEMON}/api/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, args }),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(`tool ${tool}: ${data.error ?? r.status}`);
  return data.result;
}

/** Reset the project: wait out any pending autosave (the daemon persists edits
 * now), restore the pristine snapshot taken at seed time, then re-open. */
export async function resetProject(name = "audit"): Promise<void> {
  await new Promise((r) => setTimeout(r, 600));   // > autosave debounce (400ms)
  const pidfile = join(tmpdir(), "kss-e2e-pids.json");
  if (existsSync(pidfile)) {
    const { projectsDir } = JSON.parse(readFileSync(pidfile, "utf-8"));
    const dir = join(projectsDir, name);
    if (existsSync(join(dir, "project.json.pristine"))) {
      copyFileSync(join(dir, "project.json.pristine"), join(dir, "project.json"));
      copyFileSync(join(dir, "lyrics.json.pristine"), join(dir, "lyrics.json"));
    }
  }
  const r = await fetch(`${DAEMON}/api/projects/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error(`reset failed: ${r.status}`);
}

/** Open the seeded project in the browser and wait for the editor. */
export async function openAudit(page: Page, name = "audit"): Promise<void> {
  await page.goto("/");
  await page.locator(".proj", { hasText: name }).click();
  await page.locator(".lane-row").first().waitFor();   // editor + lanes rendered
}

/** Poll until fn() is truthy (deterministic wait on server state propagation). */
export async function until<T>(fn: () => Promise<T>, tries = 40, ms = 100): Promise<T> {
  let last: T | undefined;
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, ms));
  }
  throw new Error(`condition not met; last=${JSON.stringify(last)}`);
}
