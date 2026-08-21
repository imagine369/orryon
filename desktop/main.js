const { app, BrowserWindow, shell, session, systemPreferences } = require("electron");
const path = require("path");

const APP_URL = (process.env.ORRYON_APP_URL || "https://www.orryon.com").replace(/\/$/, "");
const DESKTOP_UA = "OrryonDesktop/1.0";
const MIC_PERMISSIONS = new Set(["media", "audioCapture", "videoCapture"]);

function macMicrophoneGranted() {
  if (process.platform !== "darwin") return true;
  return systemPreferences.getMediaAccessStatus("microphone") === "granted";
}

async function ensureMacMicrophoneAccess() {
  if (process.platform !== "darwin") return;
  if (macMicrophoneGranted()) return;
  try {
    await systemPreferences.askForMediaAccess("microphone");
  } catch {
    // User declined or OS error — page-level getUserMedia will surface a message.
  }
}

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

  // Must reflect real macOS status — returning true unconditionally skips askForMediaAccess.
  ses.setPermissionCheckHandler((_webContents, permission) => {
    if (!MIC_PERMISSIONS.has(permission)) return false;
    return macMicrophoneGranted();
  });

  // Electron may omit Origin on same-origin API POSTs; backend origin enforcement needs it.
  ses.webRequest.onBeforeSendHeaders(
    { urls: [`${APP_URL}/api/*`] },
    (details, callback) => {
      details.requestHeaders.Origin = APP_URL;
      callback({ requestHeaders: details.requestHeaders });
    },
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

  // Open the installed app, then sign in (not the marketing download page).
  win.loadURL(`${APP_URL}/login?step=email`);

  win.on("closed", () => {
    app.quit();
  });
}

app.whenReady().then(async () => {
  configureMediaPermissions();
  await ensureMacMicrophoneAccess();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
