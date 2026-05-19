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
