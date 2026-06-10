import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { parseChatContactBlocks } from "./chat-contact-blocks.ts";

/** Mirrors ChatMessageContent segment routing (no React runtime required). */
function segmentTypes(content) {
  return parseChatContactBlocks(content).map((segment) => segment.type);
}

function isMarkdownOnly(content) {
  const segments = parseChatContactBlocks(content);
  return segments.length === 1 && segments[0].type === "markdown";
}

describe("ChatMessageContent routing", () => {
  it("uses a single markdown path for prose-only replies", () => {
    assert.ok(isMarkdownOnly("Here is a short answer with no links."));
  });

  it("splits prose and action cards in mixed replies", () => {
    const content = `Here are directions when you are ready.

**Nobu Malibu**
[4555 Ocean Ave, Malibu, CA](https://maps.google.com/?q=Nobu+Malibu)
[Call to Reserve](tel:+13103101511)`;

    assert.deepEqual(segmentTypes(content), ["markdown", "contact-card"]);
  });

  it("keeps web-only bold blocks in markdown", () => {
    const content = `**Further reading**
[Article](https://example.com/article)`;

    assert.ok(isMarkdownOnly(content));
  });
});
