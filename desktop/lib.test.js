const { test } = require("node:test");
const assert = require("node:assert");
const { freePort, daemonArgs, repoPaths } = require("./lib");

test("freePort returns a usable TCP port", async () => {
  const p = await freePort();
  assert.ok(Number.isInteger(p) && p > 0 && p < 65536, `got ${p}`);
});

test("daemonArgs always launches the daemon in native mode", () => {
  const a = daemonArgs({ port: 8771, projectsDir: "/p", webDist: "/w" });
  assert.deepStrictEqual(a, [
    "-m", "daemon", "--file-access", "native",
    "--projects-dir", "/p", "--port", "8771", "--web-dist", "/w",
  ]);
});

test("repoPaths resolves the venv python and web dist under the repo root", () => {
  const r = repoPaths("/repo");
  assert.strictEqual(r.repoRoot, "/repo");
  assert.strictEqual(r.pythonPath, "/repo/.venv/bin/python");
  assert.strictEqual(r.webDist, "/repo/web/dist");
  assert.strictEqual(r.defaultProjectsDir, "/repo/projects");
});
