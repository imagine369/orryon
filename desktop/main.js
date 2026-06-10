const { app, BrowserWindow, shell, session, systemPreferences } = require("electron");
const path = require("path");

const APP_URL = (process.env.ORRYON_APP_URL || "https://orryon.vercel.app").replace(/\/$/, "");
const DESKTOP_UA = "OrryonDesktop/1.0";
const MIC_PERMISSIONS = new Set(["media", "audioCapture", "videoCapture"]);

function configureMediaPermissions() {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler(async (_webContents, permission, callback) => {
    if (!MIC_PERMISSIONS.has(permission)) {
      callback(false);
      return;
    }
    if (process.platform === "darwin") {
      try {
        callback(await systemPreferences.askForMediaAccess("microphone"));
      } catch {
        callback(false);
      }
      return;
    }
    callback(true);
  });

  ses.setPermissionCheckHandler((_webContents, permission) =>
    MIC_PERMISSIONS.has(permission),
  );
}

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

app.whenReady().then(() => {
  configureMediaPermissions();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
