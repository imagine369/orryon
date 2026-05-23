"""OpenAI-compatible tool schemas — analysis domain."""
from __future__ import annotations

SCHEMAS: list[dict] = [{'type': 'function',
  'function': {'name': 'get_subscription_health',
               'description': 'Check which subscriptions may be unused — finds active recurring '
                              'bills with no matching transaction in the last 90 days. Use when '
                              "the user asks 'am I paying for anything I don't use?', 'which "
                              "subscriptions should I cancel?', 'find unused subscriptions', or "
                              'similar.',
               'parameters': {'type': 'object', 'properties': {}}}},
 {'type': 'function',
  'function': {'name': 'get_mood_spending_report',
               'description': 'Analyse how spending varies by mood — correlates notes mood entries '
                              'with transaction amounts on the same day. Use when the user asks '
                              "'does my mood affect my spending?', 'do I spend more when "
                              "stressed?', 'show me mood spending patterns', or similar.",
               'parameters': {'type': 'object', 'properties': {}}}},
 {'type': 'function',
  'function': {'name': 'generate_insights',
               'description': "Generate INSIGHTS — analytical summary of the user's real data "
                              'across the specified sections and date range. Returns spending '
                              'totals, top categories, budget status, and pattern observations. '
                              'Never fabricate numbers; the tool pulls live data.',
               'parameters': {'type': 'object',
                              'properties': {'scope': {'type': 'array',
                                                       'description': 'Sections to analyse.',
                                                       'items': {'type': 'string',
                                                                 'enum': ['expenses',
                                                                          'bills',
                                                                          'goals',
                                                                          'journal',
                                                                          'calendar',
                                                                          'wellness']}},
                                             'date_range': {'type': 'object',
                                                            'properties': {'from': {'type': 'string'},
                                                                           'to': {'type': 'string'}}},
                                             'focus': {'type': 'string',
                                                       'enum': ['spending',
                                                                'saving',
                                                                'trends',
                                                                'anomalies',
                                                                'progress',
                                                                'mood',
                                                                'general'],
                                                       'description': 'Analysis angle (default: '
                                                                      'general).'}}}}},
 {'type': 'function',
  'function': {'name': 'generate_forecast',
               'description': 'Generate a FORECAST — projected future financial state combining '
                              'balance, recurring bills, active goals, and any assumptions. Use '
                              "for 'can I afford X next month' / 'how much will I have left' "
                              'questions.',
               'parameters': {'type': 'object',
                              'properties': {'horizon_days': {'type': 'integer',
                                                              'description': 'Days ahead (default '
                                                                             '30).'},
                                             'scope': {'type': 'array',
                                                       'description': 'Sections to include in '
                                                                      'projection.',
                                                       'items': {'type': 'string',
                                                                 'enum': ['expenses',
                                                                          'bills',
                                                                          'goals',
                                                                          'income']}},
                                             'scenario': {'type': 'string',
                                                          'enum': ['baseline',
                                                                   'optimistic',
                                                                   'pessimistic',
                                                                   'custom'],
                                                          'description': 'Default: baseline.'},
                                             'assumptions': {'type': 'array',
                                                             'description': 'One-line strings '
                                                                            'describing any '
                                                                            'one-off purchases or '
                                                                            'income events.',
                                                             'items': {'type': 'string'}}}}}},
 {'type': 'function',
  'function': {'name': 'generate_yearly_summary',
               'description': 'Generate a YEARLY summary / year-in-review across spending, goals, '
                              'and optionally journal/calendar for a specific calendar year.',
               'parameters': {'type': 'object',
                              'properties': {'year': {'type': 'integer',
                                                      'description': '4-digit year (required).'},
                                             'sections': {'type': 'array',
                                                          'description': 'Sections to include '
                                                                         '(default: expenses, '
                                                                         'bills, goals).',
                                                          'items': {'type': 'string',
                                                                    'enum': ['expenses',
                                                                             'bills',
                                                                             'goals',
                                                                             'journal',
                                                                             'calendar']}}},
                              'required': ['year']}}},
 {'type': 'function',
  'function': {'name': 'get_wellness_history',
               'description': "Retrieve the user's wellness history: reset/anchor session "
                              'completions, mood trends (pre vs post), durations, and streak data. '
                              "Use when the user asks 'how has my meditation been going', 'show my "
                              "reset history', 'compare my moods this week vs last', etc.",
               'parameters': {'type': 'object',
                              'properties': {'date_from': {'type': 'string',
                                                           'description': 'Start date '
                                                                          '(YYYY-MM-DD). Defaults '
                                                                          'to 30 days ago.'},
                                             'date_to': {'type': 'string',
                                                         'description': 'End date (YYYY-MM-DD). '
                                                                        'Defaults to today.'},
                                             'anchor_id': {'type': 'string',
                                                           'description': 'Optional: filter by a '
                                                                          'specific anchor/reset '
                                                                          'type.'},
                                             'include_streaks': {'type': 'boolean',
                                                                 'description': 'Also return '
                                                                                'streak stats. '
                                                                                'Defaults '
                                                                                'true.'}}}}},
 {'type': 'function',
  'function': {'name': 'compare_periods',
               'description': 'Compare data across two time periods for spending, wellness, '
                              "journal moods, or streaks. Use when the user asks things like 'how "
                              "did last month compare to this month', 'am I spending more than "
                              "before', 'has my mood improved', etc.",
               'parameters': {'type': 'object',
                              'properties': {'scope': {'type': 'string',
                                                       'enum': ['spending',
                                                                'wellness',
                                                                'journal_mood',
                                                                'streaks'],
                                                       'description': 'What to compare.'},
                                             'period_a_from': {'type': 'string',
                                                               'description': 'Start of period A '
                                                                              '(YYYY-MM-DD).'},
                                             'period_a_to': {'type': 'string',
                                                             'description': 'End of period A '
                                                                            '(YYYY-MM-DD).'},
                                             'period_b_from': {'type': 'string',
                                                               'description': 'Start of period B '
                                                                              '(YYYY-MM-DD).'},
                                             'period_b_to': {'type': 'string',
                                                             'description': 'End of period B '
                                                                            '(YYYY-MM-DD).'},
                                             'category': {'type': 'string',
                                                          'description': 'Optional: filter '
                                                                         'spending by category.'}},
                              'required': ['scope',
                                           'period_a_from',
                                           'period_a_to',
                                           'period_b_from',
                                           'period_b_to']}}},
 {'type': 'function',
  'function': {'name': 'cross_feature_search',
               'description': 'Search across multiple features at once: journal entries, notes, '
                              'transactions, events, lists, and goals. Use when the user asks a '
                              "broad question like 'what do I know about Edward', 'everything "
                              "related to Japan trip', 'find anything about groceries', etc.",
               'parameters': {'type': 'object',
                              'properties': {'query': {'type': 'string',
                                                       'description': 'The search term or phrase.'},
                                             'features': {'type': 'array',
                                                          'items': {'type': 'string',
                                                                    'enum': ['journal',
                                                                             'notes',
                                                                             'transactions',
                                                                             'events',
                                                                             'lists',
                                                                             'goals']},
                                                          'description': 'Which features to '
                                                                         'search. Defaults to '
                                                                         'all.'},
                                             'limit': {'type': 'integer',
                                                       'description': 'Max results per feature. '
                                                                      'Default 10.'}},
                              'required': ['query']}}}]
