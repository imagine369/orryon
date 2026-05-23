/**
 * Smoke-test download routes and platform detection (run against `npm run dev`).
 * Usage: node scripts/test-download-flow.mjs [baseUrl]
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

const BASE =
  process.env.TEST_BASE_URL ||
  process.argv.find((a) => a.startsWith("http")) ||
  "http://127.0.0.1:3456";

function detectPlatformFromUserAgent(ua, navPlatform = "", maxTouchPoints = 0) {
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (navPlatform === "MacIntel" && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|MacIntel|MacPPC|Mac68K/.test(ua)) return "mac";
  if (/Win32|Win64|Windows|WinCE/.test(ua)) return "windows";
  if (/Linux|CrOS/.test(ua)) return "linux";
  return "desktop";
}

const UAS = {
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Chrome/120.0.0.0",
};

describe("platform detection", () => {
  it("mac", () => assert.equal(detectPlatformFromUserAgent(UAS.mac, "MacIntel", 0), "mac"));
  it("windows", () => assert.equal(detectPlatformFromUserAgent(UAS.windows), "windows"));
  it("linux", () => assert.equal(detectPlatformFromUserAgent(UAS.linux), "linux"));
  it("ios", () => assert.equal(detectPlatformFromUserAgent(UAS.ios), "ios"));
  it("ipad", () => assert.equal(detectPlatformFromUserAgent(UAS.ipad, "MacIntel", 5), "ios"));
  it("android", () => assert.equal(detectPlatformFromUserAgent(UAS.android), "android"));
});

async function fetchCheck(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(8_000),
    ...opts,
  });
  return { url, status: res.status, headers: res.headers, res };
}

describe("HTTP routes (requires dev server)", () => {
  it("/download page returns 200", async () => {
    const { status } = await fetchCheck("/download");
    assert.equal(status, 200, "/download should load");
  });

  it("/api/download/mac serves dmg or redirects", async () => {
    const { status, headers } = await fetchCheck("/api/download/mac", { method: "HEAD" });
    assert.ok(
      status === 200 || status === 302,
      `mac download expected 200 or 302, got ${status}`,
    );
    if (status === 200) {
      const cd = headers.get("content-disposition") || "";
      assert.match(cd, /Orryon-mac\.dmg/i, "should attach dmg filename");
      const len = Number(headers.get("content-length") || 0);
      assert.ok(len > 1_000_000, "dmg should be >1MB");
    }
  });

  it("/api/download/windows returns 404 or 503 without file (not HTML 404 page)", async () => {
    const { status, headers } = await fetchCheck("/api/download/windows");
    const ct = headers.get("content-type") || "";
    assert.ok(status === 404 || status === 503, `windows got ${status}`);
    if (status === 404 || status === 503) {
      assert.match(ct, /json/, "should be API JSON, not HTML 404 page");
    }
  });

  it("/api/download/linux returns 404 or 503 without file", async () => {
    const { status } = await fetchCheck("/api/download/linux");
    assert.ok(status === 404 || status === 503, `linux got ${status}`);
  });

  it("old static path /downloads/Orryon-mac.dmg should not be HTML 404", async () => {
    const { status, headers } = await fetchCheck("/downloads/Orryon-mac.dmg", {
      method: "HEAD",
    });
    const ct = headers.get("content-type") || "";
    if (status === 404) {
      assert.ok(!ct.includes("text/html"), "avoid marketing 404 page");
    } else {
      assert.ok(
        status === 308 || status === 307 || status === 302 || status === 200,
        `legacy path should redirect or serve file, got ${status}`,
      );
    }
  });

  it("/manifest.json is valid PWA", async () => {
    const { status, res } = await fetchCheck("/manifest.json");
    assert.equal(status, 200);
    const m = await res.json();
    assert.equal(m.display, "standalone");
    assert.ok(m.icons?.length >= 1, "has icons");
    assert.ok(m.icons.some((i) => /icon-192\.png/.test(i.src)), "has 192px icon");
    assert.ok(m.icons.some((i) => /icon-512\.png/.test(i.src)), "has 512px icon");
    for (const icon of m.icons) {
      const { status: iconStatus } = await fetchCheck(icon.src);
      assert.equal(iconStatus, 200, `icon ${icon.src} should be reachable`);
    }
  });
});
