"""
tasks.py — Task factory and query-routing logic for guddd.

CrewAI Task design
──────────────────
Each Task has:
  • description    — detailed instructions (includes user query when dynamic)
  • expected_output — what a good answer looks like (guides the LLM)
  • agent           — which specialist handles it
  • context         — list of upstream Tasks whose output feeds this one

Routing overview
────────────────
  Edward (Chief of Staff) handles:
    calendar, schedule, reminders, travel, research, drafting,
    action items, briefings, notes, personal tasks, general queries

  Alex (Finance) handles:
    budget, spending, net worth, investments, tax, forecasting,
    retirement, debt, subscriptions, financial recommendations

  Compound tasks chain multiple agents when a query spans domains.
"""

from __future__ import annotations

# ─────────────────────────────────────────────────────────────────────────────
# SHARED RESPONSE REQUIREMENTS
# ─────────────────────────────────────────────────────────────────────────────

_REASONING_PREFIX = (
    "Use the structured reasoning format before answering:\n"
    "  Thought: [current state · progress · what's verified · what's missing · risks]\n"
    "  Plan:    [numbered 1–4 prioritised next steps]\n"
    "  Action:  [tool calls and analysis]\n\n"
)

_JSON_SUFFIX = (
    "\n\nEnd your response with this exact JSON block (no text after it):\n"
    "{\n"
    '  "status": "complete" | "needs_input" | "partial" | "stuck",\n'
    '  "summary": "<brief result>",\n'
    '  "confidence": <0-100>,\n'
    '  "evidence": "<specific proof>",\n'
    '  "next_steps_or_question": "<empty or one question>"\n'
    "}"
)


def _memory_prefix(memory_context: str) -> str:
    """Prepend recalled long-term memories when available."""
    if not memory_context or not memory_context.strip():
        return ""
    return (
        "MEMORIES FROM PAST CONVERSATIONS WITH THIS USER:\n"
        f"{memory_context.strip()}\n"
        "Use the above to personalise your response — reference past goals, "
        "preferences, and decisions where relevant.\n\n"
    )


from crewai import Task
from agents import (
    alex,
    budget_agent,
    data_aggregator,
    edward,
    forecasting_agent,
    insights_agent,
    net_worth_agent,
    notes_agent,
)


# ─────────────────────────────────────────────────────────────────────────────
# EDWARD TASKS
# ─────────────────────────────────────────────────────────────────────────────

def create_schedule_task(user_query: str, memory_context: str = "") -> Task:
    """Edward handles all calendar and scheduling requests."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Handle this scheduling request: '{user_query}'\n\n"
            "Determine what type of action is needed:\n"
            "• CREATE EVENT: parse title, date, type, amount from the query, "
            "  then call create_calendar_event.\n"
            "• ADD BILL REMINDER: parse bill name, amount, and due day, "
            "  then call add_bill_reminder.\n"
            "• LIST: call list_upcoming_events with appropriate date range.\n"
            "After creating, confirm what was saved and suggest related follow-ups."
        ),
        expected_output=(
            "Confirmation of the action taken:\n"
            "• Event/reminder title, date, amount (if applicable)\n"
            "• Next occurrence (if recurring)\n"
            "• List of upcoming events if requested\n"
            "• One proactive follow-up suggestion from Edward."
            + _JSON_SUFFIX
        ),
        agent=edward,
    )


def create_travel_task(user_query: str, memory_context: str = "") -> Task:
    """Edward plans travel — itineraries, logistics, calendar placeholders."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Handle this travel request: '{user_query}'\n\n"
            "Use plan_travel to:\n"
            "1. Extract destination, dates, purpose, and preferences from the query.\n"
            "2. Create an itinerary note with a pre-departure checklist.\n"
            "3. Create calendar events for departure and return.\n"
            "4. List visa requirements, packing tips, and any concierge-style reminders.\n"
            "5. If budget is mentioned, flag to Alex for financial tracking.\n"
            "Be thorough — a great Chief of Staff anticipates every detail."
        ),
        expected_output=(
            "Travel plan confirmation:\n"
            "• Destination, dates, purpose\n"
            "• Itinerary note ID and summary\n"
            "• Calendar events created\n"
            "• Pre-departure checklist\n"
            "• Any visa / entry notes\n"
            "• Edward's proactive next step (e.g., 'Want me to set a reminder to book flights?')."
            + _JSON_SUFFIX
        ),
        agent=edward,
    )


