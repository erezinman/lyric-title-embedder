// desktop/main.js — Electron main process. Spawns + supervises a local daemon in
// native mode, healthchecks it, opens the window on the daemon's origin, and bridges
// native file dialogs. Kills the daemon on every exit path (no orphans).
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const { freePort, daemonArgs, repoPaths } = require("./lib");

const SMOKE = process.argv.includes("--smoke");
// --shot <path> (or --shot=<path>): after the window loads, capture it to a PNG and
// quit. Headless visual smoke; no effect on a normal run.
function shotPath() {
  const i = process.argv.indexOf("--shot");
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith("--shot="));
  return eq ? eq.slice("--shot=".length) : null;
}
const SHOT = shotPath();
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
    icon: path.join(__dirname, "assets", "icon.png"),   // brand mark (window + taskbar)
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadURL(`http://127.0.0.1:${port}/`);

  if (SHOT) {
    await new Promise((res) => setTimeout(res, 1800));   // let React paint
    const img = await win.webContents.capturePage();
    require("fs").writeFileSync(SHOT, img.toPNG());
    console.log(`KSS_SHOT_OK ${SHOT}`);
    app.isQuitting = true; killDaemon(); app.quit();
  }
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

// macOS dock icon (Linux/Windows use the BrowserWindow icon above).
if (process.platform === "darwin" && app.dock) {
  try { app.dock.setIcon(path.join(__dirname, "assets", "icon.png")); } catch { /* non-fatal */ }
}

app.whenReady().then(start).catch((e) => { console.error(e); killDaemon(); app.exit(1); });
