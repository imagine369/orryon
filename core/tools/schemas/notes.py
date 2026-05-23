"""OpenAI-compatible tool schemas — notes domain."""
from __future__ import annotations

SCHEMAS: list[dict] = [{'type': 'function',
  'function': {'name': 'add_note',
               'description': 'Save a note, journal entry, idea, or memo. Supports Markdown '
                              'content, mood tracking, pinning, and linking to goals.',
               'parameters': {'type': 'object',
                              'properties': {'title': {'type': 'string',
                                                       'description': 'Short note title'},
                                             'content': {'type': 'string',
                                                         'description': 'Note body / content '
                                                                        '(Markdown supported)'},
                                             'tags': {'type': 'string',
                                                      'description': 'Comma-separated tags '
                                                                     '(optional)'},
                                             'mood': {'type': 'string',
                                                      'description': 'Mood for this entry: happy, '
                                                                     'grateful, motivated, '
                                                                     'neutral, stressed, anxious, '
                                                                     'reflective (optional)'},
                                             'is_pinned': {'type': 'boolean',
                                                           'description': 'Pin the note to the top '
                                                                          '(optional, default '
                                                                          'false)'},
                                             'linked_goal': {'type': 'string',
                                                             'description': 'Goal name to link '
                                                                            'this note to '
                                                                            '(optional)'}},
                              'required': ['title', 'content']}}},
 {'type': 'function',
  'function': {'name': 'delete_note',
               'description': 'Delete a note by its ID.',
               'parameters': {'type': 'object',
                              'properties': {'note_id': {'type': 'string',
                                                         'description': 'The ID of the note to '
                                                                        'delete'}},
                              'required': ['note_id']}}},
 {'type': 'function',
  'function': {'name': 'search_notes',
               'description': "Search through user's notes by keyword, tag, or mood. Returns "
                              'matching notes with previews.',
               'parameters': {'type': 'object',
                              'properties': {'query': {'type': 'string',
                                                       'description': 'Search keyword to match in '
                                                                      'title, content, or tags'},
                                             'tag': {'type': 'string',
                                                     'description': 'Filter by specific tag'},
                                             'mood': {'type': 'string',
                                                      'description': 'Filter by mood (happy, '
                                                                     'grateful, motivated, '
                                                                     'neutral, stressed, anxious, '
                                                                     'reflective)'}},
                              'required': []}}},
 {'type': 'function',
  'function': {'name': 'edit_note',
               'description': 'Edit an existing note — update title, content, tags, mood, or link '
                              'it to a goal.',
               'parameters': {'type': 'object',
                              'properties': {'note_id': {'type': 'string',
                                                         'description': 'The ID of the note to '
                                                                        'edit'},
                                             'title': {'type': 'string',
                                                       'description': 'New title'},
                                             'content': {'type': 'string',
                                                         'description': 'New content (Markdown '
                                                                        'supported)'},
                                             'tags': {'type': 'string',
                                                      'description': 'New comma-separated tags'},
                                             'mood': {'type': 'string',
                                                      'description': 'Mood (happy, grateful, '
                                                                     'motivated, neutral, '
                                                                     'stressed, anxious, '
                                                                     'reflective)'},
                                             'linked_goal': {'type': 'string',
                                                             'description': 'Goal name to link '
                                                                            'this note to'},
                                             'is_pinned': {'type': 'boolean',
                                                           'description': 'Pin or unpin the note'}},
                              'required': ['note_id']}}},
 {'type': 'function',
  'function': {'name': 'pin_note',
               'description': 'Pin or unpin a note so it stays at the top.',
               'parameters': {'type': 'object',
                              'properties': {'note_id': {'type': 'string',
                                                         'description': 'The ID of the note to '
                                                                        'pin/unpin'},
                                             'pin': {'type': 'boolean',
                                                     'description': 'True to pin, false to unpin. '
                                                                    'Defaults to true.'}},
                              'required': ['note_id']}}},
 {'type': 'function',
  'function': {'name': 'get_notes',
               'description': 'Retrieve plain notes (NOT journal entries — those use get_journal). '
                              'Supports text and tag filters.',
               'parameters': {'type': 'object',
                              'properties': {'search': {'type': 'string',
                                                        'description': 'Optional free-text query.'},
                                             'tag': {'type': 'string',
                                                     'description': 'Optional tag filter.'},
                                             'limit': {'type': 'integer',
                                                       'description': 'Max rows (default 20).'}}}}},
 {'type': 'function',
  'function': {'name': 'log_journal_entry',
               'description': 'Log a dated JOURNAL entry with mood. Use for feelings / reflections '
                              '/ mood-tagged content. For neutral reference notes, use add_note '
                              'instead.',
               'parameters': {'type': 'object',
                              'properties': {'date': {'type': 'string',
                                                      'description': 'ISO YYYY-MM-DD. Defaults to '
                                                                     'today.'},
                                             'content': {'type': 'string',
                                                         'description': 'The journal body.'},
                                             'title': {'type': 'string',
                                                       'description': 'Optional short title.'},
                                             'mood': {'type': 'string',
                                                      'enum': ['happy',
                                                               'grateful',
                                                               'motivated',
                                                               'neutral',
                                                               'stressed',
                                                               'anxious',
                                                               'reflective'],
                                                      'description': 'Canonical mood (required).'},
                                             'tags': {'type': 'string',
                                                      'description': 'Optional comma-separated '
                                                                     'tags.'}},
                              'required': ['content', 'mood']}}},
 {'type': 'function',
  'function': {'name': 'get_journal',
               'description': 'Retrieve journal entries (mood-tagged notes), optionally filtered '
                              'by ISO date range or specific mood.',
               'parameters': {'type': 'object',
                              'properties': {'date_range': {'type': 'object',
                                                            'properties': {'from': {'type': 'string'},
                                                                           'to': {'type': 'string'}}},
                                             'mood': {'type': 'string',
                                                      'enum': ['happy',
                                                               'grateful',
                                                               'motivated',
                                                               'neutral',
                                                               'stressed',
                                                               'anxious',
                                                               'reflective']},
                                             'limit': {'type': 'integer',
                                                       'description': 'Max rows (default 20).'}}}}},
 {'type': 'function',
  'function': {'name': 'edit_journal_entry',
               'description': 'Edit an existing JOURNAL entry (mood-tagged). Resolve entry_id via '
                              'get_journal first. Use edit_note for plain notes.',
               'parameters': {'type': 'object',
                              'properties': {'entry_id': {'type': 'string',
                                                          'description': 'ID of the journal entry '
                                                                         '(required).'},
                                             'title': {'type': 'string'},
                                             'content': {'type': 'string'},
                                             'mood': {'type': 'string',
                                                      'enum': ['happy',
                                                               'grateful',
                                                               'motivated',
                                                               'neutral',
                                                               'stressed',
                                                               'anxious',
                                                               'reflective']},
                                             'tags': {'type': 'string'}},
                              'required': ['entry_id']}}},
 {'type': 'function',
  'function': {'name': 'delete_journal_entry',
               'description': 'Delete a journal entry by ID. Resolve the ID via get_journal first. '
                              'Use delete_note for plain notes.',
               'parameters': {'type': 'object',
                              'properties': {'entry_id': {'type': 'string',
                                                          'description': 'ID of the journal entry '
                                                                         '(required).'}},
                              'required': ['entry_id']}}}]
