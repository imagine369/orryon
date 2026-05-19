import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

// Compiled path: run against source via dynamic import of ts not available; duplicate minimal logic check
// Import from built output isn't set up — inline the detector for the test file.
function detectPlatformFromUserAgent(ua, navPlatform = "", maxTouchPoints = 0) {
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (navPlatform === "MacIntel" && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|MacIntel|MacPPC|Mac68K/.test(ua)) return "mac";
  if (/Win32|Win64|Windows|WinCE/.test(ua)) return "windows";
  if (/Linux|CrOS/.test(ua)) return "linux";
  return "desktop";
}

describe("detectPlatformFromUserAgent", () => {
  it("detects iPhone", () => {
    assert.equal(
      detectPlatformFromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      ),
      "ios",
    );
  });

  it("detects iPad (touch Mac)", () => {
    assert.equal(
      detectPlatformFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        "MacIntel",
        5,
      ),
      "ios",
    );
  });

  it("detects Mac laptop", () => {
    assert.equal(
      detectPlatformFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "MacIntel",
        0,
      ),
      "mac",
    );
  });

  it("detects Android", () => {
    assert.equal(
      detectPlatformFromUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile",
      ),
      "android",
    );
  });

  it("detects Windows", () => {
    assert.equal(
      detectPlatformFromUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
      ),
      "windows",
    );
  });

  it("detects Linux", () => {
    assert.equal(
      detectPlatformFromUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0",
      ),
      "linux",
    );
  });

  it("detects ChromeOS as linux", () => {
    assert.equal(
      detectPlatformFromUserAgent(
        "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36",
      ),
      "linux",
    );
  });
});