def create_communication_task(user_query: str, memory_context: str = "") -> Task:
    """Edward drafts emails, messages, or any written communication."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Handle this communication request: '{user_query}'\n\n"
            "Use draft_message to:\n"
            "1. Identify the purpose, recipient, tone, and key points from the query.\n"
            "2. Draft a complete, polished message the user can send or adapt.\n"
            "3. Save it as a note for reference.\n"
            "4. Suggest any follow-up actions (e.g., calendar reminder to send).\n"
            "Match the user's implied tone — professional for business, "
            "casual for personal contexts."
        ),
        expected_output=(
            "Drafted communication:\n"
            "• Subject line\n"
            "• Full draft message\n"
            "• Tone and recipient context\n"
            "• Note ID where it's saved\n"
            "• Suggested follow-up (send deadline, reminder?)."
            + _JSON_SUFFIX
        ),
        agent=edward,
    )


def create_research_task(user_query: str, memory_context: str = "") -> Task:
    """Edward researches a topic and returns structured findings."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Research request: '{user_query}'\n\n"
            "Use research_topic to:\n"
            "1. Extract the topic, context, and desired output format.\n"
            "2. Structure findings: options/approaches, key differentiators, "
            "   pros/cons, and a clear recommendation.\n"
            "3. Save the research as a note.\n"
            "4. If the topic involves financial decisions, flag relevant data to Alex.\n"
            "Be concise but thorough — give the user everything they need to decide."
        ),
        expected_output=(
            "Research summary:\n"
            "• Topic and context\n"
            "• Key findings (bullet points)\n"
            "• Options/comparison (if applicable)\n"
            "• Clear recommendation with reasoning\n"
            "• Research note ID\n"
            "• Any financial implications to discuss with Alex."
            + _JSON_SUFFIX
        ),
        agent=edward,
    )


def create_action_items_task(user_query: str, memory_context: str = "") -> Task:
    """Edward manages the user's action items and to-dos."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Action item request: '{user_query}'\n\n"
            "Use manage_action_items to:\n"
            "• ADD: extract title, due date, priority, and category from the query.\n"
            "• LIST: retrieve open items, ordered by priority and due date.\n"
            "• COMPLETE: mark the referenced item as done.\n"
            "After acting, confirm and suggest any related scheduling or follow-ups."
        ),
        expected_output=(
            "Action item update:\n"
            "• What was added/updated/completed\n"
            "• Current open action items (top 5 by priority)\n"
            "• Edward's proactive next step."
            + _JSON_SUFFIX
        ),
        agent=edward,
    )


def create_briefing_task(user_query: str, memory_context: str = "") -> Task:
    """Edward compiles a briefing across schedule, tasks, and notes."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Briefing request: '{user_query}'\n\n"
            "Use prepare_briefing to compile a comprehensive briefing covering:\n"
            "1. Upcoming calendar events and bill due dates.\n"
            "2. Open action items by priority.\n"
            "3. Recent notes and journal entries.\n"
            "4. Call get_financial_recommendations for a headline financial insight "
            "   to include from Alex's domain.\n"
            "Present it as a structured daily/weekly brief — concise and scannable."
        ),
        expected_output=(
            "Structured briefing:\n"
            "• Date and period covered\n"
            "• Upcoming schedule (next 7 days)\n"
            "• Top action items\n"
            "• Recent notes highlights\n"
            "• One financial headline from Alex\n"
            "• Edward's priority recommendation for the day."
            + _JSON_SUFFIX
        ),
        agent=edward,
    )


