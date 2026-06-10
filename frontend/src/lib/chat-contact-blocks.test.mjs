import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  buildVCard,
  canAddToContacts,
  extractContactFields,
  isActionContactCard,
  isNativeTapLink,
  normalizeVCardEmail,
  normalizeVCardPhone,
  parseChatContactBlocks,
} from "./chat-contact-blocks.ts";

const NOBU_BLOCK = `Here is a great option:

**Recommended Spot: Nobu Malibu**

[4555 Ocean Ave, Malibu, CA](https://maps.google.com/?q=4555+Ocean+Ave+Malibu+CA)
[Call to Reserve](tel:+13103101511)
[View Menu (external)](https://noburestaurants.com)

Let me know if you want alternatives.`;

describe("parseChatContactBlocks", () => {
  it("extracts a contact card with surrounding markdown", () => {
    const segments = parseChatContactBlocks(NOBU_BLOCK);
    assert.equal(segments.length, 3);
    assert.equal(segments[0].type, "markdown");
    assert.equal(segments[1].type, "contact-card");
    assert.equal(segments[1].title, "Recommended Spot: Nobu Malibu");
    assert.equal(segments[1].links.length, 3);
    assert.equal(segments[1].links[0].kind, "maps");
    assert.equal(segments[1].links[1].kind, "tel");
    assert.equal(segments[2].type, "markdown");
  });

  it("parses a product contact block", () => {
    const content = `**Tom Brady's Good Nut Coconut Water**

[Visit Store Locator](https://goodnut.com/locations)
[Buy Now on Gopuff](https://gopuff.com)
[Customer Support](tel:+18005551234)
[Official Website](https://goodnut.com)`;

    const segments = parseChatContactBlocks(content);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].type, "contact-card");
    assert.equal(segments[0].links.length, 4);
    assert.equal(segments[0].links[1].kind, "shop");
  });

  it("still accepts legacy emoji-prefixed link lines", () => {
    const content = `**Nobu Malibu**

📍 [4555 Ocean Ave, Malibu, CA](https://maps.google.com/?q=4555+Ocean+Ave+Malibu+CA)
📞 [Call to Reserve](tel:+13103101511)`;

    const segments = parseChatContactBlocks(content);
    assert.equal(segments[0].type, "contact-card");
    assert.equal(segments[0].links.length, 2);
  });

  it("leaves non-card bold text as markdown", () => {
    const content = "**Important:** this is not a contact block.";
    const segments = parseChatContactBlocks(content);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].type, "markdown");
  });

  it("does not treat generic web-only blocks as action cards", () => {
    const furtherReading = `**Further reading**

[Source article](https://example.com/article)`;

    const segments = parseChatContactBlocks(furtherReading);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].type, "markdown");
    assert.match(segments[0].content, /Further reading/);
    assert.match(segments[0].content, /Source article/);
  });

  it("does not treat multiple web-only links as an action card", () => {
    const content = `**More on this topic**

[Article one](https://example.com/one)
[Article two](https://example.com/two)`;

    const segments = parseChatContactBlocks(content);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].type, "markdown");
  });

  it("does not treat list-style link lines as action cards", () => {
    const content = `**Nobu Malibu**

- [Call to Reserve](tel:+13103101511)
- [Directions](https://maps.google.com/?q=Nobu+Malibu)`;

    const segments = parseChatContactBlocks(content);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].type, "markdown");
  });

  it("keeps a single maps or tel link as an action card", () => {
    assert.equal(
      parseChatContactBlocks(`**Nobu Malibu**

[4555 Ocean Ave, Malibu, CA](https://maps.google.com/?q=Nobu+Malibu)`)[0].type,
      "contact-card",
    );
    assert.equal(
      parseChatContactBlocks(`**Front desk**

[Call the hotel](tel:+13105551212)`)[0].type,
      "contact-card",
    );
  });

  it("parses calendar, booking, document, and video action links", () => {
    const content = `**Team Sync**

[Add to Calendar](https://calendar.google.com/calendar/render?action=TEMPLATE)
[Book Now](https://calendly.com/acme/30min)
[View Report](https://drive.google.com/file/d/abc/view)
[Join Zoom](https://zoom.us/j/123456789)`;

    const segments = parseChatContactBlocks(content);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].type, "contact-card");
    assert.deepEqual(
      segments[0].links.map((link) => link.kind),
      ["calendar", "booking", "document", "video"],
    );
  });
});

