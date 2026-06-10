#!/usr/bin/env node
/**
 * Upload Orryon-mac.dmg to Vercel Blob (production hosting).
 *
 * Prerequisites:
 *   1. npm run dist:mac  (in desktop/)
 *   2. vercel login && vercel link  (project: orryon)
 *   3. DESKTOP_DOWNLOAD_MAC_URL set in Vercel (first time only — see output URL)
 *
 * Usage:
 *   cd desktop && npm run publish:mac
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dmgPath = resolve(__dirname, "../dist/Orryon-mac.dmg");

if (!existsSync(dmgPath)) {
  console.error("Missing dist/Orryon-mac.dmg — run: npm run dist:mac");
  process.exit(1);
}

console.log("Uploading Orryon-mac.dmg to Vercel Blob…\n");

const output = execSync(
  [
    "vercel blob put",
    JSON.stringify(dmgPath),
    "--pathname Orryon-mac.dmg",
    "--allow-overwrite true",
    "--content-type application/x-apple-diskimage",
    "--access public",
    "--no-color",
  ].join(" "),
  { encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] },
);

const urlMatch = output.match(/https:\/\/[^\s]+\.dmg/);
const blobUrl = urlMatch?.[0];

console.log(output);

if (blobUrl) {
  console.log("\n--- Next steps ---");
  console.log("1. Vercel → orryon → Settings → Environment Variables");
  console.log(`   DESKTOP_DOWNLOAD_MAC_URL=${blobUrl}`);
  console.log("2. Redeploy (or wait for next push to main)");
  console.log("3. Verify: cd ../frontend && npm run verify:download:production");
} else {
  console.log("\nUpload finished. Set DESKTOP_DOWNLOAD_MAC_URL to the public Blob URL above.");
}
