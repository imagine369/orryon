# Orryon capabilities (source of truth)

Policy for product, Help, and the AI system prompt (`core/system_prompt.py` v10). Strategic boundary: [PRODUCT_BOUNDARY.md](./PRODUCT_BOUNDARY.md). Chat link & action-card behavior: [CHAT_LINKS.md](./CHAT_LINKS.md).

## Product promise

**“Ask almost anything — when it’s about your life, Orryon actually does something.”**

| Layer | What it means |
|-------|----------------|
| **Chat** | Broad assistant for explanations, writing, planning, how-tos, health education, opinions, tutoring (non-code), and more |
| **Tools** | Their Orryon data + live weather & news — log, read, update; never guess amounts or IDs |
| **Not offered** | Porn / explicit sexual content · substantial **code** (IDE/homework) · **images** (generate/edit/analyze as a product) |

---

## How Orryon responds

| Kind | When | Examples |
|------|------|----------|
| **Chat** | Default — most questions | "Explain inflation", "How does this email sound?", "How do I hem a shirt?" |
| **Tool** | Their stored data or live facts | "Log $40 groceries", "What's on my calendar?", "Weather in Boston today" |

---

## Yes — chat (no tool required)

- General Q&A, explanations, brainstorming, study help (not programming assignments)
- Writing: drafts, tone, proofreading, emails, bios
- Life skills: sewing, cooking, repairs, hobbies — step-by-step
- Planning, relationships, travel, errands, scams, devices
- Health and wellness **education** (medical disclaimer — not a doctor)
- Respectful discussion of politics, religion, life topics
- Brief tech tips (what a term means) — not repo debugging

---

## Yes — tools (must call the tool)

| Area | Examples |
|------|----------|
| **Money** | Log expense/bill, budget status, forecasts, insights, goals |
| **Schedule** | Calendar events, tasks |
| **Notes & journal** | Add/search notes, journal entries |
| **Lists** | Grocery shopping list and custom lists (what to buy) |
| **Spending** | Groceries category tracks grocery *spend* for the month — separate from the list |
| **Health logs** | Vitals, medications, appointments (stored in Orryon) |
| **Weather** | `get_weather` — live conditions for a city/place |
| **News & web** | xAI `web_search` + `x_search` (Grok-style); RSS `search_web` fallback if Agent Tools unavailable |
| **Search** | Cross-feature search across their data |
| **Errands** | `create_fulfillment_handoff` — deeplink to Uber, DoorDash, Instacart, OpenTable, pharmacy (user completes in partner app) |

Morning **briefing**: Dashboard in the app (chat can suggest opening it).

---

## Voice by plan

| Plan | You speak (STT) | Orryon replies |
|------|-----------------|----------------|
| Free / Starter | — (Breathe only) | — |
| **Trial / Pro** | — (text chat only) | **Text only** |
| **Premium** | Mic in chat (650 min / mo) | **Text only** |
| **Premium Plus** | Mic in chat (1,200 min / mo) | **Text**; **TTS** when **Speak responses aloud** is on |

---

## Three limits

| Limit | Not OK | OK |
|-------|--------|-----|
| **Porn** | Explicit sexual content, roleplay, minors | — (hard block; see Never) |
| **Code** | Apps, repos, homework code, sustained debug | One-line plain-language tip; redirect to a dedicated coding tool |
| **Images** | Generate/edit/analyze images, logos, Lightroom workflows | One sentence on phone document photo |

Everyday **writing** (emails, tone) is not code. **Sewing/cooking** how-tos are core chat.

---

## Not yet (do not claim done)

- Complete checkout or payment in external apps on the user's behalf
- Auto-pay bills or transfer money
- Read **live** bank balance from a linked bank (use manual balance, expenses, CSV import)
- Send email on the user's behalf
- Shop on external sites (Instacart/DoorDash deeplink handoffs are OK — user pays in partner app)

**Alternatives:** calendar, tasks, reminders, `get_weather`, log expenses, `create_fulfillment_handoff`, link to official site.

---

## Never

- Pornographic or explicit sexual content
- Sexual content involving minors
- Violence, crime instructions, self-harm methods
- Crisis: route to 988 / 911 (see system prompt)

---

## Professional topics (discuss, not replace)

- Tax, legal, insurance, investing: general education only — not their CPA/lawyer/advisor
- Finance projections: labeled as user's data, not financial advice

---

## Tier note

Subscription tier affects **usage limits** (messages, voice, etc.), not whether Orryon helps in chat or with weather. Billing state is separate from this policy.

---

## Registered agent tools

Orryon exposes **71 canonical function tools** (`core/canonical_tools.CANONICAL_TOOL_NAMES`), plus xAI Agent Tools (`web_search`, `x_search`) when available, and RSS `search_web` as degraded fallback.

| Domain | Tools (summary) |
|--------|-----------------|
| Bills | log/get/edit/delete bill |
| Expenses | log/get/edit/delete/split expense |
| Calendar & tasks | events + tasks CRUD |
| Notes & journal | notes CRUD, search, pin; journal CRUD |
| Goals | create/get/update/delete |
| Lists & grocery list | lists CRUD, grocery list tools |
| Money & budget | balance, budget, spending summaries, forecasts, insights |
| Health | vitals, medications, appointments |
| Errands | `create_fulfillment_handoff` (deeplink handoffs) |
| Search & analysis | cross-feature search, compare periods, wellness history |
| World | `get_weather`, live web/X search |

`core/system_prompt.py` injects every canonical name into `## TOOL SURFACE` at runtime via `CANONICAL_TOOL_NAMES`. Section routing in the prompt must stay aligned with `_REPROMPT_SECTIONS` in `canonical_tools.py`.

Enforced by tests:

```bash
pytest tests/test_capabilities_sync.py tests/test_tools_registry.py -q
```

---

## When adding a feature

Update **all** of:

1. This file (if user-visible or policy-relevant)  
2. Follow `docs/ADDING_A_TOOL.md` (schema → handler → `TOOL_SPECS` → canonical → reprompt)  
3. Confirm `pytest tests/test_capabilities_sync.py` passes (`system_prompt` lists every canonical tool)  
4. Help FAQ if user-facing  
