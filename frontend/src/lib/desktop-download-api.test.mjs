import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  desktopDownloadEnvKey,
  unreachableInstallerBody,
  unconfiguredInstallerBody,
} from "./desktop-download-api.ts";

describe("desktopDownloadEnvKey", () => {
  it("returns server-only env var name", () => {
    assert.equal(desktopDownloadEnvKey("mac"), "DESKTOP_DOWNLOAD_MAC_URL");
    assert.equal(desktopDownloadEnvKey("windows"), "DESKTOP_DOWNLOAD_WINDOWS_URL");
  });
});

describe("unreachableInstallerBody", () => {
  it("is platform-specific and omits configured URLs", () => {
    const body = unreachableInstallerBody("mac");
    assert.match(body.error, /macOS/i);
    assert.match(body.hint, /DESKTOP_DOWNLOAD_MAC_URL/);
    assert.equal("configuredUrl" in body, false);
  });
});

describe("unconfiguredInstallerBody", () => {
  it("names the server env var without exposing URLs", () => {
    const body = unconfiguredInstallerBody("linux");
    assert.match(body.hint, /DESKTOP_DOWNLOAD_LINUX_URL/);
    assert.equal("configuredUrl" in body, false);
  });
});
