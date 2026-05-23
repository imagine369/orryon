"""OpenAI-compatible tool schemas — balance domain."""
from __future__ import annotations

SCHEMAS: list[dict] = [{'type': 'function',
  'function': {'name': 'set_budget',
               'description': 'Set or update the monthly spending budget for a category.',
               'parameters': {'type': 'object',
                              'properties': {'category': {'type': 'string',
                                                          'description': 'Budget category name'},
                                             'amount': {'type': 'number',
                                                        'description': 'Monthly budget amount in '
                                                                       'USD'},
                                             'month': {'type': 'string',
                                                       'description': 'Month as YYYY-MM. Defaults '
                                                                      'to current month.'},
                                             'rollover': {'type': 'boolean',
                                                          'description': 'If true, unspent budget '
                                                                         'carries over to next '
                                                                         'month. Default false.'}},
                              'required': ['category', 'amount']}}},
 {'type': 'function',
  'function': {'name': 'get_spending_summary',
               'description': 'Get a spending summary for a time period, optionally filtered by '
                              'category.',
               'parameters': {'type': 'object',
                              'properties': {'period': {'type': 'string',
                                                        'enum': ['today',
                                                                 'this_week',
                                                                 'this_month',
                                                                 'last_month',
                                                                 'last_7_days',
                                                                 'last_30_days'],
                                                        'description': 'Time period for the '
                                                                       'summary'},
                                             'category': {'type': 'string',
                                                          'description': 'Optional: filter by a '
                                                                         'specific category'}},
                              'required': ['period']}}},
 {'type': 'function',
  'function': {'name': 'get_net_worth',
               'description': "Get the user's current net worth — total assets minus liabilities.",
               'parameters': {'type': 'object', 'properties': {}}}},
 {'type': 'function',
  'function': {'name': 'set_balance',
               'description': "Set the user's balance to a specific amount. Use when the user says "
                              "'I have $3000', 'my balance is $3000', or 'set my balance to "
                              "$3000'.",
               'parameters': {'type': 'object',
                              'properties': {'amount': {'type': 'number',
                                                        'description': 'The exact balance amount '
                                                                       'in USD'}},
                              'required': ['amount']}}},
 {'type': 'function',
  'function': {'name': 'add_money',
               'description': "Add money to the user's balance. Use when the user says they got "
                              'paid, received money, want to deposit, or add funds. This logs an '
                              'income transaction AND increases the balance.',
               'parameters': {'type': 'object',
                              'properties': {'amount': {'type': 'number',
                                                        'description': 'Amount to add in USD'},
                                             'description': {'type': 'string',
                                                             'description': 'Source description '
                                                                            "(e.g. 'Paycheck', "
                                                                            "'Freelance payment', "
                                                                            "'Gift')"},
                                             'date': {'type': 'string',
                                                      'description': 'Date as YYYY-MM-DD. Defaults '
                                                                     'to today.'}},
                              'required': ['amount']}}},
 {'type': 'function',
  'function': {'name': 'get_balance',
               'description': "Get the user's current balance — how much money they have.",
               'parameters': {'type': 'object', 'properties': {}}}},
 {'type': 'function',
  'function': {'name': 'get_budget_status',
               'description': 'Get current spending vs budget for all categories this month.',
               'parameters': {'type': 'object',
                              'properties': {'month': {'type': 'string',
                                                       'description': 'Month as YYYY-MM. Defaults '
                                                                      'to current month.'},
                                             'category': {'type': 'string',
                                                          'description': 'Optional: specific '
                                                                         'category only'}}}}},
 {'type': 'function',
  'function': {'name': 'get_spending_recap',
               'description': 'Generate a natural-language spending recap for a time period. Use '
                              'when the user asks for a summary, recap, or review of their '
                              'spending. Returns total spent, top categories, comparison to prior '
                              'period, goal impact, and a positive insight.',
               'parameters': {'type': 'object',
                              'properties': {'period': {'type': 'string',
                                                        'enum': ['this_week',
                                                                 'last_week',
                                                                 'this_month',
                                                                 'last_month'],
                                                        'description': 'Time period for the '
                                                                       'recap'}},
                              'required': ['period']}}},
 {'type': 'function',
  'function': {'name': 'add_custom_category',
               'description': "Create a new custom budget category. Use when the user says 'create "
                              "a category', 'add a category called X', or mentions a spending area "
                              "that doesn't fit existing categories.",
               'parameters': {'type': 'object',
                              'properties': {'name': {'type': 'string',
                                                      'description': "Category name (e.g. 'Date "
                                                                     "Night', 'Pet Care', 'Side "
                                                                     "Hustle')"},
                                             'icon': {'type': 'string',
                                                      'description': 'Single emoji icon for the '
                                                                     "category (e.g. '🌹', '🐶', "
                                                                     "'💼')"},
                                             'color': {'type': 'string',
                                                       'description': 'Hex color for the category '
                                                                      "badge (e.g. '#f43f5e'). "
                                                                      'Optional.'}},
                              'required': ['name']}}},
 {'type': 'function',
  'function': {'name': 'get_money_left_after_goals',
               'description': 'Calculate and return how much money the user has left to spend '
                              'freely this month after accounting for estimated income, recurring '
                              "bills, and monthly goal contributions. Use when the user asks 'how "
                              "much can I spend freely?', 'money left after goals', or similar.",
               'parameters': {'type': 'object',
                              'properties': {'month': {'type': 'string',
                                                       'description': 'Month as YYYY-MM. Defaults '
                                                                      'to current month.'}}}}},
 {'type': 'function',
  'function': {'name': 'set_notification_preferences',
               'description': "Update the user's notification settings: default reminder time for "
                              'new events, daily digest on/off, or daily digest time. Use when the '
                              "user says things like 'set my default reminder to 1 hour', 'turn "
                              "off daily digest', 'send my morning summary at 7am', etc.",
               'parameters': {'type': 'object',
                              'properties': {'default_reminder_minutes': {'type': 'integer',
                                                                          'enum': [0,
                                                                                   10,
                                                                                   30,
                                                                                   60,
                                                                                   360,
                                                                                   1440],
                                                                          'description': 'Default '
                                                                                         'reminder '
                                                                                         'for new '
                                                                                         'events: '
                                                                                         '0=none, '
                                                                                         '10/30/60/360/1440 '
                                                                                         'minutes '
                                                                                         'before'},
                                             'daily_digest_enabled': {'type': 'boolean',
                                                                      'description': 'Enable or '
                                                                                     'disable the '
                                                                                     'daily '
                                                                                     'morning '
                                                                                     'digest '
                                                                                     'email'},
                                             'daily_digest_time': {'type': 'string',
                                                                   'description': 'Time to send '
                                                                                  'daily digest as '
                                                                                  'HH:MM (24h), '
                                                                                  "e.g. '08:00', "
                                                                                  "'07:30'"}}}}},
 {'type': 'function',
  'function': {'name': 'add_recurring_income',
               'description': 'Track a recurring income source (salary, freelance, dividends, '
                              'etc). Use when user mentions their income, salary, or earnings.',
               'parameters': {'type': 'object',
                              'properties': {'name': {'type': 'string',
                                                      'description': 'Income source name (e.g. '
                                                                     "'Salary', 'Freelance "
                                                                     "Design')"},
                                             'amount': {'type': 'number',
                                                        'description': 'Amount per period in USD'},
                                             'frequency': {'type': 'string',
                                                           'enum': ['monthly',
                                                                    'weekly',
                                                                    'biweekly',
                                                                    'yearly'],
                                                           'description': 'How often this income '
                                                                          'is received'},
                                             'source': {'type': 'string',
                                                        'description': 'Source description (e.g. '
                                                                       "'Employer', 'Side gig')"}},
                              'required': ['name', 'amount']}}}]
