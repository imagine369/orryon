# Orryon Desktop

Native Mac / Windows / Linux app using the **Orryon avatar** as the dock/taskbar icon. Loads your deployed web app in an Electron shell (same pattern as Cursor).

## Develop

```bash
cd desktop
npm install
ORRYON_APP_URL=http://localhost:3000 npm start
```

## Release builds

```bash
npm run dist:mac      # → dist/Orryon-mac.dmg
npm run dist:win      # → dist/Orryon-windows.exe
npm run dist:linux    # → dist/Orryon-linux.AppImage
```

Copy artifacts to `frontend/public/downloads/` or attach to a GitHub Release, then set `NEXT_PUBLIC_DESKTOP_DOWNLOAD_*` in Vercel (see root `.env.example`).

CI: push tag `desktop-v*` or run **Desktop release** workflow.

## macOS: “Orryon is damaged and can’t be opened”

This is **not** a broken app. macOS Gatekeeper blocks downloads that are not signed with an Apple Developer ID.

**To open Orryon:**

1. Drag Orryon to **Applications**
2. **Right-click** (or Control-click) **Orryon** → **Open** → **Open** again  
   — or run in Terminal:
   ```bash
   xattr -cr /Applications/Orryon.app
   ```
3. Launch from Applications as usual

For a public release without this step, the `.dmg` must be **code-signed and notarized** (Apple Developer Program, ~$99/year).
