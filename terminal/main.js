const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;

function getConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile("index.html");
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle("config:read", () => {
  const p = getConfigPath();
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return { gatewayUrl: "ws://127.0.0.1:18789", apiKey: "" };
  }
});

ipcMain.handle("config:write", (_event, data) => {
  const p = getConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  return true;
});

ipcMain.handle("discovery:scan", () => {
  return new Promise((resolve) => {
    const list = [];
    try {
      const bonjour = require("bonjour")();
      bonjour.find({ type: "rzeclaw" }, (service) => {
        const host = service.host || service.referer?.address || "localhost";
        const port = service.port || 18789;
        list.push({
          name: service.name || "Rzeclaw",
          host,
          port,
          url: `ws://${host}:${port}`,
        });
      });
      setTimeout(() => {
        bonjour.destroy();
        resolve(list);
      }, 5000);
    } catch (e) {
      resolve([]);
    }
  });
});
