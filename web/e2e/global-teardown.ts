// e2e/global-teardown.ts — stop the daemon + vite started by global-setup.
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PIDFILE = join(tmpdir(), "kss-e2e-pids.json");

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(PIDFILE)) return;
  const { daemon, vite, viteNoJass, projectsDir } = JSON.parse(readFileSync(PIDFILE, "utf-8"));
  for (const pid of [vite, viteNoJass, daemon]) {
    if (!pid) continue;
    try { process.kill(-pid, "SIGTERM"); } catch { try { process.kill(pid, "SIGTERM"); } catch { /* gone */ } }
  }
  await new Promise((r) => setTimeout(r, 1000));
  for (const pid of [vite, viteNoJass, daemon]) {
    if (!pid) continue;
    try { process.kill(pid, "SIGKILL"); } catch { /* gone */ }
  }
  try { rmSync(projectsDir, { recursive: true, force: true }); } catch { /* best effort */ }
  rmSync(PIDFILE, { force: true });
}
