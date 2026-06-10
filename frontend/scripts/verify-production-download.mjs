/**
 * Verify production Mac desktop download is configured and reachable.
 *
 * Usage:
 *   npm run verify:download:production
 *   PRODUCTION_URL=https://orryon.vercel.app node scripts/verify-production-download.mjs
 */
import { strict as assert } from "node:assert";

const PRODUCTION = (process.env.PRODUCTION_URL || "https://orryon.vercel.app").replace(/\/$/, "");

async function head(url) {
  const res = await fetch(url, {
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  return res;
}

async function verifyMacDownload() {
  const apiUrl = `${PRODUCTION}/api/download/mac`;
  const apiRes = await head(apiUrl);

  assert.equal(
    apiRes.status,
    302,
    `${apiUrl} should redirect (302) when DESKTOP_DOWNLOAD_MAC_URL is set — got ${apiRes.status}`,
  );

  const location = apiRes.headers.get("location");
  assert.ok(location?.startsWith("https://"), `redirect should be HTTPS, got: ${location ?? "(none)"}`);

  const blobRes = await fetch(location, {
    method: "HEAD",
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(blobRes.ok, `hosted DMG not reachable at ${location} — HTTP ${blobRes.status}`);

  const contentType = blobRes.headers.get("content-type") || "";
  assert.ok(
    /diskimage|octet-stream/i.test(contentType),
    `expected DMG content-type, got: ${contentType}`,
  );

  const size = Number(blobRes.headers.get("content-length") || 0);
  assert.ok(size > 1_000_000, `DMG should be >1MB, got ${size} bytes`);

  console.log(`✔ Production Mac download OK`);
  console.log(`  API:      ${apiUrl}`);
  console.log(`  DMG:      ${location}`);
  console.log(`  Size:     ${(size / 1_000_000).toFixed(1)} MB`);
}

await verifyMacDownload();
