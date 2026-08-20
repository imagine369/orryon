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
npm run verify:mic         # static check: entitlements + mic permission handlers
npm run dist:mac           # unsigned (local testing; runs verify:mic first)
npm run dist:mac:signed    # signed + notarized (public release — see MAC_SIGNING.md)
npm run dist:win
npm run dist:linux
```

After mic permission changes, users must **install the new `.dmg`** and allow Microphone in **System Settings → Privacy & Security → Microphone → Orryon**.

Upload `dist/Orryon-mac.dmg` to Vercel Blob, set `DESKTOP_DOWNLOAD_MAC_URL` in Vercel, redeploy:

```bash
npm run dist:mac
npm run publish:mac          # uploads to Vercel Blob, prints env var to set
cd ../frontend && npm run verify:download:production
```

**Public Mac releases (like Cursor):** follow **[MAC_SIGNING.md](./MAC_SIGNING.md)** — Apple Developer Program, sign, notarize, then host the `.dmg`. After install, users add a Grok API key in Settings.
