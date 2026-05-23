"""OpenAI-compatible tool schemas — world domain."""
from __future__ import annotations

SCHEMAS: list[dict] = [{'type': 'function',
  'function': {'name': 'get_weather',
               'description': 'Get live weather for a city or place. Use when the user asks about '
                              'weather today, temperature, rain, or what to wear. Pulls current '
                              "conditions and today's high/low.",
               'parameters': {'type': 'object',
                              'properties': {'location': {'type': 'string',
                                                          'description': 'City, neighborhood, or '
                                                                         "place name, e.g. 'San "
                                                                         "Francisco' or 'Seattle'. "
                                                                         'If omitted, uses the '
                                                                         "user's saved Home "
                                                                         'address when '
                                                                         'configured.'}}}}},
 {'type': 'function',
  'function': {'name': 'search_web',
               'description': 'Search live news and current events on the web. Use when the user '
                              'asks what is in the news today, top headlines, breaking news, what '
                              'is happening in the world, or recent developments on a topic. '
                              'Returns headline titles, sources, and links. Omit query for general '
                              'top headlines; include query for a specific topic.',
               'parameters': {'type': 'object',
                              'properties': {'query': {'type': 'string',
                                                       'description': 'Optional search topic, e.g. '
                                                                      "'US politics', 'AI', or "
                                                                      "'Ukraine'. Omit for general "
                                                                      'top headlines.'},
                                             'limit': {'type': 'integer',
                                                       'description': 'Max headlines to return '
                                                                      '(default 8, max 12).'}}}}}]
