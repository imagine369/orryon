import { sanitizeChatHref } from "@/lib/chat-message-links";

export type ContactLinkKind =
  | "maps"
  | "tel"
  | "email"
  | "web"
  | "shop"
  | "calendar"
  | "booking"
  | "document"
  | "video"
  | "other";

export interface ContactLink {
  label: string;
  href: string;
  kind: ContactLinkKind;
}

export interface ContactCardBlock {
  type: "contact-card";
  title: string;
  links: ContactLink[];
}

export interface MarkdownBlock {
  type: "markdown";
  content: string;
}

export type ChatContentSegment = ContactCardBlock | MarkdownBlock;

const TITLE_RE = /^\*\*(.+)\*\*\s*$/;
/** Markdown link line; optional leading emoji only (legacy — not list markers). */
const LEGACY_EMOJI_PREFIX =
  "(?:📍|🛒|📞|🌐|✉️|📱|🗺️|📅|📋|📄|🎥|📹)";
const CONTACT_LINE_RE = new RegExp(
  `^(?:${LEGACY_EMOJI_PREFIX}\\s+)?\\[([^\\]]+)\\]\\(([^)]+)\\)\\s*$`,
);

function inferLinkKind(href: string, label: string): ContactLinkKind {
  const lower = href.toLowerCase();
  const labelLower = label.toLowerCase();

  if (lower.startsWith("tel:")) return "tel";
  if (lower.startsWith("mailto:")) return "email";
  if (lower.includes("maps.google.com") || lower.includes("google.com/maps")) {
    return "maps";
  }
  if (lower.includes("calendar.google.com")) return "calendar";
  if (
    lower.includes("calendly.com") ||
    lower.includes("acuityscheduling.com") ||
    lower.includes("opentable.com")
  ) {
    return "booking";
  }
  if (
    lower.includes("drive.google.com") ||
    lower.includes("docs.google.com") ||
    lower.includes("dropbox.com")
  ) {
    return "document";
  }
  if (
    lower.includes("zoom.us") ||
    lower.includes("meet.google.com") ||
    lower.includes("teams.microsoft.com")
  ) {
    return "video";
  }
  if (
    /\bbuy\b/i.test(labelLower) ||
    lower.includes("gopuff.com") ||
    lower.includes("amazon.")
  ) {
    return "shop";
  }
  if (lower.startsWith("http")) return "web";
  return "other";
}

/** Link kinds that indicate the user can take a real-world action (not passive reading). */
const ACTION_CARD_LINK_KINDS = new Set<ContactLinkKind>([
  "tel",
  "email",
  "maps",
  "booking",
  "calendar",
  "video",
  "shop",
  "document",
]);

/** True when a bold-title + link block is an action card, not prose with inline links. */
export function isActionContactCard(links: ContactLink[]): boolean {
  if (links.length === 0) return false;
  return links.some((link) => ACTION_CARD_LINK_KINDS.has(link.kind));
}

function parseContactLinkLine(line: string): ContactLink | null {
  const trimmed = line.trim();
  const match = trimmed.match(CONTACT_LINE_RE);
  if (!match) return null;

  const href = sanitizeChatHref(match[2].trim());
  if (!href) return null;

  const label = match[1].trim();

  return {
    label,
    href,
    kind: inferLinkKind(href, label),
  };
}

/**
 * Split assistant markdown into regular prose and compact action cards.
 * Cards: bold title + markdown link lines (no emojis required).
 */
