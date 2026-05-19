const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const APP_URL = (process.env.ORRYON_APP_URL || "https://orryon.vercel.app").replace(/\/$/, "");
const DESKTOP_UA = "OrryonDesktop/1.0";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: "Orryon",
    icon: path.join(__dirname, "build", "icon.png"),
    backgroundColor: "#000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} ${DESKTOP_UA}`);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Cursor-style: open the installed app, then sign in (not the marketing download page).
  win.loadURL(`${APP_URL}/login?step=email`);

  win.on("closed", () => {
    app.quit();
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