describe("isActionContactCard", () => {
  it("requires at least one actionable link kind", () => {
    assert.equal(isActionContactCard([{ label: "Site", href: "https://x.com", kind: "web" }]), false);
    assert.equal(
      isActionContactCard([{ label: "Call", href: "tel:+1", kind: "tel" }]),
      true,
    );
  });
});

describe("extractContactFields", () => {
  it("pulls phone, email, and address from a personal contact card", () => {
    const segments = parseChatContactBlocks(`**My Nutritionist – Dr. Sarah Chen**

[Call](tel:+14155559876)
[Email](mailto:sarah@chenhealth.com)
[Office Address – 123 Wellness Blvd](https://maps.google.com/?q=123+Wellness+Blvd+Los+Angeles+CA)`);

    const block = segments[0];
    assert.equal(block.type, "contact-card");
    const fields = extractContactFields(block);
    assert.equal(fields.name, "Nutritionist – Dr. Sarah Chen");
    assert.equal(fields.phone, "+14155559876");
    assert.equal(fields.email, "sarah@chenhealth.com");
    assert.equal(fields.address, "123 Wellness Blvd");
    assert.ok(canAddToContacts(block));
  });
});

describe("isNativeTapLink", () => {
  it("recognizes mobile-native schemes", () => {
    assert.equal(isNativeTapLink("tel:+14155559876"), true);
    assert.equal(isNativeTapLink("mailto:sarah@chenhealth.com"), true);
    assert.equal(isNativeTapLink("https://maps.google.com/?q=Main+St"), true);
    assert.equal(isNativeTapLink("https://noburestaurants.com"), false);
  });
});

describe("normalizeVCardPhone", () => {
  it("keeps dialable characters only", () => {
    assert.equal(normalizeVCardPhone("tel:+1 (415) 555-9876"), "+14155559876");
  });

  it("rejects injection payloads", () => {
    assert.equal(
      normalizeVCardPhone("tel:+14155559876%0aFAKE:inject"),
      "+14155559876",
    );
    assert.equal(normalizeVCardPhone("tel:abc"), undefined);
  });
});

describe("normalizeVCardEmail", () => {
  it("keeps a single mailbox", () => {
    assert.equal(normalizeVCardEmail("mailto:sarah@chenhealth.com"), "sarah@chenhealth.com");
  });

  it("rejects injection payloads", () => {
    assert.equal(
      normalizeVCardEmail("mailto:a@b.com%0aBCC:evil@x.com"),
      "a@b.com",
    );
    assert.equal(normalizeVCardEmail("mailto:not-an-email"), undefined);
  });
});

describe("buildVCard", () => {
  it("includes core fields", () => {
    const vcard = buildVCard({
      name: "Dr. Sarah Chen",
      phone: "+14155559876",
      email: "sarah@chenhealth.com",
      address: "123 Wellness Blvd",
    });

    assert.match(vcard, /BEGIN:VCARD/);
    assert.match(vcard, /FN:Dr\. Sarah Chen/);
    assert.match(vcard, /TEL;TYPE=CELL:\+14155559876/);
    assert.match(vcard, /EMAIL;TYPE=INTERNET:sarah@chenhealth.com/);
    assert.match(vcard, /END:VCARD/);
  });

  it("does not emit extra vCard properties from malicious tel/mailto hrefs", () => {
    const segments = parseChatContactBlocks(`**Evil Contact**

[Call](tel:+14155559876%0aFAKE:inject)
[Email](mailto:user@example.com%0aBCC:evil@x.com)`);

    const vcard = buildVCard(extractContactFields(segments[0]));
    const lines = vcard.split(/\r?\n/);

    assert.equal(lines.filter((line) => line.startsWith("FAKE:")).length, 0);
    assert.equal(lines.filter((line) => line.startsWith("BCC:")).length, 0);
    assert.equal(lines.at(-1), "END:VCARD");
    assert.match(vcard, /TEL;TYPE=CELL:\+14155559876/);
    assert.match(vcard, /EMAIL;TYPE=INTERNET:user@example.com/);
  });
});
