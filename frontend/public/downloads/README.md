# Desktop installers

The Mac app is **~100MB** — too large to ship inside Vercel’s static files by default.

## Production (required for orryon.vercel.app)

1. Build: `cd desktop && npm install && npm run dist:mac`
2. Host `Orryon-mac.dmg` at a **public** URL (~100MB).  
   **Private GitHub repos cannot serve public downloads** — use a **public** repo release, [Vercel Blob](https://vercel.com/docs/storage/vercel-blob), S3, etc.
3. In **Vercel → project orryon → Environment Variables**, set server-only URLs (not `NEXT_PUBLIC_*`):

```
DESKTOP_DOWNLOAD_MAC_URL=https://your-public-host/Orryon-mac.dmg
DESKTOP_DOWNLOAD_WINDOWS_URL=https://your-public-host/Orryon-windows.exe
DESKTOP_DOWNLOAD_LINUX_URL=https://your-public-host/Orryon-linux.AppImage
```

4. Redeploy. The site downloads via `/api/download/{platform}`, which redirects to those URLs.

Copy the asset link from GitHub only if the repository is **public** (right-click `Orryon-mac.dmg` on the release page → Copy link address).

## Local dev

Place `Orryon-mac.dmg` in this folder — `npm run dev` serves it via `/api/download/mac`.