export function parseChatContactBlocks(content: string): ChatContentSegment[] {
  const lines = content.split("\n");
  const segments: ChatContentSegment[] = [];
  const markdownBuffer: string[] = [];
  let index = 0;

  const flushMarkdown = () => {
    const text = markdownBuffer.join("\n").trimEnd();
    markdownBuffer.length = 0;
    if (text.trim()) {
      segments.push({ type: "markdown", content: text });
    }
  };

  while (index < lines.length) {
    const titleMatch = lines[index].match(TITLE_RE);
    if (titleMatch) {
      const links: ContactLink[] = [];
      let cursor = index + 1;

      while (cursor < lines.length) {
        const trimmed = lines[cursor].trim();
        if (!trimmed) {
          cursor += 1;
          continue;
        }

        const link = parseContactLinkLine(trimmed);
        if (!link) break;

        links.push(link);
        cursor += 1;
      }

      if (links.length > 0 && isActionContactCard(links)) {
        flushMarkdown();
        segments.push({
          type: "contact-card",
          title: titleMatch[1].trim(),
          links,
        });
        index = cursor;
        continue;
      }

      if (links.length > 0) {
        // Bold title + generic link(s) only — render as normal markdown, not a card.
        markdownBuffer.push(lines[index]);
        for (let lineIndex = index + 1; lineIndex < cursor; lineIndex += 1) {
          markdownBuffer.push(lines[lineIndex]);
        }
        index = cursor;
        continue;
      }
    }

    markdownBuffer.push(lines[index]);
    index += 1;
  }

  flushMarkdown();
  return segments.length > 0 ? segments : [{ type: "markdown", content }];
}

export function cleanContactCardTitle(title: string): string {
  return title
    .replace(/^recommended\s+spot:\s*/i, "")
    .replace(/^my\s+/i, "")
    .trim();
}

export interface ExtractedContactFields {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

function decodeHrefComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Strip tel: payloads down to a dialable E.164-ish value safe for vCard. */
export function normalizeVCardPhone(raw: string): string | undefined {
  const decoded = decodeHrefComponent(raw.replace(/^tel:/i, "").trim());
  const digits = decoded.replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length < 7) return undefined;
  return digits;
}

/** Accept only a single plain mailbox — rejects injection via newlines or extra headers. */
export function normalizeVCardEmail(raw: string): string | undefined {
  const decoded = decodeHrefComponent(raw.replace(/^mailto:/i, "").trim());
  const candidate = decoded.split(/[?\s#]/)[0]?.trim() ?? "";
  if (!/^[^\s@;:\\]+@[^\s@;:\\]+\.[^\s@;:\\]+$/.test(candidate)) return undefined;
  return candidate;
}

export function extractContactFields(block: ContactCardBlock): ExtractedContactFields {
  const name = cleanContactCardTitle(block.title);
  const fields: ExtractedContactFields = { name };

  for (const link of block.links) {
    if (!fields.phone && link.kind === "tel") {
      fields.phone = normalizeVCardPhone(link.href);
    }
    if (!fields.email && link.kind === "email") {
      fields.email = normalizeVCardEmail(link.href);
    }
    if (!fields.address && link.kind === "maps") {
      fields.address = link.label
        .replace(/^office\s+address\s*[–-]\s*/i, "")
        .trim();
    }
  }

  return fields;
}

export function canAddToContacts(block: ContactCardBlock): boolean {
  const { phone, email, address } = extractContactFields(block);
  return Boolean(phone || email || address);
}

function escapeVCardValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

export function buildVCard(fields: ExtractedContactFields): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVCardValue(fields.name)}`];

  if (fields.phone) {
    lines.push(`TEL;TYPE=CELL:${escapeVCardValue(fields.phone)}`);
  }
  if (fields.email) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardValue(fields.email)}`);
  }
  if (fields.address) {
    lines.push(`ADR;TYPE=WORK:;;${escapeVCardValue(fields.address)};;;;`);
  }

  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/** tel:/mailto:/maps are native one-tap actions on mobile. */
export function isNativeTapLink(href: string): boolean {
  const lower = href.toLowerCase();
  return (
    lower.startsWith("tel:") ||
    lower.startsWith("mailto:") ||
    lower.includes("maps.google.com") ||
    lower.includes("google.com/maps")
  );
}

export function downloadContactVCard(block: ContactCardBlock): void {
  let objectUrl: string | null = null;

  try {
    const fields = extractContactFields(block);
    const vcard = buildVCard(fields);
    const blob = new Blob([vcard], { type: "text/vcard;charset=utf-8" });
    objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeName = fields.name.replace(/[^\w\s-]/g, "").trim() || "contact";

    anchor.href = objectUrl;
    anchor.download = `${safeName}.vcf`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    // Blob / DOM download unavailable (SSR, blocked context) — no-op
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
