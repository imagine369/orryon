"""OpenAI-compatible tool schemas — lists domain."""
from __future__ import annotations

SCHEMAS: list[dict] = [{'type': 'function',
  'function': {'name': 'add_grocery_items',
               'description': 'Add items to the user\'s built-in Grocery list (the ONLY grocery '
                              'list — same list shown in the Lists tab). ALWAYS use this when the '
                              'user wants items on their shopping list. Never create_list, '
                              'add_list_items, or log_expense / budget tools for this intent. '
                              '("Groceries" is a separate spending category for how much they '
                              'spent, not the shopping list.)',
               'parameters': {'type': 'object',
                              'properties': {'items': {'type': 'array',
                                                       'description': 'List of grocery items to '
                                                                      'add',
                                                       'items': {'type': 'object',
                                                                 'properties': {'name': {'type': 'string',
                                                                                         'description': 'Item '
                                                                                                        'name'},
                                                                                'quantity': {'type': 'string',
                                                                                             'description': 'e.g. '
                                                                                                            "'2', "
                                                                                                            "'1 "
                                                                                                            "lb', "
                                                                                                            "'6 "
                                                                                                            "pack'"},
                                                                                'estimated_price': {'type': 'number',
                                                                                                    'description': 'Estimated '
                                                                                                                   'price '
                                                                                                                   'in '
                                                                                                                   'USD'}},
                                                                 'required': ['name']}}},
                              'required': ['items']}}},
 {'type': 'function',
  'function': {'name': 'delete_grocery_items',
               'description': 'Remove items from the built-in Grocery shopping list. Use when '
                              'the user wants to delete or remove grocery list items. Never '
                              'log_expense, delete_expense, or budget tools for this — those are '
                              'for spending, not the shopping list.',
               'parameters': {'type': 'object',
                              'properties': {'item_names': {'type': 'array',
                                                            'description': 'Item names to remove '
                                                                           '(partial match OK)',
                                                            'items': {'type': 'string'}}},
                              'required': ['item_names']}}},
 {'type': 'function',
  'function': {'name': 'check_grocery_item',
               'description': 'Mark a grocery list item as checked/bought on the shopping list. '
                              'Not log_expense — only use log_expense when they report money spent.',
               'parameters': {'type': 'object',
                              'properties': {'item_name': {'type': 'string',
                                                           'description': 'Name of the item to '
                                                                          'mark as bought'}},
                              'required': ['item_name']}}},
 {'type': 'function',
  'function': {'name': 'get_grocery_list',
               'description': "Read the built-in Grocery list (unchecked items). Prefer this over "
                              'get_user_lists when the user asks what is on their grocery list.',
               'parameters': {'type': 'object', 'properties': {}}}},
 {'type': 'function',
  'function': {'name': 'create_list',
               'description': 'Create a new custom list (packing, books, chores, etc). NEVER use '
                              'for grocery/food shopping — the app has one built-in Grocery list; '
                              'use add_grocery_items instead. Include initial items here when '
                              'mentioned — do NOT call add_list_items separately in the same turn.',
               'parameters': {'type': 'object',
                              'properties': {'name': {'type': 'string',
                                                      'description': 'Name for the list (e.g. '
                                                                     "'Packing List', "
                                                                     "'Books to Read'). "
                                                                     "Not Grocery."},
                                             'color': {'type': 'string',
                                                       'description': 'Hex color for the list. '
                                                                      'Pick one that fits the '
                                                                      'theme: #ef4444 red, #f97316 '
                                                                      'orange, #eab308 yellow, '
                                                                      '#22c55e green, #3b82f6 '
                                                                      'blue, #a855f7 purple, '
                                                                      '#ec4899 pink, #ffffff '
                                                                      'white'},
                                             'items': {'type': 'array',
                                                       'items': {'type': 'string'},
                                                       'description': 'Optional initial items to '
                                                                      'add to the list right '
                                                                      'away'}},
                              'required': ['name']}}},
 {'type': 'function',
  'function': {'name': 'add_list_items',
               'description': 'Add items to a custom user list (not grocery). Requires list_id '
                              'from create_list or get_user_lists. For grocery/food items use '
                              'add_grocery_items instead.',
               'parameters': {'type': 'object',
                              'properties': {'list_id': {'type': 'string',
                                                         'description': 'ID of the list to add '
                                                                        'items to'},
                                             'items': {'type': 'array',
                                                       'description': 'Item names to add to the '
                                                                      'list',
                                                       'items': {'type': 'string'}}},
                              'required': ['list_id', 'items']}}},
 {'type': 'function',
  'function': {'name': 'get_user_lists',
               'description': "Get custom lists plus the built-in Grocery list (grocery_list_id). "
                              'For grocery contents use get_grocery_list; for grocery items use '
                              'add_grocery_items.',
               'parameters': {'type': 'object', 'properties': {}}}},
 {'type': 'function',
  'function': {'name': 'delete_list',
               'description': 'Delete an entire user list AND all of its items. Resolve list_id '
                              'via get_user_lists first. Cannot delete the built-in Grocery list '
                              '(use delete_grocery_items to remove items). Irreversible — confirm '
                              'in prose.',
               'parameters': {'type': 'object',
                              'properties': {'list_id': {'type': 'string',
                                                         'description': 'ID of the list '
                                                                        '(required).'}},
                              'required': ['list_id']}}}]
