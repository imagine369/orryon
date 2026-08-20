# Mac distribution like Cursor (sign + notarize)

Cursor is **not** on the App Store. They ship a **signed + notarized** `.dmg` from their website. Orryon can do the same.

## 1. Apple Developer Program

1. Enroll: https://developer.apple.com/programs/ ($99/year)
2. Sign in with your Apple ID
3. Note your **Team ID** (Membership details — 10 characters, e.g. `AB12CD34EF`)

## 2. Create a signing certificate

1. Open **Keychain Access** on your Mac
2. Menu **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority**
3. Enter your email, name, choose **Saved to disk** → save `.certSigningRequest`
4. Go to https://developer.apple.com/account/resources/certificates/list
5. **+** → **Developer ID Application** → upload the `.certSigningRequest` → download `.cer`
6. Double-click the `.cer` to add it to Keychain
7. In Keychain, find **Developer ID Application: Your Name (TEAMID)**
8. Right-click → **Export** → **Personal Information Exchange (.p12)** → save `DeveloperIDApplication.p12` with a password

Keep the `.p12` private — never commit it to git.

## 3. App-specific password (for notarization)

1. https://appleid.apple.com → **Sign-In and Security** → **App-Specific Passwords**
2. Generate one labeled `Orryon notarize`
3. Save the password (format `xxxx-xxxx-xxxx-xxxx`)

## 4. Configure local env

```bash
cd desktop
cp .env.signing.example .env.signing
# Edit .env.signing with your real values
```

Load before build:

```bash
set -a && source .env.signing && set +a   # or use direnv
```

Required variables:

| Variable | Example |
|----------|---------|
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password |
| `APPLE_TEAM_ID` | 10-char team id |
| `CSC_LINK` | `/Users/you/certs/DeveloperIDApplication.p12` |
| `CSC_KEY_PASSWORD` | p12 export password |
| `ORRYON_APP_URL` | `https://www.orryon.com` |

## 5. Build signed + notarized DMG

```bash
cd desktop
npm install
npm run dist:mac:signed
```

Output: `dist/Orryon-mac.dmg`

electron-builder will sign, notarize with Apple, and staple the ticket. First build can take **5–15 minutes**.

Verify:

```bash
spctl -a -vvv -t install dist/mac-arm64/Orryon.app
# Should say: accepted / Notarized Developer ID
```

## 6. Host the DMG (private repo is fine)

1. Upload `dist/Orryon-mac.dmg` to **Vercel Blob** (same as now)
2. Copy the public Blob URL
3. Vercel → project **orryon** → **Environment Variables**:
   - `DESKTOP_DOWNLOAD_MAC_URL` = Blob URL
4. Redeploy

Users download from **orryon.com**. The GitHub repository is public.

## 7. Optional: CI signing (GitHub Actions)

Add secrets to GitHub (repo → Settings → Secrets):

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK` (base64-encoded `.p12`)
- `CSC_KEY_PASSWORD`

Then the **Desktop release** workflow can run `npm run dist:mac:signed` on tagged releases.

---

## Until signing is done

Users on recent macOS may only see **Done** / **Move to Trash** (no Right-click → Open). Use:

1. Click **Done** on the block dialog  
2. **System Settings → Privacy & Security → Open Anyway**  
3. Or Terminal: `xattr -cr /Applications/Orryon.app`
