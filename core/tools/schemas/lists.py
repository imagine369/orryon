"""OpenAI-compatible tool schemas — lists domain."""
from __future__ import annotations

SCHEMAS: list[dict] = [{'type': 'function',
  'function': {'name': 'add_grocery_items',
               'description': 'Add one or more items to the grocery/shopping list.',
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
  'function': {'name': 'check_grocery_item',
               'description': 'Mark a grocery list item as checked/bought.',
               'parameters': {'type': 'object',
                              'properties': {'item_name': {'type': 'string',
                                                           'description': 'Name of the item to '
                                                                          'mark as bought'}},
                              'required': ['item_name']}}},
 {'type': 'function',
  'function': {'name': 'get_grocery_list',
               'description': "Retrieve the user's current grocery/shopping list — all unchecked "
                              'items.',
               'parameters': {'type': 'object', 'properties': {}}}},
 {'type': 'function',
  'function': {'name': 'create_list',
               'description': 'Create a new named list, optionally pre-populated with items. Use '
                              'when the user wants to create any kind of list (grocery list, '
                              'packing list, to-do list, bucket list, shopping list, etc). ALWAYS '
                              'include initial items here if the user mentions them — do NOT call '
                              'add_list_items separately in the same turn.',
               'parameters': {'type': 'object',
                              'properties': {'name': {'type': 'string',
                                                      'description': 'Name for the list (e.g. '
                                                                     "'Grocery', 'Packing List', "
                                                                     "'Books to Read')"},
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
               'description': 'Add one or more items to an existing user list. Requires the '
                              'list_id from create_list or get_user_lists.',
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
               'description': "Get all of the user's lists with their IDs, names, and item counts. "
                              'Use to find a list_id before adding items to an existing list.',
               'parameters': {'type': 'object', 'properties': {}}}},
 {'type': 'function',
  'function': {'name': 'delete_list',
               'description': 'Delete an entire user list AND all of its items. Resolve list_id '
                              'via get_user_lists first. Irreversible — confirm in prose.',
               'parameters': {'type': 'object',
                              'properties': {'list_id': {'type': 'string',
                                                         'description': 'ID of the list '
                                                                        '(required).'}},
                              'required': ['list_id']}}}]
