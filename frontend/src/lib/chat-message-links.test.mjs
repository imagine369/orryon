import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  findChatLinks,
  sanitizeChatHref,
  telHref,
  transformChatUrl,
} from "./chat-message-links.ts";

describe("sanitizeChatHref", () => {
  it("allows https and http URLs", () => {
    assert.equal(sanitizeChatHref("https://example.com/path"), "https://example.com/path");
    assert.equal(sanitizeChatHref("http://example.com"), "http://example.com");
  });

  it("allows tel and mailto links", () => {
    assert.equal(sanitizeChatHref("tel:+15551234567"), "tel:+15551234567");
    assert.equal(sanitizeChatHref("mailto:hello@example.com"), "mailto:hello@example.com");
  });

  it("normalizes tel links to digits and plus only", () => {
    assert.equal(sanitizeChatHref("tel:+1 (415) 555-0199"), "tel:+14155550199");
    assert.equal(sanitizeChatHref("tel:+14155559876%0aFAKE:inject"), "tel:+14155559876");
  });

  it("rejects malformed mailto links", () => {
    assert.equal(sanitizeChatHref("mailto:not-an-email"), null);
    assert.equal(sanitizeChatHref("mailto:a@b.com%0aBCC:evil@x.com"), "mailto:a@b.com");
  });

  it("blocks javascript and data URLs", () => {
    assert.equal(sanitizeChatHref("javascript:alert(1)"), null);
    assert.equal(sanitizeChatHref("data:text/html,hi"), null);
  });

  it("blocks file, vbscript, and blob URLs", () => {
    assert.equal(sanitizeChatHref("file:///etc/passwd"), null);
    assert.equal(sanitizeChatHref("vbscript:msgbox(1)"), null);
    assert.equal(sanitizeChatHref("blob:https://example.com/uuid"), null);
  });
});

describe("transformChatUrl", () => {
  it("matches sanitizeChatHref policy for markdown rendering", () => {
    assert.equal(transformChatUrl("https://orryon.ai"), "https://orryon.ai");
    assert.equal(transformChatUrl("file:///etc/passwd"), "");
    assert.equal(transformChatUrl("javascript:alert(1)"), "");
  });
});

describe("findChatLinks", () => {
  it("detects bare websites and markdown-style URLs", () => {
    const matches = findChatLinks("Visit example.com or https://orryon.ai today.");
    assert.ok(matches.some((m) => /example\.com/.test(m.value)));
    assert.ok(matches.some((m) => m.href.startsWith("https://orryon.ai")));
  });

  it("detects US phone numbers", () => {
    const matches = findChatLinks("Call us at (415) 555-0199 for help.");
    const phone = matches.find((m) => m.href.startsWith("tel:"));
    assert.ok(phone);
    assert.match(phone.value, /415/);
  });

  it("detects international phone numbers", () => {
    const matches = findChatLinks("UK desk: +44 20 7946 0958");
    const phone = matches.find((m) => m.href.startsWith("tel:"));
    assert.ok(phone);
    assert.match(phone.href, /\+442079460958/);
  });

  it("detects email addresses", () => {
    const matches = findChatLinks("Email support@orryon.ai for details.");
    assert.ok(matches.some((m) => m.href.startsWith("mailto:")));
  });

  it("does not autolink street addresses in prose", () => {
    const matches = findChatLinks("I live on 123 Main St, San Francisco, CA 94105.");
    assert.equal(
      matches.find((m) => m.href.includes("maps.google.com")),
      undefined,
    );
  });

  it("does not overlap phone digits inside URLs", () => {
    const matches = findChatLinks("Book at https://airline.com/flight/UA123 not 555-123-4567.");
    const urlMatch = matches.find((m) => m.href.includes("airline.com"));
    const phoneMatch = matches.find((m) => m.href.startsWith("tel:"));
    assert.ok(urlMatch);
    assert.ok(phoneMatch);
    assert.notEqual(urlMatch.start, phoneMatch.start);
  });
});

describe("telHref", () => {
  it("strips formatting characters", () => {
    assert.equal(telHref("(415) 555-0199"), "tel:4155550199");
  });
});