def create_notes_task(user_query: str, memory_context: str = "") -> Task:
    """Edward (or notes_agent) handles save/search/summarise notes."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Notes request: '{user_query}'\n\n"
            "Determine the intent:\n"
            "• SAVE: extract title, content, and tags from the query, call save_note.\n"
            "• SEARCH: extract keywords/tags, call search_notes.\n"
            "• SUMMARISE: call summarize_notes for recent entries.\n"
            "Link the note to a relevant goal or account if mentioned."
        ),
        expected_output=(
            "For SAVE: confirmation with note ID, title, and tags.\n"
            "For SEARCH: list of matching notes with date and preview.\n"
            "For SUMMARISE: bullet-point summary with key themes."
            + _JSON_SUFFIX
        ),
        agent=edward,
    )


def create_links_task(user_query: str, memory_context: str = "") -> Task:
    """Edward manages the user's Links page — save, list, or delete links."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Links request: '{user_query}'\n\n"
            "Determine the intent:\n"
            "• SAVE: extract the URL and optional title/description/tags, "
            "  then call save_link. If no title given, infer one from the URL domain.\n"
            "• LIST / PULL UP: call get_links and return a formatted list with titles and URLs.\n"
            "• DELETE: extract the link title or id, call delete_link.\n"
            "• SEARCH: call get_links with a search or tags filter.\n"
            "Confirm what was saved or return the requested links clearly."
        ),
        expected_output=(
            "For SAVE: confirmation with link title, URL, and link_id.\n"
            "For LIST: formatted list of links with title, URL, description, and tags.\n"
            "For DELETE: confirmation of removal.\n"
            "For SEARCH: matching links with context."
            + _JSON_SUFFIX
        ),
        agent=edward,
    )


def create_inspo_task(user_query: str, memory_context: str = "") -> Task:
    """Edward manages the user's Inspo board — list or describe saved images."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Inspo board request: '{user_query}'\n\n"
            "Determine the intent:\n"
            "• LIST / PULL UP: call get_inspo_items and return a summary of saved "
            "  inspiration images — titles, descriptions, tags, and dates.\n"
            "• SEARCH: call get_inspo_items with a tags or search filter.\n"
            "• NOTE: actual image uploads happen via the Inspo tab UI — "
            "  if user asks to upload, direct them there and confirm the tab is available.\n"
            "Present inspo items in an engaging, visual-friendly format."
        ),
        expected_output=(
            "For LIST: summary of inspo board — count, titles, tags, and dates.\n"
            "For SEARCH: matching items with descriptions.\n"
            "Always end with an invitation to add more via the Inspo tab."
            + _JSON_SUFFIX
        ),
        agent=edward,
    )


def create_general_edward_task(user_query: str, memory_context: str = "") -> Task:
    """Fallback: Edward handles any unclassified request."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"User request: '{user_query}'\n\n"
            "As Chief of Staff, handle this request directly or delegate to the "
            "appropriate specialist. Use your available tools to provide a complete, "
            "actionable response. If the request is financial in nature, "
            "surface relevant data and note that Alex can go deeper. "
            "Always end with one concrete next step."
        ),
        expected_output=(
            "A well-structured response:\n"
            "1. Direct answer or action taken\n"
            "2. Relevant context\n"
            "3. One actionable next step from Edward."
            + _JSON_SUFFIX
        ),
        agent=edward,
    )


# ─────────────────────────────────────────────────────────────────────────────
# ALEX TASKS (Finance)
# ─────────────────────────────────────────────────────────────────────────────

