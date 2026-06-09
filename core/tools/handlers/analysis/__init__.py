"""Analysis tool handlers (split by domain)."""
from core.tools.handlers.analysis.reports import (
    _get_mood_spending_report,
    _get_subscription_health,
)
from core.tools.handlers.analysis.history import (
    _compare_periods,
    _cross_feature_search,
    _get_wellness_history,
)
from core.tools.handlers.analysis.insights import (
    _generate_forecast,
    _generate_insights,
    _generate_yearly_summary,
)

__all__ = [
    "_get_subscription_health",
    "_get_mood_spending_report",
    "_generate_insights",
    "_generate_forecast",
    "_generate_yearly_summary",
    "_get_wellness_history",
    "_compare_periods",
    "_cross_feature_search",
]
