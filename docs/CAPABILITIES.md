# Orryon capabilities (source of truth)

Policy for product, Help, and the AI system prompt (`core/system_prompt.py` v10).

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
| **Lists** | Grocery and custom lists |
| **Health logs** | Vitals, medications, appointments (stored in Orryon) |
| **Weather** | `get_weather` — live conditions for a city/place |
| **News & web** | xAI `web_search` + `x_search` (Grok-style); RSS `search_web` fallback if Agent Tools unavailable |
| **Search** | Cross-feature search across their data |

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

- Book Uber/Lyft or food delivery
- Auto-pay bills or transfer money
- Read **live** bank balance from a linked bank (use manual balance, expenses, CSV import)
- Send email on the user's behalf
- Shop on external sites
**Alternatives:** calendar, tasks, reminders, `get_weather`, log expenses, link to official site.

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

## When adding a feature

Update **all** of:

1. This file  
2. `core/canonical_tools.py` + `core/tools/schemas.py` + handler + registry  
3. `core/system_prompt.py` tool list / CAPABILITIES TODAY section  
4. Help FAQ if user-facing  
