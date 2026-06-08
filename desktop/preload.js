// desktop/preload.js — exposes a minimal, audited bridge to the renderer (web UI).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kss", {
  isDesktop: true,
  // opts: { filters?: [{name, extensions}], defaultPath? } -> absolute path or null
  pickOpen: (opts) => ipcRenderer.invoke("kss:pickOpen", opts),
  pickSave: (opts) => ipcRenderer.invoke("kss:pickSave", opts),
});
