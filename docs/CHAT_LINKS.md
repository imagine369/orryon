# Chat links & action cards

How Orryon formats and renders clickable links in assistant messages (text chat).

## When the model adds links

- **Default:** plain prose, no link cards.
- **Action intent only:** reservations, directions, call, buy, book, join a call, save a contact.
- **Places:** browsing → names in prose; acting on one place → one compact card.

See `## LINK & ACTION RULES` in `core/system_prompt.py`.

## Action card format

```markdown
**Nobu Malibu**
[4555 Ocean Ave, Malibu, CA](https://maps.google.com/?q=4555+Ocean+Ave+Malibu+CA)
[Call to Reserve](tel:+13103101511)
[Book a Table](https://www.opentable.com/...)
```

- Bold title line, then one `[Label](URL)` per line (underlined in UI; no emojis required).
- Legacy emoji-prefixed lines still parse.

## Frontend pipeline

| Layer | Module | Role |
|-------|--------|------|
| Segment | `parseChatContactBlocks` | Splits action cards vs markdown |
| Cards | `ChatContactCard` | Underlined links, Add to Contacts |
| Prose | `ChatMarkdown` + GFM | Markdown rendering |
| Autolink | `remarkChatAutolink` | URL, email, phone in plain text only |

## Security

- **Allowed schemes:** `https:`, `http:`, `tel:`, `mailto:` only (`sanitizeChatHref`).
- Autolink skips disallowed schemes (plain text fallback).
- vCard export normalizes/strips `tel:` and `mailto:` payloads.

## Maps URLs

Use explicit Google Maps links in markdown or cards:

`https://maps.google.com/?q=Street+City+State`

Street addresses are **not** autolinked in prose (too many false positives).
