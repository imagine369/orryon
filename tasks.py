"""
tasks.py — Task factory and query-routing logic for guddd.

CrewAI Task design
──────────────────
Each Task has:
  • description    — detailed instructions (includes user query when dynamic)
  • expected_output — what a good answer looks like (guides the LLM)
  • agent           — which specialist handles it
  • context         — list of upstream Tasks whose output feeds this one (for compound tasks)

Task types
──────────
  Static     — always-on tasks (data sync, net worth snapshot)
  Dynamic    — created per user query with specific parameters
  Compound   — two+ tasks with context dependencies (e.g., net worth → retirement)

Usage
──────
  from tasks import route_query_to_tasks

  tasks = route_query_to_tasks("Run my retirement projection")
  # → [Task(agent=forecasting_agent)]

  tasks = route_query_to_tasks("What's my net worth and when can I retire?")
  # → [nw_task, retirement_task]  (retirement has context=[nw_task])
"""

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
    budget_agent,
    data_aggregator,
    forecasting_agent,
    insights_agent,
    net_worth_agent,
    notes_agent,
    orchestrator,
    scheduling_agent,
)


# ─────────────────────────────────────────────────────────────────────────────
# STATIC TASKS
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
    """Calculate and narrate the user's current net worth."""
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
        agent=net_worth_agent,
    )


def create_budget_analysis_task(days: int = 30, memory_context: str = "") -> Task:
    """Spending analysis and budget health check."""
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
        agent=budget_agent,
    )


def create_retirement_projection_task(
    params: dict | None = None, memory_context: str = ""
) -> Task:
    """Monte Carlo retirement simulation."""
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
        agent=forecasting_agent,
    )


def create_insights_task(memory_context: str = "") -> Task:
    """Proactive financial insights and anomaly detection."""
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
        agent=insights_agent,
    )


def create_cash_flow_forecast_task(months: int = 6, memory_context: str = "") -> Task:
    """Month-by-month cash flow projection."""
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
        agent=forecasting_agent,
    )


def create_schedule_task(user_query: str, memory_context: str = "") -> Task:
    """Handle all scheduling and calendar requests."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Handle this scheduling request: '{user_query}'\n\n"
            "Determine what type of scheduling action is needed:\n"
            "• CREATE: parse the bill/event name, amount, and date from the query, "
            "  then call create_calendar_event or add_bill_reminder.\n"
            "• LIST: call list_upcoming_events with appropriate date range.\n"
            "• DETECT: call detect_subscriptions to auto-populate bill reminders.\n"
            "After creating, confirm what was saved and when the next occurrence is."
        ),
        expected_output=(
            "Confirmation of the action taken:\n"
            "• Event/reminder title, date, amount (if applicable)\n"
            "• Whether it synced to Google Calendar (or .ics fallback)\n"
            "• List of upcoming events if requested\n"
            "• Next step suggestion (e.g., 'Want me to set up all your other bills?')."
            + _JSON_SUFFIX
        ),
        agent=scheduling_agent,
    )


def create_notes_task(user_query: str, memory_context: str = "") -> Task:
    """Handle all notes, journal, and memo requests."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Handle this notes request: '{user_query}'\n\n"
            "Determine the intent:\n"
            "• SAVE: extract title, content, and tags from the query, call save_note. "
            "  Infer tags from the content (e.g., mention of 'savings' → tag: savings).\n"
            "• SEARCH: extract keywords/tags, call search_notes.\n"
            "• SUMMARISE: call summarize_notes for recent entries.\n"
            "Link the note to a relevant goal or account if the query mentions one."
        ),
        expected_output=(
            "For SAVE: confirmation with note ID, title, tags, and filename.\n"
            "For SEARCH: list of matching notes with date and preview.\n"
            "For SUMMARISE: bullet-point summary of recent financial journal entries "
            "with key themes."
            + _JSON_SUFFIX
        ),
        agent=notes_agent,
    )


def create_general_query_task(user_query: str, memory_context: str = "") -> Task:
    """Fallback: orchestrator handles an unclassified query."""
    return Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"User query: '{user_query}'\n\n"
            "This query did not match a specific routing rule. "
            "Use your tools to fetch the most relevant financial data and provide a "
            "comprehensive, helpful answer. Be specific with numbers and actionable "
            "with recommendations. If you need data that isn't loaded yet, call "
            "load_sample_data first. Include one clear next step."
        ),
        expected_output=(
            "A well-structured response:\n"
            "1. Direct answer to the question with specific figures\n"
            "2. Relevant context (why this matters)\n"
            "3. One actionable next step\n"
            "4. Privacy note if sensitive data was used."
            + _JSON_SUFFIX
        ),
        agent=orchestrator,
    )


