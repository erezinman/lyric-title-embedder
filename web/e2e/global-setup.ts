// e2e/global-setup.ts — spin up the REAL daemon (temp projects dir) + vite dev
// on test ports, then seed the "audit" project from the committed fixture.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));

export const DAEMON_PORT = 8799;
export const VITE_PORT = 5199;
// A second vite with the live renderer disabled (VITE_JASSUB=0) so the AJ tier
// can assert the feature flag turns the jassub canvas off.
export const VITE_NOJASS_PORT = 5198;
const ROOT = resolve(HERE, "..", "..");               // repo root
const PIDFILE = join(tmpdir(), "kss-e2e-pids.json");

async function waitFor(url: string, tries = 80): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`timed out waiting for ${url}`);
}

export default async function globalSetup(): Promise<void> {
  const projectsDir = mkdtempSync(join(tmpdir(), "kss-e2e-"));

  const daemon = spawn(
    join(ROOT, ".venv", "bin", "python"),
    ["-m", "daemon", "--projects-dir", projectsDir, "--port", String(DAEMON_PORT)],
    { cwd: ROOT, stdio: "ignore", detached: true },
  );

  const vite = spawn(
    "npm", ["run", "dev", "--", "--port", String(VITE_PORT), "--strictPort"],
    {
      cwd: join(ROOT, "web"),
      env: { ...process.env, KSS_DAEMON_URL: `http://127.0.0.1:${DAEMON_PORT}` },
      stdio: "ignore",
      detached: true,
    },
  );

  const viteNoJass = spawn(
    "npm", ["run", "dev", "--", "--port", String(VITE_NOJASS_PORT), "--strictPort"],
    {
      cwd: join(ROOT, "web"),
      env: { ...process.env, KSS_DAEMON_URL: `http://127.0.0.1:${DAEMON_PORT}`, VITE_JASSUB: "0" },
      stdio: "ignore",
      detached: true,
    },
  );

  writeFileSync(PIDFILE, JSON.stringify({
    daemon: daemon.pid, vite: vite.pid, viteNoJass: viteNoJass.pid, projectsDir,
  }));

  await waitFor(`http://127.0.0.1:${DAEMON_PORT}/api/env`);
  await waitFor(`http://localhost:${VITE_PORT}/`);
  await waitFor(`http://localhost:${VITE_NOJASS_PORT}/`);

  // seed the "audit" project from the committed fixture (multipart upload)
  const lyrics = readFileSync(join(HERE, "fixtures", "lyrics.json"));
  const form = new FormData();
  form.set("name", "audit");
  form.set("source", "suno_json");
  form.set("lyrics_file", new Blob([lyrics], { type: "application/json" }), "lyrics.json");
  const res = await fetch(`http://127.0.0.1:${DAEMON_PORT}/api/projects/create`, {
    method: "POST", body: form,
  });
  if (!res.ok) throw new Error(`seeding the audit project failed: ${res.status} ${await res.text()}`);

  // snapshot pristine project files — the daemon AUTOSAVES edits now, so the
  // per-test reset restores these before re-opening (see helpers.resetProject)
  const projDir = join(projectsDir, "audit");
  copyFileSync(join(projDir, "project.json"), join(projDir, "project.json.pristine"));
  copyFileSync(join(projDir, "lyrics.json"), join(projDir, "lyrics.json.pristine"));
}
