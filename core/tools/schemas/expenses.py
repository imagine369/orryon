"""OpenAI-compatible tool schemas — expenses domain."""
from __future__ import annotations

SCHEMAS: list[dict] = [{'type': 'function',
  'function': {'name': 'log_expense',
               'description': 'Log a past or today spending event (EXPENSES section). Use when the '
                              'user mentions having spent, bought, paid for, grabbed, or picked up '
                              'something. Do NOT use for future recurring charges — use log_bill '
                              'for those.',
               'parameters': {'type': 'object',
                              'properties': {'amount': {'type': 'number',
                                                        'description': 'Amount in USD (positive '
                                                                       'number)'},
                                             'merchant': {'type': 'string',
                                                          'description': 'Merchant name or short '
                                                                         'description'},
                                             'description': {'type': 'string',
                                                             'description': 'Short description of '
                                                                            'the purchase (alias: '
                                                                            'notes)'},
                                             'category': {'type': 'string',
                                                          'description': 'Canonical category. One '
                                                                         'of: Food & Dining, '
                                                                         'Groceries (monthly '
                                                                         'spending only — not the '
                                                                         'Grocery shopping list), '
                                                                         'Transport, '
                                                                         'Subscriptions, Health & '
                                                                         'Fitness, Shopping, Rent '
                                                                         '& Housing, Travel, '
                                                                         'Other.'},
                                             'date': {'type': 'string',
                                                      'description': 'ISO date YYYY-MM-DD. '
                                                                     'Defaults to today.'},
                                             'notes': {'type': 'string',
                                                       'description': 'Optional extra notes'}},
                              'required': ['amount', 'category']}}},
 {'type': 'function',
  'function': {'name': 'edit_expense',
               'description': "Edit/update an existing expense. Use when user says 'change that to "
                              "$55', 'recategorise that expense', 'fix that transaction'.",
               'parameters': {'type': 'object',
                              'properties': {'expense_id': {'type': 'string',
                                                            'description': 'The ID of the expense '
                                                                           'to edit'},
                                             'amount': {'type': 'number',
                                                        'description': 'New amount (optional)'},
                                             'merchant': {'type': 'string',
                                                          'description': 'New merchant name '
                                                                         '(optional)'},
                                             'category': {'type': 'string',
                                                          'description': 'New category (optional)'},
                                             'date': {'type': 'string',
                                                      'description': 'New date as YYYY-MM-DD '
                                                                     '(optional)'}},
                              'required': ['expense_id']}}},
 {'type': 'function',
  'function': {'name': 'split_expense',
               'description': "Split an expense with other people and log the user's share. Use "
                              "when user says 'split dinner with Kirk', 'split the $100 with 3 "
                              "people'.",
               'parameters': {'type': 'object',
                              'properties': {'amount': {'type': 'number',
                                                        'description': 'Full amount before split'},
                                             'merchant': {'type': 'string',
                                                          'description': 'Merchant or description'},
                                             'category': {'type': 'string',
                                                          'description': 'Expense category'},
                                             'split_with': {'type': 'string',
                                                            'description': 'Name(s) of people '
                                                                           'splitting with'},
                                             'split_count': {'type': 'integer',
                                                             'description': 'Total number of '
                                                                            'people including user '
                                                                            '(default 2)'},
                                             'date': {'type': 'string',
                                                      'description': 'Date as YYYY-MM-DD '
                                                                     '(optional)'}},
                              'required': ['amount', 'merchant', 'category']}}},
 {'type': 'function',
  'function': {'name': 'get_spending_patterns',
               'description': 'Analyse spending patterns and trends. Use when user asks about '
                              'habits, trends, weekday vs weekend spending, month-over-month '
                              'changes.',
               'parameters': {'type': 'object',
                              'properties': {'months': {'type': 'integer',
                                                        'description': 'Number of months to '
                                                                       'analyse (default 3)'}}}}},
 {'type': 'function',
  'function': {'name': 'search_transactions',
               'description': 'Search past transactions by keyword, date range, or category. Use '
                              "when user asks 'find my Sushi Agato expense', 'show all uber "
                              "rides', etc.",
               'parameters': {'type': 'object',
                              'properties': {'query': {'type': 'string',
                                                       'description': 'Search keyword (matches '
                                                                      'merchant, description)'},
                                             'date_from': {'type': 'string',
                                                           'description': 'Start date as '
                                                                          'YYYY-MM-DD (optional)'},
                                             'date_to': {'type': 'string',
                                                         'description': 'End date as YYYY-MM-DD '
                                                                        '(optional)'},
                                             'category': {'type': 'string',
                                                          'description': 'Filter by category '
                                                                         '(optional)'}},
                              'required': ['query']}}},
 {'type': 'function',
  'function': {'name': 'delete_expense',
               'description': "Delete/remove an expense by its ID. Use when user says 'undo that "
                              "expense', 'remove that', or 'delete the expense I just added'.",
               'parameters': {'type': 'object',
                              'properties': {'expense_id': {'type': 'string',
                                                            'description': 'The ID of the expense '
                                                                           'to delete'}},
                              'required': ['expense_id']}}},
 {'type': 'function',
  'function': {'name': 'get_expenses',
               'description': 'Retrieve logged expenses, optionally filtered by ISO date range, '
                              'category, or merchant/text search.',
               'parameters': {'type': 'object',
                              'properties': {'date_range': {'type': 'object',
                                                            'description': 'ISO date range filter.',
                                                            'properties': {'from': {'type': 'string'},
                                                                           'to': {'type': 'string'}}},
                                             'category': {'type': 'string',
                                                          'description': 'Optional canonical '
                                                                         'category.'},
                                             'search': {'type': 'string',
                                                        'description': 'Optional '
                                                                       'merchant/description '
                                                                       'text.'},
                                             'limit': {'type': 'integer',
                                                       'description': 'Max rows (default 50).'}}}}}]
