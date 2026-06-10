import { find as linkifyFind } from "linkifyjs";

/** Shared anchor styling for assistant chat bubbles. */
export const CHAT_LINK_CLASS =
  "font-medium text-sky-400/90 underline decoration-sky-400/35 underline-offset-[3px] transition-colors hover:text-sky-300 hover:decoration-sky-300/55";

export interface ChatLinkMatch {
  start: number;
  end: number;
  value: string;
  href: string;
}

/** US/local and +country international formats (7–15 digits after normalization). */
const PHONE_RE =
  /(?:\+[\d]{1,3}[-.\s]?)?(?:\(\d{2,5}\)|\d{2,5})[-.\s/]?[\d][\d\s()./-]{5,}[\d]|\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length < 7) return "";
  return `tel:${digits}`;
}

function decodeHrefComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeTelHref(raw: string): string | null {
  const payload = decodeHrefComponent(raw.replace(/^tel:/i, "")).replace(/\s/g, "");
  const digits = payload.replace(/[^\d+]/g, "");
  const digitCount = digits.replace(/\D/g, "").length;
  if (digitCount < 7 || digitCount > 15) return null;
  return `tel:${digits}`;
}

const BLOCKED_PROTOCOL_RE = /^(javascript|data|file|vbscript|blob):/i;

/** Allow only safe protocols in rendered chat links (deny-by-default). */
export function sanitizeChatHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (BLOCKED_PROTOCOL_RE.test(lower)) return null;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) {
    const mailbox = decodeHrefComponent(trimmed.replace(/^mailto:/i, "")).split(/[?\s#]/)[0]?.trim() ?? "";
    if (!/^[^\s@;:\\]+@[^\s@;:\\]+\.[^\s@;:\\]+$/.test(mailbox)) return null;
    return `mailto:${mailbox}`;
  }
  if (/^tel:/i.test(trimmed)) return normalizeTelHref(trimmed);

  return null;
}

/** ReactMarkdown urlTransform — same policy as remark autolink / anchor rendering. */
export function transformChatUrl(url: string): string {
  return sanitizeChatHref(url) ?? "";
}

function overlaps(a: ChatLinkMatch, b: ChatLinkMatch): boolean {
  return a.start < b.end && b.start < a.end;
}

function mergeMatches(matches: ChatLinkMatch[]): ChatLinkMatch[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: ChatLinkMatch[] = [];

  for (const match of sorted) {
    if (merged.some((existing) => overlaps(existing, match))) continue;
    merged.push(match);
  }

  return merged.sort((a, b) => a.start - b.start);
}

function collectRegexMatches(
  text: string,
  pattern: RegExp,
  hrefFor: (value: string) => string,
): ChatLinkMatch[] {
  const matches: ChatLinkMatch[] = [];
  const regex = new RegExp(pattern.source, pattern.flags);

  for (let match = regex.exec(text); match; match = regex.exec(text)) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      value: match[0],
      href: hrefFor(match[0]),
    });
  }

  return matches;
}

/**
 * Detect URLs, emails, and phone numbers in plain prose.
 * Street addresses are not autolinked — too many false positives; use action cards
 * or explicit [label](maps…) markdown from the assistant instead.
 */
export function findChatLinks(text: string): ChatLinkMatch[] {
  const linkifyMatches: ChatLinkMatch[] = linkifyFind(text).map((item) => ({
    start: item.start,
    end: item.end,
    value: item.value,
    href: item.href,
  }));

  const phoneMatches = collectRegexMatches(text, PHONE_RE, telHref).filter(
    (match) => match.href.length > 4,
  );

  return mergeMatches([...linkifyMatches, ...phoneMatches]);
}
