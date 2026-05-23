"""OpenAI-compatible tool schemas — bills domain."""
from __future__ import annotations

SCHEMAS: list[dict] = [{'type': 'function',
  'function': {'name': 'log_bill',
               'description': 'Log a recurring or scheduled FUTURE bill with a due date (BILLS '
                              'section). Use for rent, utilities, subscriptions, mortgage, etc. '
                              'Never use for past payments — a past payment is an expense '
                              '(log_expense).',
               'parameters': {'type': 'object',
                              'properties': {'name': {'type': 'string',
                                                      'description': 'Bill or subscription name'},
                                             'amount': {'type': 'number',
                                                        'description': 'Amount per cycle in USD'},
                                             'frequency': {'type': 'string',
                                                           'enum': ['weekly',
                                                                    'bi-weekly',
                                                                    'monthly',
                                                                    'yearly'],
                                                           'description': 'How often it recurs'},
                                             'due_date': {'type': 'string',
                                                          'description': 'Next due date as ISO '
                                                                         'YYYY-MM-DD (preferred).'},
                                             'due_day': {'type': 'integer',
                                                         'description': 'Alternative: day of month '
                                                                        '1–31 (monthly bills '
                                                                        'only).'},
                                             'category': {'type': 'string',
                                                          'description': 'Category (e.g. Rent & '
                                                                         'Housing, '
                                                                         'Subscriptions)'}},
                              'required': ['name', 'amount', 'frequency']}}},
 {'type': 'function',
  'function': {'name': 'delete_bill',
               'description': 'Cancel/delete a recurring bill or subscription by its ID.',
               'parameters': {'type': 'object',
                              'properties': {'bill_id': {'type': 'string',
                                                         'description': 'The ID of the bill to '
                                                                        'cancel'}},
                              'required': ['bill_id']}}},
 {'type': 'function',
  'function': {'name': 'get_bills',
               'description': 'Retrieve recurring bills / subscriptions, optionally filtered by '
                              "ISO date range. Use for any 'what bills are coming up / this month "
                              "/ next 2 weeks' question.",
               'parameters': {'type': 'object',
                              'properties': {'date_range': {'type': 'object',
                                                            'description': 'ISO date range filter '
                                                                           'on next due date.',
                                                            'properties': {'from': {'type': 'string',
                                                                                    'description': 'ISO '
                                                                                                   'YYYY-MM-DD'},
                                                                           'to': {'type': 'string',
                                                                                  'description': 'ISO '
                                                                                                 'YYYY-MM-DD'}}},
                                             'category': {'type': 'string',
                                                          'description': 'Optional category '
                                                                         'filter.'},
                                             'status': {'type': 'string',
                                                        'enum': ['active', 'inactive', 'all'],
                                                        'description': 'Default: active.'}}}}},
 {'type': 'function',
  'function': {'name': 'edit_bill',
               'description': "Edit an existing bill / subscription's fields. Resolve the bill_id "
                              'first via get_bills if you only have a name. Only send the fields '
                              'that actually change.',
               'parameters': {'type': 'object',
                              'properties': {'bill_id': {'type': 'string',
                                                         'description': 'ID of the bill '
                                                                        '(required).'},
                                             'name': {'type': 'string'},
                                             'amount': {'type': 'number'},
                                             'frequency': {'type': 'string',
                                                           'enum': ['weekly',
                                                                    'bi-weekly',
                                                                    'monthly',
                                                                    'yearly']},
                                             'due_date': {'type': 'string',
                                                          'description': 'ISO YYYY-MM-DD for the '
                                                                         'next due date.'},
                                             'category': {'type': 'string'},
                                             'is_active': {'type': 'boolean',
                                                           'description': 'Set false to pause the '
                                                                          'bill.'}},
                              'required': ['bill_id']}}}]
