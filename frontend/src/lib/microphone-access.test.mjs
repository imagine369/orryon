import { strict as assert } from "node:assert";
import { describe, it, afterEach } from "node:test";
import {
  mapMicrophoneAccessError,
  noMicDetectedHelpText,
} from "./microphone-access.ts";

function domException(name) {
  const err = new DOMException(name, name);
  return err;
}

describe("mapMicrophoneAccessError", () => {
  it("maps permission denial to sticky help text", () => {
    const msg = mapMicrophoneAccessError(domException("NotAllowedError"));
    assert.match(msg, /microphone/i);
  });

  it("maps NotFoundError to no-mic help", () => {
    const msg = mapMicrophoneAccessError(domException("NotFoundError"));
    assert.match(msg, /microphone/i);
  });

  it("maps NotReadableError to in-use message", () => {
    const msg = mapMicrophoneAccessError(domException("NotReadableError"));
    assert.match(msg, /another app/i);
  });
});

describe("noMicDetectedHelpText", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });

  function setUserAgent(ua) {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: ua },
      configurable: true,
    });
  }

  it("shows Orryon desktop guidance in the Electron app", () => {
    setUserAgent("Mozilla/5.0 OrryonDesktop/1.0");
    assert.match(noMicDetectedHelpText(), /System Settings/i);
    assert.match(noMicDetectedHelpText(), /Orryon/i);
  });

  it("shows Safari-specific guidance on macOS Safari", () => {
    setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    );
    assert.match(noMicDetectedHelpText(), /Safari/i);
    assert.match(noMicDetectedHelpText(), /www\.orryon\.com/i);
  });

  it("shows generic guidance on other platforms", () => {
    setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    assert.match(noMicDetectedHelpText(), /No microphone was detected/i);
  });
});
