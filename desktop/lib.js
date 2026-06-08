// desktop/lib.js — pure helpers for the Electron main process (no electron import,
// so they're unit-testable with node:test).
const net = require("net");
const path = require("path");

// Resolve an ephemeral free TCP port on loopback (avoids clashing with a dev daemon).
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// argv for `python -m daemon …`. ALWAYS native (the desktop shell is same-machine).
function daemonArgs({ port, projectsDir, webDist }) {
  return [
    "-m", "daemon", "--file-access", "native",
    "--projects-dir", projectsDir, "--port", String(port), "--web-dist", webDist,
  ];
}

// Resolve repo-relative paths from a given repo root.
function repoPaths(root) {
  return {
    repoRoot: root,
    pythonPath: path.join(root, ".venv", "bin", "python"),
    webDist: path.join(root, "web", "dist"),
    defaultProjectsDir: path.join(root, "projects"),
  };
}

module.exports = { freePort, daemonArgs, repoPaths };
