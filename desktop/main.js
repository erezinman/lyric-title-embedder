// desktop/main.js — Electron main process. Spawns + supervises a local daemon in
// native mode, healthchecks it, opens the window on the daemon's origin, and bridges
// native file dialogs. Kills the daemon on every exit path (no orphans).
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const { freePort, daemonArgs, repoPaths } = require("./lib");

const SMOKE = process.argv.includes("--smoke");
let daemon = null;

function killDaemon() {
  if (daemon && !daemon.killed) {
    try { daemon.kill("SIGTERM"); } catch { /* already gone */ }
  }
  daemon = null;
}

async function waitHealthy(port, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/env`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  return false;
}

async function start() {
  const { repoRoot, pythonPath, webDist, defaultProjectsDir } =
    repoPaths(path.resolve(__dirname, ".."));
  const port = await freePort();
  const projectsDir = process.env.KSS_PROJECTS_DIR || defaultProjectsDir;

  daemon = spawn(pythonPath, daemonArgs({ port, projectsDir, webDist }),
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
  daemon.stderr.on("data", (d) => process.stderr.write(`[daemon] ${d}`));
  daemon.on("exit", (code) => {
    daemon = null;
    if (!app.isQuitting) { console.error(`daemon exited unexpectedly (code ${code})`); app.quit(); }
  });

  const ok = await waitHealthy(port);
  if (!ok) {
    console.error("daemon healthcheck failed");
    if (!SMOKE) dialog.showErrorBox("Karaoke Subtitle Studio", "The local daemon failed to start.");
    killDaemon();
    app.exit(1);
    return;
  }

  if (SMOKE) { console.log("KSS_SMOKE_OK"); app.isQuitting = true; killDaemon(); app.quit(); return; }

  const win = new BrowserWindow({
    width: 1440, height: 900, title: "Karaoke Subtitle Studio",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

ipcMain.handle("kss:pickOpen", async (_e, opts) => {
  const r = await dialog.showOpenDialog({ properties: ["openFile"], filters: opts && opts.filters });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});

ipcMain.handle("kss:pickSave", async (_e, opts) => {
  const r = await dialog.showSaveDialog({
    defaultPath: opts && opts.defaultPath, filters: opts && opts.filters,
  });
  return r.canceled || !r.filePath ? null : r.filePath;
});

app.on("before-quit", () => { app.isQuitting = true; killDaemon(); });
app.on("window-all-closed", () => { killDaemon(); app.quit(); });
process.on("SIGINT", () => { app.isQuitting = true; killDaemon(); app.exit(0); });
process.on("SIGTERM", () => { app.isQuitting = true; killDaemon(); app.exit(0); });

app.whenReady().then(start).catch((e) => { console.error(e); killDaemon(); app.exit(1); });