def create_data_sync_task(memory_context: str = "") -> Task:
    """Full data sync from all connected sources."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + "Perform a complete financial data sync:\n"
            "1. Fetch all bank / investment / credit accounts (Plaid or local DB).\n"
            "2. Retrieve the last 30 days of transactions.\n"
            "3. Update portfolio holdings with today's prices via yfinance.\n"
            "4. Persist everything to the local SQLite database.\n"
            "Report a concise summary: accounts found, transactions synced, any errors."
        ),
        expected_output=(
            "A bullet-point summary: number of accounts, transactions, and holdings updated; "
            "last-sync timestamp; and any API errors encountered."
            + _JSON_SUFFIX
        ),
        agent=data_aggregator,
    )


def create_net_worth_task(memory_context: str = "") -> Task:
    """Alex calculates and narrates the user's current net worth."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + "Calculate the user's complete net worth right now:\n"
            "1. Call calculate_net_worth to get assets and liabilities.\n"
            "2. Call get_portfolio_performance for investment breakdown.\n"
            "3. Present: total net worth, asset breakdown by class (liquid / investments / "
            "real estate), total liabilities (credit / loans), and top portfolio holdings "
            "with unrealised P&L.\n"
            "Format all dollar figures with commas and two decimal places."
        ),
        expected_output=(
            "A structured report with:\n"
            "• Net worth: $X\n"
            "• Assets: liquid $X, investments $X, real estate $X\n"
            "• Liabilities: credit $X, loans $X\n"
            "• Portfolio: top holdings, total return %, allocation %\n"
            "• One key insight or recommendation."
            + _JSON_SUFFIX
        ),
        agent=alex,
    )


def create_budget_analysis_task(days: int = 30, memory_context: str = "") -> Task:
    """Alex analyses spending and budget health."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Analyse spending for the last {days} days:\n"
            "1. Call get_spending_by_category.\n"
            "2. Call analyze_spending_trends for MoM changes.\n"
            "3. Call detect_subscriptions to surface recurring charges.\n"
            "4. Identify the top 3 spending categories and any category up >20% MoM.\n"
            "5. Calculate savings rate = (income − expenses) / income.\n"
            "Present actionable findings, not just raw numbers."
        ),
        expected_output=(
            f"Budget report for last {days} days:\n"
            "• Total spending and top categories with percentages\n"
            "• Detected subscriptions and monthly cost\n"
            "• Month-over-month changes (categories up or down >20%)\n"
            "• Estimated savings rate\n"
            "• 2–3 specific, actionable tips."
            + _JSON_SUFFIX
        ),
        agent=alex,
    )


def create_retirement_projection_task(
    params: dict | None = None, memory_context: str = ""
) -> Task:
    """Alex runs a Monte Carlo retirement simulation."""
    param_str = str(params) if params else (
        "defaults: age 30, retire at 65, $332k saved, $2k/month contribution, "
        "7% expected annual return, $2M target"
    )
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Run a comprehensive retirement projection.\n"
            f"Parameters: {param_str}\n"
            "1. Call run_monte_carlo_retirement with the given parameters.\n"
            "2. Calculate projected date to reach $1M and $2M milestones.\n"
            "3. Suggest what monthly contribution achieves 90%+ success probability.\n"
            "4. Provide a sensitivity table: impact of saving $200/mo more vs less."
        ),
        expected_output=(
            "Retirement projection:\n"
            "• Probability of reaching target: X%\n"
            "• Median outcome at retirement: $X\n"
            "• 10th / 90th percentile: $X / $X\n"
            "• Years until retirement: N\n"
            "• Monthly contribution needed for 90% success: $X\n"
            "• Key risk: ..."
            + _JSON_SUFFIX
        ),
        agent=alex,
    )


def create_insights_task(memory_context: str = "") -> Task:
    """Alex surfaces proactive financial insights and anomalies."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + "Generate a proactive financial insight report:\n"
            "1. Call detect_anomalies — flag any unusual transactions.\n"
            "2. Call analyze_spending_trends — surface categories changing >20% MoM.\n"
            "3. Call get_financial_recommendations — produce a prioritised action list.\n"
            "4. Check emergency fund adequacy (goal: 3–6 months of expenses).\n"
            "5. Review goal progress for all active savings goals.\n"
            "Present the top 5 most impactful insights."
        ),
        expected_output=(
            "Insight report:\n"
            "• Anomalies: [list with description, amount, reason]\n"
            "• Spending alerts: [categories rising/falling significantly]\n"
            "• Emergency fund: [status — adequate / needs attention]\n"
            "• Goal progress: [each goal with %]\n"
            "• Top 3 recommendations with expected financial impact."
            + _JSON_SUFFIX
        ),
        agent=alex,
    )


