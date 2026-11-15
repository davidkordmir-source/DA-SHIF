const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  readData: () => ipcRenderer.sendSync("data:read"),
  readBackup: () => ipcRenderer.sendSync("data:backup"),
  writeData: (json, recovering = false) => ipcRenderer.sendSync("data:write", json, recovering),
  ready: () => ipcRenderer.send("app:ready"),
  branding: () => ipcRenderer.invoke("branding:read"),
  chooseLogo: () => ipcRenderer.invoke("branding:choose"),
  openInstallFolder: () => ipcRenderer.invoke("folder:install"),
  openDataFolder: () => ipcRenderer.invoke("folder:data"),
});