# ─────────────────────────────────────────────────────────────────────────────
# COMPOUND TASKS (multi-agent with context dependencies)
# ─────────────────────────────────────────────────────────────────────────────

def create_net_worth_plus_retirement_tasks(
    user_query: str, memory_context: str = ""
) -> list[Task]:
    """
    Two-task compound: net worth feeds into retirement projection.
    The forecasting agent receives the actual portfolio value as context.
    """
    nw_task = create_net_worth_task(memory_context=memory_context)

    retirement_task = Task(
        description=(
            _memory_prefix(memory_context)
            + _REASONING_PREFIX
            + f"Original user question: '{user_query}'\n\n"
            "Using the net worth data provided in context:\n"
            "1. Extract the total investment portfolio value.\n"
            "2. Run run_monte_carlo_retirement using the ACTUAL current savings figure "
            "   (not a default). Assume retirement age 65, $2k/month contribution, "
            "   7% mean annual return unless the user specified otherwise.\n"
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
        agent=forecasting_agent,
        context=[nw_task],
    )

    return [nw_task, retirement_task]


def create_budget_plus_insights_tasks(
    user_query: str, memory_context: str = ""
) -> list[Task]:
    """
    Two-task compound: budget analysis feeds into personalised insights.
    """
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
        agent=insights_agent,
        context=[budget_task],
    )

    return [budget_task, insights_task]


# ─────────────────────────────────────────────────────────────────────────────
# QUERY ROUTER
# ─────────────────────────────────────────────────────────────────────────────

def route_query_to_tasks(
    user_query: str, memory_context: str = ""
) -> list[Task]:
    """
    Analyse the free-text user query and return the appropriate Task list.

    Args:
        user_query:      The user's raw input string.
        memory_context:  Recalled long-term memories for this user (injected
                         into each task description for personalisation).

    Returns a list because compound tasks have context dependencies.
    The Crew will execute tasks in order, passing outputs as context.
    """
    q = user_query.lower()

    # ── Scheduling ────────────────────────────────────────────────────────────
    if any(kw in q for kw in [
        "schedule", "calendar", "remind", "reminder", "event",
        "bill due", "due date", "appointment", "deadline",
    ]):
        return [create_schedule_task(user_query, memory_context=memory_context)]

    # ── Notes ─────────────────────────────────────────────────────────────────
    if any(kw in q for kw in [
        "note", "journal", "memo", "log", "write down", "jot",
        "save this", "remember this", "record",
    ]):
        return [create_notes_task(user_query, memory_context=memory_context)]

    # ── Retirement + net worth (compound) ─────────────────────────────────────
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

    # ── Net worth / portfolio ──────────────────────────────────────────────────
    if any(kw in q for kw in [
        "net worth", "worth", "portfolio", "holdings", "assets",
        "liabilities", "allocation", "stock", "crypto", "investments",
    ]):
        return [create_net_worth_task(memory_context=memory_context)]

    # ── Budget + insights (compound) ──────────────────────────────────────────
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

    # ── Forecasting / scenarios ────────────────────────────────────────────────
    if any(kw in q for kw in [
        "forecast", "project", "future", "scenario", "what if",
        "cash flow", "savings goal", "if i lose my job",
        "if i get a raise", "job loss", "emergency",
    ]):
        return [create_cash_flow_forecast_task(memory_context=memory_context)]

    # ── Insights only ────────────────────────────────────────────────────────
    if any(kw in q for kw in [
        "insight", "anomal", "unusual", "trend", "improve",
        "recommend", "advice", "tips", "alert",
    ]):
        return [create_insights_task(memory_context=memory_context)]

    # ── Data sync ────────────────────────────────────────────────────────────
    if any(kw in q for kw in [
        "sync", "refresh", "update data", "load data", "fetch", "sample",
    ]):
        return [create_data_sync_task(memory_context=memory_context)]

    # ── Default ───────────────────────────────────────────────────────────────
    return [create_general_query_task(user_query, memory_context=memory_context)]