def create_cash_flow_forecast_task(months: int = 6, memory_context: str = "") -> Task:
    """Alex projects month-by-month cash flow."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Forecast cash flow for the next {months} months:\n"
            "1. Call forecast_cash_flow with estimated income/expense figures.\n"
            "2. Identify any months where the projected balance drops below one month "
            "   of expenses (a danger zone).\n"
            "3. Suggest a savings rate that maintains a healthy cash buffer.\n"
            "4. Describe the impact of a 10% savings rate increase."
        ),
        expected_output=(
            f"Cash flow forecast ({months} months):\n"
            "• Month-by-month: income, expenses, net, balance\n"
            "• Risk months (balance < 1 mo expenses): [list]\n"
            "• Recommended savings rate: X%\n"
            "• Annual surplus at current rate: $X."
            + _JSON_SUFFIX
        ),
        agent=alex,
    )


# ─────────────────────────────────────────────────────────────────────────────
# COMPOUND TASKS (multi-agent with context dependencies)
# ─────────────────────────────────────────────────────────────────────────────

def create_net_worth_plus_retirement_tasks(
    user_query: str, memory_context: str = ""
) -> list[Task]:
    """Alex: net worth feeds into retirement projection."""
    nw_task = create_net_worth_task(memory_context=memory_context)

    retirement_task = Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Original user question: '{user_query}'\n\n"
            "Using the net worth data provided in context:\n"
            "1. Extract the total investment portfolio value.\n"
            "2. Run run_monte_carlo_retirement using the ACTUAL current savings figure.\n"
            "3. Present probability of success and key outcomes.\n"
            "4. Give one concrete recommendation to improve the success probability."
        ),
        expected_output=(
            "Integrated retirement analysis:\n"
            "• Current net worth: $X (from previous step)\n"
            "• Investment portfolio used as starting balance: $X\n"
            "• Probability of reaching $2M target: X%\n"
            "• Median outcome: $X\n"
            "• One recommendation to improve odds."
            + _JSON_SUFFIX
        ),
        agent=alex,
        context=[nw_task],
    )

    return [nw_task, retirement_task]


def create_budget_plus_insights_tasks(
    user_query: str, memory_context: str = ""
) -> list[Task]:
    """Alex: budget analysis feeds into personalised insights."""
    budget_task = create_budget_analysis_task(days=30, memory_context=memory_context)

    insights_task = Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Original user question: '{user_query}'\n\n"
            "Using the budget analysis from context:\n"
            "1. Run detect_anomalies to surface any suspicious transactions.\n"
            "2. Based on the top spending categories and trends already identified, "
            "   generate get_financial_recommendations targeting the highest-impact areas.\n"
            "3. Provide 3 specific, personalised recommendations with estimated dollar impact."
        ),
        expected_output=(
            "Personalised financial insight report:\n"
            "• Top anomalies (if any)\n"
            "• Category-specific recommendations based on actual spending\n"
            "• Estimated annual savings from each recommendation\n"
            "• Priority order: high / medium / low impact."
            + _JSON_SUFFIX
        ),
        agent=alex,
        context=[budget_task],
    )

    return [budget_task, insights_task]


def create_edward_finance_briefing_tasks(
    user_query: str, memory_context: str = ""
) -> list[Task]:
    """
    Edward requests a financial snapshot from Alex to include in a briefing.
    Alex runs net worth + insights, then Edward compiles the full brief.
    """
    finance_task = Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + "Produce a compact financial snapshot for Edward's briefing:\n"
            "1. Call calculate_net_worth — headline number and MoM change.\n"
            "2. Call get_financial_recommendations — top 2 priority recommendations.\n"
            "3. Check for any anomalies via detect_anomalies.\n"
            "Return a concise summary Edward can include in the daily brief."
        ),
        expected_output=(
            "Financial snapshot (for Edward's briefing):\n"
            "• Net worth: $X\n"
            "• Top 2 recommendations\n"
            "• Any anomalies to flag\n"
            "• One-line financial health status."
            + _JSON_SUFFIX
        ),
        agent=alex,
    )

    briefing_task = Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Original request: '{user_query}'\n\n"
            "Using Alex's financial snapshot from context, compile a full briefing:\n"
            "1. Call prepare_briefing to pull schedule and action items.\n"
            "2. Integrate the financial headline from Alex's output.\n"
            "3. Present a clean, structured brief the user can scan in 60 seconds.\n"
            "4. End with Edward's one priority recommendation for today."
        ),
        expected_output=(
            "Complete briefing:\n"
            "• Date and greeting\n"
            "• Schedule highlights\n"
            "• Open action items\n"
            "• Financial headline (from Alex)\n"
            "• Edward's priority for today."
            + _JSON_SUFFIX
        ),
        agent=edward,
        context=[finance_task],
    )

    return [finance_task, briefing_task]


# ─────────────────────────────────────────────────────────────────────────────
# QUERY ROUTER
# ─────────────────────────────────────────────────────────────────────────────

def route_query_to_tasks(
    user_query: str, memory_context: str = ""
) -> list[Task]:
    """
    Analyse the free-text user query and return the appropriate Task list.

    Edward handles: scheduling, travel, research, communication, action items,
                    briefings, notes, general personal assistant requests.
    Alex handles:   anything financial — budget, net worth, investments,
                    forecasting, tax, debt, subscriptions.
    """
    q = user_query.lower()

    # ── Travel & Logistics ────────────────────────────────────────────────────
    if any(kw in q for kw in [
        "travel", "trip", "flight", "hotel", "itinerary", "visa",
        "book", "airport", "pack", "destination", "depart", "return flight",
    ]):
        return [create_travel_task(user_query, memory_context=memory_context)]

    # ── Communication / Drafting ──────────────────────────────────────────────
    if any(kw in q for kw in [
        "draft", "write an email", "write a message", "compose",
        "follow up", "follow-up", "thank you email", "reply to",
        "message to", "email to", "communicate",
    ]):
        return [create_communication_task(user_query, memory_context=memory_context)]

    # ── Research ──────────────────────────────────────────────────────────────
    if any(kw in q for kw in [
        "research", "find best", "compare", "look up", "options for",
        "what are the best", "which is better", "recommend a", "vendor",
        "summarize", "summarise findings",
    ]):
        return [create_research_task(user_query, memory_context=memory_context)]

    # ── Briefing / Catch me up ────────────────────────────────────────────────
    if any(kw in q for kw in [
        "briefing", "brief me", "catch me up", "what's on my plate",
        "daily summary", "weekly summary", "what do i have today",
        "morning brief", "what's happening",
    ]):
        # Compound: Alex provides financial snapshot, Edward compiles the full brief
        return create_edward_finance_briefing_tasks(user_query, memory_context=memory_context)

    # ── Action Items / To-dos ─────────────────────────────────────────────────
    if any(kw in q for kw in [
        "action item", "todo", "to do", "to-do", "task", "follow up on",
        "remind me to", "don't forget", "add to my list",
    ]):
        return [create_action_items_task(user_query, memory_context=memory_context)]

    # ── Scheduling & Calendar ─────────────────────────────────────────────────
    if any(kw in q for kw in [
        "schedule", "calendar", "remind", "reminder", "event",
        "bill due", "due date", "appointment", "deadline",
        "add to calendar", "set a reminder",
    ]):
        return [create_schedule_task(user_query, memory_context=memory_context)]

    # ── Notes / Journal ───────────────────────────────────────────────────────
    if any(kw in q for kw in [
        "note", "journal", "memo", "log", "write down", "jot",
        "save this", "remember this", "record",
        "put this in notes", "add to notes", "pull up notes", "show notes",
        "open notes", "my notes",
    ]):
        return [create_notes_task(user_query, memory_context=memory_context)]

    # ── Links page ────────────────────────────────────────────────────────────
    if any(kw in q for kw in [
        "link", "links", "url", "website", "save this link", "add link",
        "put in links", "pull up links", "show links", "my links",
        "linktree", "share link", "copy link",
    ]):
        return [create_links_task(user_query, memory_context=memory_context)]

    # ── Inspo board ───────────────────────────────────────────────────────────
    if any(kw in q for kw in [
        "inspo", "inspiration", "mood board", "moodboard",
        "pull up inspo", "show inspo", "my inspo", "inspo board",
        "inspiration board", "save to inspo", "add to inspo",
    ]):
        return [create_inspo_task(user_query, memory_context=memory_context)]

    # ── Retirement + net worth (compound, Alex) ───────────────────────────────
    is_retirement = any(kw in q for kw in [
        "retire", "retirement", "financial independence", "fi/re", "fire",
        "nest egg", "when can i retire",
    ])
    needs_net_worth = any(kw in q for kw in [
        "net worth", "current savings", "how much do i have", "my savings",
    ])
    if is_retirement and needs_net_worth:
        return create_net_worth_plus_retirement_tasks(
            user_query, memory_context=memory_context
        )
    if is_retirement:
        return [create_retirement_projection_task(memory_context=memory_context)]

    # ── Net worth / portfolio (Alex) ──────────────────────────────────────────
    if any(kw in q for kw in [
        "net worth", "worth", "portfolio", "holdings", "assets",
        "liabilities", "allocation", "stock", "crypto", "investments",
    ]):
        return [create_net_worth_task(memory_context=memory_context)]

    # ── Budget + insights (compound, Alex) ────────────────────────────────────
    is_budget = any(kw in q for kw in [
        "spend", "budget", "expense", "subscription", "category",
        "where is my money", "bills", "groceries", "dining",
    ])
    wants_insight = any(kw in q for kw in [
        "recommend", "advice", "tips", "what should i", "how can i",
    ])
    if is_budget and wants_insight:
        return create_budget_plus_insights_tasks(
            user_query, memory_context=memory_context
        )
    if is_budget:
        return [create_budget_analysis_task(memory_context=memory_context)]

    # ── Forecasting / scenarios (Alex) ────────────────────────────────────────
    if any(kw in q for kw in [
        "forecast", "project", "future", "scenario", "what if",
        "cash flow", "savings goal", "if i lose my job",
        "if i get a raise", "job loss", "emergency fund",
    ]):
        return [create_cash_flow_forecast_task(memory_context=memory_context)]

    # ── Financial insights only (Alex) ────────────────────────────────────────
    if any(kw in q for kw in [
        "insight", "anomal", "unusual", "trend", "improve",
        "recommend", "advice", "tips", "alert", "tax",
        "debt", "payoff", "interest",
    ]):
        return [create_insights_task(memory_context=memory_context)]

    # ── Data sync ────────────────────────────────────────────────────────────
    if any(kw in q for kw in [
        "sync", "refresh", "update data", "load data", "fetch", "sample",
    ]):
        return [create_data_sync_task(memory_context=memory_context)]

    # ── Default: Edward handles ───────────────────────────────────────────────
    return [create_general_edward_task(user_query, memory_context=memory_context)]
