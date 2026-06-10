import { visit } from "unist-util-visit";
import type { Link, PhrasingContent, Root, Text } from "mdast";
import type { Plugin } from "unified";
import { findChatLinks, sanitizeChatHref } from "@/lib/chat-message-links";

const SKIP_PARENT_TYPES = new Set([
  "link",
  "linkReference",
  "inlineCode",
  "code",
  "pre",
  "html",
]);

/**
 * Turn plain-text URLs, emails, and phone numbers into markdown links
 * before React renders the assistant message.
 */
export const remarkChatAutolink: Plugin<[], Root> = () => (tree) => {
  visit(tree, "text", (node: Text, index, parent) => {
    if (index === undefined || !parent || !("children" in parent)) return;
    if (SKIP_PARENT_TYPES.has(parent.type)) return;

    const matches = findChatLinks(node.value);
    if (matches.length === 0) return;

    const children: PhrasingContent[] = [];
    let cursor = 0;

    for (const match of matches) {
      if (match.start > cursor) {
        children.push({ type: "text", value: node.value.slice(cursor, match.start) });
      }

      const href = sanitizeChatHref(match.href);
      if (href) {
        children.push({
          type: "link",
          url: href,
          children: [{ type: "text", value: match.value }],
        } as Link);
      } else {
        children.push({ type: "text", value: match.value });
      }

      cursor = match.end;
    }

    if (cursor < node.value.length) {
      children.push({ type: "text", value: node.value.slice(cursor) });
    }

    if (children.length === 0) return;

    parent.children.splice(index, 1, ...children);
    return index + children.length;
  });
};
