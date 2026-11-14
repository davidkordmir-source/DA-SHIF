const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  reminderStatus: () => ipcRenderer.invoke("reminder:status"),
  readData: () => ipcRenderer.sendSync("data:read"),
  writeData: (json) => ipcRenderer.sendSync("data:write", json),
  ready: () => ipcRenderer.send("app:ready"),
  branding: () => ipcRenderer.invoke("branding:read"),
  chooseLogo: () => ipcRenderer.invoke("branding:choose"),
  openInstallFolder: () => ipcRenderer.invoke("folder:install"),
  openDataFolder: () => ipcRenderer.invoke("folder:data"),
});
