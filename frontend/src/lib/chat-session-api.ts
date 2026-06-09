/** API paths used by chat session hooks (testable without React). */
export function chatSessionsListPath(): string {
  return "/api/chat/sessions";
}

export function chatHistoryPath(sessionId: string, limit = 100): string {
  return `/api/chat/history?session_id=${encodeURIComponent(sessionId)}&limit=${limit}`;
}

export function chatSessionDeletePath(sessionId: string): string {
  return `/api/chat/sessions/${encodeURIComponent(sessionId)}`;
}
