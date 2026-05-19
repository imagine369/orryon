# Desktop installers

The Mac app is **~100MB** — too large to ship inside Vercel’s static files by default.

## Production (required for orryon.vercel.app)

1. Build: `cd desktop && npm install && npm run dist:mac`
2. Create a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github) and upload `Orryon-mac.dmg`
3. In **Vercel → Environment Variables**, set:

```
NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC=https://github.com/YOUR_ORG/orryon/releases/download/v1.0.0/Orryon-mac.dmg
```

Redeploy. The download button uses `/api/download/mac`, which redirects to that URL.

## Local dev

Place `Orryon-mac.dmg` in this folder — `npm run dev` serves it via `/api/download/mac`.
