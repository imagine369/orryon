"""OpenAI-compatible tool schemas — calendar domain."""
from __future__ import annotations

SCHEMAS: list[dict] = [{'type': 'function',
  'function': {'name': 'add_calendar_event',
               'description': 'Add a time-bound event to the calendar (CALENDAR section). Use for '
                              'meetings, appointments, dinners, errands at a specific time. If '
                              'only a deadline (no time) was given, ask the user whether they want '
                              'it on the calendar.',
               'parameters': {'type': 'object',
                              'properties': {'title': {'type': 'string',
                                                       'description': 'Short event title'},
                                             'start': {'type': 'string',
                                                       'description': 'ISO start datetime '
                                                                      'YYYY-MM-DDTHH:MM:SS '
                                                                      '(preferred).'},
                                             'end': {'type': 'string',
                                                     'description': 'ISO end datetime '
                                                                    'YYYY-MM-DDTHH:MM:SS '
                                                                    '(optional).'},
                                             'date': {'type': 'string',
                                                      'description': 'Legacy alternative: date '
                                                                     'only YYYY-MM-DD.'},
                                             'time': {'type': 'string',
                                                      'description': 'Legacy alternative: HH:MM '
                                                                     '24h. Omit for all-day.'},
                                             'all_day': {'type': 'boolean',
                                                         'description': 'Set true for all-day '
                                                                        'events (default false).'},
                                             'description': {'type': 'string',
                                                             'description': 'Optional details'},
                                             'event_type': {'type': 'string',
                                                            'enum': ['event',
                                                                     'reminder',
                                                                     'errand',
                                                                     'bill_due',
                                                                     'task'],
                                                            'description': 'Type of event'},
                                             'reminder_minutes': {'type': 'integer',
                                                                  'enum': [0,
                                                                           10,
                                                                           30,
                                                                           60,
                                                                           360,
                                                                           1440],
                                                                  'description': 'Email reminder: '
                                                                                 '0=none, '
                                                                                 '10=10min, '
                                                                                 '30=30min '
                                                                                 '(default), '
                                                                                 '60=1hr, 360=6hr, '
                                                                                 '1440=1day '
                                                                                 'before'}},
                              'required': ['title']}}},
 {'type': 'function',
  'function': {'name': 'add_task',
               'description': 'Add a to-do item, task, or action item.',
               'parameters': {'type': 'object',
                              'properties': {'title': {'type': 'string',
                                                       'description': 'Task description'},
                                             'due_date': {'type': 'string',
                                                          'description': 'Due date as YYYY-MM-DD '
                                                                         '(optional)'},
                                             'priority': {'type': 'string',
                                                          'enum': ['high', 'medium', 'low'],
                                                          'description': 'Priority level'},
                                             'category': {'type': 'string',
                                                          'description': 'Category: work, '
                                                                         'personal, finance, '
                                                                         'health, etc.'}},
                              'required': ['title']}}},
 {'type': 'function',
  'function': {'name': 'complete_task',
               'description': 'Mark a task or to-do item as completed.',
               'parameters': {'type': 'object',
                              'properties': {'task_title': {'type': 'string',
                                                            'description': 'Title or description '
                                                                           'of the task to '
                                                                           'complete'}},
                              'required': ['task_title']}}},
 {'type': 'function',
  'function': {'name': 'get_calendar',
               'description': 'Get upcoming events, bills, and tasks (CALENDAR section). Use for '
                              "any 'what's on my calendar / schedule / coming up' question.",
               'parameters': {'type': 'object',
                              'properties': {'days': {'type': 'integer',
                                                      'description': 'Days ahead from today '
                                                                     '(default: 14). Ignored if '
                                                                     'date_range provided.'},
                                             'date_range': {'type': 'object',
                                                            'description': 'Explicit ISO date '
                                                                           'range. Preferred over '
                                                                           '`days`.',
                                                            'properties': {'from': {'type': 'string',
                                                                                    'description': 'ISO '
                                                                                                   'YYYY-MM-DD '
                                                                                                   'start'},
                                                                           'to': {'type': 'string',
                                                                                  'description': 'ISO '
                                                                                                 'YYYY-MM-DD '
                                                                                                 'end'}}}}}}},
 {'type': 'function',
  'function': {'name': 'edit_event',
               'description': "Edit/update a calendar event. Use when user says 'move that to "
                              "3pm', 'rename that event', 'change the meeting time'.",
               'parameters': {'type': 'object',
                              'properties': {'event_id': {'type': 'string',
                                                          'description': 'The ID of the event to '
                                                                         'edit'},
                                             'title': {'type': 'string',
                                                       'description': 'New title (optional)'},
                                             'date': {'type': 'string',
                                                      'description': 'New date as YYYY-MM-DD '
                                                                     '(optional)'},
                                             'time': {'type': 'string',
                                                      'description': 'New time as HH:MM '
                                                                     '(optional)'},
                                             'description': {'type': 'string',
                                                             'description': 'New description '
                                                                            '(optional)'}},
                              'required': ['event_id']}}},
 {'type': 'function',
  'function': {'name': 'edit_task',
               'description': "Edit/update a task. Use when user says 'change that task', 'move "
                              "the due date', 'make that high priority'.",
               'parameters': {'type': 'object',
                              'properties': {'task_id': {'type': 'string',
                                                         'description': 'The ID of the task to '
                                                                        'edit'},
                                             'title': {'type': 'string',
                                                       'description': 'New title (optional)'},
                                             'due_date': {'type': 'string',
                                                          'description': 'New due date as '
                                                                         'YYYY-MM-DD (optional)'},
                                             'priority': {'type': 'string',
                                                          'enum': ['high', 'medium', 'low'],
                                                          'description': 'New priority '
                                                                         '(optional)'}},
                              'required': ['task_id']}}},
 {'type': 'function',
  'function': {'name': 'delete_event',
               'description': 'Delete/remove a calendar event by its ID. Use when user says '
                              "'remove that event' or 'cancel that appointment'.",
               'parameters': {'type': 'object',
                              'properties': {'event_id': {'type': 'string',
                                                          'description': 'The ID of the event to '
                                                                         'delete'}},
                              'required': ['event_id']}}},
 {'type': 'function',
  'function': {'name': 'get_emails',
               'description': "Read the user's Gmail inbox. Use when the user asks about their "
                              "email — 'do I have any emails from my doctor?', 'did I get a "
                              "reply from John?', 'any emails about my package?', 'what's in "
                              "my inbox?', 'did I get an email about my prescription?'. "
                              "Only call this tool when the user explicitly asks about email. "
                              "Returns subject, sender, date, and a short snippet (preview). "
                              "After answering, always offer a link to open Gmail.",
               'parameters': {'type': 'object',
                              'properties': {'query': {'type': 'string',
                                                       'description': 'Optional search — e.g. '
                                                                      '"from:doctor", '
                                                                      '"prescription", '
                                                                      '"subject:appointment". '
                                                                      'Leave empty to fetch '
                                                                      'recent inbox.'},
                                             'max_results': {'type': 'integer',
                                                             'description': 'Max emails to fetch '
                                                                            '(default 10, max 25)'}}}}},
 {'type': 'function',
  'function': {'name': 'get_video_calls',
               'description': "Get upcoming calendar events that have a video call join link "
                              "(Zoom, Google Meet, Teams, Webex, etc.). Use when the user asks "
                              "'do I have any calls today?', 'what's my Zoom link?', "
                              "'when's my next meeting?', or any question about joining a call.",
               'parameters': {'type': 'object',
                              'properties': {'days': {'type': 'integer',
                                                      'description': 'How many days ahead to look '
                                                                     '(default 7, max 30).'}}}}},
 {'type': 'function',
  'function': {'name': 'delete_task',
               'description': "Delete/remove a task by its ID. Use when user says 'remove that "
                              "task' or 'delete the task I just added'.",
               'parameters': {'type': 'object',
                              'properties': {'task_id': {'type': 'string',
                                                         'description': 'The ID of the task to '
                                                                        'delete'}},
                              'required': ['task_id']}}}]
