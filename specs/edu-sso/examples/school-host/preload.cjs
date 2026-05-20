// Preload runs with contextIsolation + sandbox. CommonJS to stay compatible
// with the sandboxed preload runtime regardless of the package's module type.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("host", {
  getStudent: () => ipcRenderer.invoke("student:get"),
  listApps: () => ipcRenderer.invoke("apps:list"),
  openApp: (id) => ipcRenderer.invoke("app:open", id),
  closeApp: () => ipcRenderer.invoke("app:close"),
  onOpened: (cb) => {
    const handler = (_e, id) => cb(id);
    ipcRenderer.on("app:opened", handler);
    return () => ipcRenderer.removeListener("app:opened", handler);
  },
  onClosed: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("app:closed", handler);
    return () => ipcRenderer.removeListener("app:closed", handler);
  },
  onError: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on("app:error", handler);
    return () => ipcRenderer.removeListener("app:error", handler);
  },
});
