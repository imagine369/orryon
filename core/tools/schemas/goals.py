"""OpenAI-compatible tool schemas — goals domain."""
from __future__ import annotations

SCHEMAS: list[dict] = [{'type': 'function',
  'function': {'name': 'create_goal',
               'description': 'Create a new savings or financial goal. Use when the user wants to '
                              'save for something specific (emergency fund, vacation, paying off '
                              'debt, buying a car, etc.).',
               'parameters': {'type': 'object',
                              'properties': {'name': {'type': 'string',
                                                      'description': 'Clear goal name, e.g. '
                                                                     "'Emergency Fund', 'Japan "
                                                                     "Vacation', 'Pay Off Credit "
                                                                     "Card'"},
                                             'target_amount': {'type': 'number',
                                                               'description': 'Total target amount '
                                                                              'in dollars'},
                                             'current_amount': {'type': 'number',
                                                                'description': 'How much has '
                                                                               'already been saved '
                                                                               'toward this goal '
                                                                               '(default 0)'},
                                             'target_date': {'type': 'string',
                                                             'description': 'Target completion '
                                                                            'date as YYYY-MM-DD '
                                                                            '(optional)'},
                                             'category': {'type': 'string',
                                                          'enum': ['emergency',
                                                                   'vacation',
                                                                   'house',
                                                                   'retirement',
                                                                   'education',
                                                                   'investment',
                                                                   'debt_payoff',
                                                                   'vehicle',
                                                                   'gadget',
                                                                   'wedding',
                                                                   'other'],
                                                          'description': 'Goal category type'},
                                             'linked_budget_category': {'type': 'string',
                                                                        'description': 'Optional '
                                                                                       'budget '
                                                                                       'category '
                                                                                       'to link '
                                                                                       'spending '
                                                                                       'awareness '
                                                                                       '(e.g. '
                                                                                       "'Dining', "
                                                                                       "'Savings')"},
                                             'notes': {'type': 'string',
                                                       'description': 'Optional motivation note or '
                                                                      'description'}},
                              'required': ['name', 'target_amount']}}},
 {'type': 'function',
  'function': {'name': 'update_goal',
               'description': "Update an existing goal's progress or fields (GOALS section). Use "
                              'when the user says they saved toward a goal, added a contribution, '
                              "or wants to change a goal's target/deadline. Pass the goal by "
                              '`name` (fuzzy-matched).',
               'parameters': {'type': 'object',
                              'properties': {'name': {'type': 'string',
                                                      'description': 'Goal name (partial match '
                                                                     'ok). Preferred.'},
                                             'goal_name': {'type': 'string',
                                                           'description': 'Alias for name '
                                                                          '(legacy).'},
                                             'progress_amount': {'type': 'number',
                                                                 'description': 'Amount to add, '
                                                                                'subtract, or '
                                                                                'set.'},
                                             'amount': {'type': 'number',
                                                        'description': 'Alias for progress_amount '
                                                                       '(legacy).'},
                                             'action': {'type': 'string',
                                                        'enum': ['add', 'subtract', 'set'],
                                                        'description': "'add' (default) "
                                                                       "increments, 'subtract' "
                                                                       "decrements, 'set' "
                                                                       'replaces.'},
                                             'target_amount': {'type': 'number',
                                                               'description': 'Optional: update '
                                                                              "the goal's total "
                                                                              'target.'},
                                             'deadline': {'type': 'string',
                                                          'description': 'Optional: update '
                                                                         'target_date as ISO '
                                                                         'YYYY-MM-DD.'},
                                             'status': {'type': 'string',
                                                        'enum': ['active',
                                                                 'paused',
                                                                 'achieved',
                                                                 'abandoned'],
                                                        'description': 'Optional: update goal '
                                                                       'status.'}},
                              'required': []}}},
 {'type': 'function',
  'function': {'name': 'get_goals',
               'description': 'Get all active savings goals with progress details, or look up a '
                              'specific goal by name.',
               'parameters': {'type': 'object',
                              'properties': {'goal_name': {'type': 'string',
                                                           'description': 'Optional: name of a '
                                                                          'specific goal to look '
                                                                          'up'},
                                             'include_completed': {'type': 'boolean',
                                                                   'description': 'Include '
                                                                                  'already-completed '
                                                                                  'goals (default '
                                                                                  'false)'}}}}},
 {'type': 'function',
  'function': {'name': 'delete_goal',
               'description': 'Delete a goal. Prefer goal_id (resolve via get_goals). If only the '
                              "name is known, pass it — the tool returns 'ambiguous' if multiple "
                              'goals match so you can ask the user which one.',
               'parameters': {'type': 'object',
                              'properties': {'goal_id': {'type': 'string',
                                                         'description': 'Preferred: exact goal '
                                                                        'ID.'},
                                             'name': {'type': 'string',
                                                      'description': 'Alternative: goal name '
                                                                     '(partial match ok).'}}}}}]
