import { strict as assert } from "node:assert";
import { describe, it, afterEach } from "node:test";
import {
  appNavInstallLabel,
  iosInstallCtaLabel,
  iosInstallFootnote,
  iosInstallModalKind,
  iosInstallUrl,
  isIosInstallContext,
} from "./ios-install.ts";

const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const IPHONE_CHROME_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";

const MAC_CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const originals = {
  navigator: globalThis.navigator,
  window: globalThis.window,
  document: globalThis.document,
};

function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true });
}

function mockBrowser({ ua, standalone = false, origin = "https://orryon.app" }) {
  const isIphone = /iPhone|iPod/.test(ua);
  defineGlobal("navigator", {
    userAgent: ua,
    platform: isIphone ? "iPhone" : "MacIntel",
    maxTouchPoints: isIphone ? 5 : 0,
    standalone,
  });
  defineGlobal("window", {
    matchMedia: () => ({
      matches: standalone,
      media: "(display-mode: standalone)",
      addListener: () => {},
      removeListener: () => {},
    }),
    location: { origin },
  });
  defineGlobal("document", { referrer: "" });
}

function restoreBrowser() {
  defineGlobal("navigator", originals.navigator);
  defineGlobal("window", originals.window);
  defineGlobal("document", originals.document);
}

describe("iosInstallUrl", () => {
  afterEach(restoreBrowser);

  it("returns install path without window (SSR)", () => {
    defineGlobal("window", undefined);
    assert.equal(iosInstallUrl(), "/login?step=email");
  });

  it("returns absolute URL with origin", () => {
    mockBrowser({ ua: IPHONE_SAFARI_UA, origin: "https://orryon.app" });
    assert.equal(iosInstallUrl(), "https://orryon.app/login?step=email");
  });
});

describe("ios install modal routing", () => {
  afterEach(restoreBrowser);

  it("iPhone Safari → safari-instructions + Add to Home Screen copy", () => {
    mockBrowser({ ua: IPHONE_SAFARI_UA });
    assert.equal(iosInstallModalKind(), "safari-instructions");
    assert.equal(iosInstallCtaLabel(), "Add to Home Screen");
    assert.match(iosInstallFootnote(), /Share button/);
  });

  it("iPhone Chrome → open-in-safari + Get for iPhone copy", () => {
    mockBrowser({ ua: IPHONE_CHROME_UA });
    assert.equal(iosInstallModalKind(), "open-in-safari");
    assert.equal(iosInstallCtaLabel(), "Get for iPhone & iPad");
    assert.match(iosInstallFootnote(), /Open in Safari/);
  });
});

describe("isIosInstallContext", () => {
  afterEach(restoreBrowser);

  it("true for ios when not standalone", () => {
    mockBrowser({ ua: IPHONE_SAFARI_UA, standalone: false });
    assert.equal(isIosInstallContext("ios"), true);
  });

  it("false when already installed (standalone)", () => {
    mockBrowser({ ua: IPHONE_SAFARI_UA, standalone: true });
    assert.equal(isIosInstallContext("ios"), false);
  });

  it("false for desktop platform", () => {
    mockBrowser({ ua: MAC_CHROME_UA });
    assert.equal(isIosInstallContext("mac"), false);
  });

  it("uses detectPlatform() when platform is omitted", () => {
    mockBrowser({ ua: IPHONE_SAFARI_UA, standalone: false });
    assert.equal(isIosInstallContext(), true);
    mockBrowser({ ua: MAC_CHROME_UA });
    assert.equal(isIosInstallContext(), false);
  });
});

describe("appNavInstallLabel", () => {
  afterEach(restoreBrowser);

  it("matches iOS install CTA on iPhone Safari", () => {
    mockBrowser({ ua: IPHONE_SAFARI_UA });
    assert.equal(appNavInstallLabel("ios"), "Add to Home Screen");
  });

  it("returns Download on macOS", () => {
    mockBrowser({ ua: MAC_CHROME_UA });
    assert.equal(appNavInstallLabel("mac"), "Download");
  });
});
