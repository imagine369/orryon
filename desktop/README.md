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
npm run dist:mac           # unsigned (local testing)
npm run dist:mac:signed    # signed + notarized (public release — see MAC_SIGNING.md)
npm run dist:win
npm run dist:linux
```

Upload `dist/Orryon-mac.dmg` to Vercel Blob, set `DESKTOP_DOWNLOAD_MAC_URL` in Vercel, redeploy.

**Public Mac releases (like Cursor):** follow **[MAC_SIGNING.md](./MAC_SIGNING.md)** — Apple Developer Program, sign, notarize, then host the `.dmg`. No App Store required; repo can stay private.
