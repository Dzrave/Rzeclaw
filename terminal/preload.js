const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  configRead: () => ipcRenderer.invoke("config:read"),
  configWrite: (data) => ipcRenderer.invoke("config:write", data),
  discoveryScan: () => ipcRenderer.invoke("discovery:scan"),
});
