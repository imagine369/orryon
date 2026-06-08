import {
  clearToken,
  clientHeaders,
  getApiBase,
  getCsrfToken,
  getLegacyToken,
  hasAuthSignal,
  hasToken,
  isDemoMode,
} from "@/lib/api-client";

export interface PlanLimitDetail {
  code: "chat_limit_reached" | "usage_limit_reached";
  message: string;
  plan?: string;
  upgrade_plan?: string | null;
  messages_used?: number;
  limit?: number;
  spend_usd?: number;
  cap_usd?: number;
  kind?: string;
}

export interface ChatEvent {
  type:
    | "token"
    | "tool"
    | "done"
    | "error"
    | "session"
    | "retry"
    | "confirm_required";
  content?: string;
  name?: string;
  label?: string;
  message?: string;
  action?: string;
  args?: Record<string, unknown>;
  actions?: unknown[];
  tabs?: string[];
  undo_info?: { table: string; id: string; tool: string; label: string } | null;
  session_id?: string;
  voice_overlay?: boolean;
  limit?: PlanLimitDetail;
}

export class PlanLimitError extends Error {
  status: number;
  detail: PlanLimitDetail;

  constructor(status: number, detail: PlanLimitDetail) {
    super(detail.message || "Plan limit reached");
    this.name = "PlanLimitError";
    this.status = status;
    this.detail = detail;
  }
}

async function parseLimitResponse(res: Response): Promise<PlanLimitDetail | null> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (
      detail &&
      typeof detail === "object" &&
      (detail.code === "chat_limit_reached" || detail.code === "usage_limit_reached")
    ) {
      return detail as PlanLimitDetail;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function warmConnection(): void {
  if (!hasAuthSignal() && !getLegacyToken()) return;
  fetch(`${getApiBase()}/api/chat/warm`, {
    headers: clientHeaders(),
    credentials: "same-origin",
  }).catch(() => {});
}

export async function* streamChat(
  message: string,
  sessionId?: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const legacyToken = getLegacyToken();
  const csrf = getCsrfToken();
  const bodyStr = JSON.stringify({ message, session_id: sessionId || "" });
  const { signRequest, invalidateSigningKey } = await import("@/lib/signing");
  const sigHeaders = await signRequest("POST", "/api/chat", bodyStr);
  const res = await fetch(`${getApiBase()}/api/chat`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...clientHeaders(),
      ...(legacyToken ? { Authorization: `Bearer ${legacyToken}` } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...sigHeaders,
    },
    body: bodyStr,
    signal,
  });

  if (res.status === 401) {
    if (isDemoMode()) {
      yield { type: "error", message: "Chat isn't available in the demo." };
      return;
    }
    clearToken();
    invalidateSigningKey();
    yield { type: "error", message: "Session expired — please log in again." };
    return;
  }

  if (res.status === 402 || res.status === 429) {
    const limit = await parseLimitResponse(res);
    if (limit) {
      throw new PlanLimitError(res.status, limit);
    }
  }

  if (!res.ok || !res.body) {
    const limit = await parseLimitResponse(res);
    if (limit) {
      throw new PlanLimitError(res.status, limit);
    }
    yield { type: "error", message: "Connection failed" };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          yield JSON.parse(data) as ChatEvent;
        } catch {
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

let _chatWs: WebSocket | null = null;
let _wsConnected = false;
let _wsConnecting = false;

async function fetchWsTicket(): Promise<string | null> {
  try {
    const legacyToken = getLegacyToken();
    const csrf = getCsrfToken();
    const res = await fetch(`${getApiBase()}/api/chat/ws-ticket`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        ...clientHeaders(),
        ...(legacyToken ? { Authorization: `Bearer ${legacyToken}` } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ticket?: string };
    return data.ticket || null;
  } catch {
    return null;
  }
}

export async function connectChatWs(): Promise<void> {
  if (_wsConnected || _wsConnecting) return;
  if (!hasAuthSignal() && !hasToken()) return;
  const publicUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!publicUrl) return;

  _wsConnecting = true;
  const ticket = await fetchWsTicket();
  if (!ticket) {
    _wsConnecting = false;
    return;
  }
  const wsBase = publicUrl.replace(/^http/, "ws");
  const ws = new WebSocket(`${wsBase}/ws/chat?ticket=${encodeURIComponent(ticket)}`);

  ws.onopen = () => {
    _chatWs = ws;
    _wsConnected = true;
    _wsConnecting = false;
  };
  ws.onclose = () => {
    _chatWs = null;
    _wsConnected = false;
    _wsConnecting = false;
  };
  ws.onerror = () => {
    _chatWs = null;
    _wsConnected = false;
    _wsConnecting = false;
  };
}

export function disconnectChatWs(): void {
  if (_chatWs) {
    _chatWs.close();
    _chatWs = null;
    _wsConnected = false;
  }
}

export async function* streamChatAuto(
  message: string,
  sessionId?: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  if (_chatWs && _wsConnected) {
    try {
      yield* _streamViaWs(_chatWs, message, sessionId, signal);
      return;
    } catch {
      _chatWs = null;
      _wsConnected = false;
    }
  }
  yield* streamChat(message, sessionId, signal);
}

async function* _streamViaWs(
  ws: WebSocket,
  message: string,
  sessionId?: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  ws.send(JSON.stringify({ message, session_id: sessionId || "" }));

  const queue: ChatEvent[] = [];
  let resolve: (() => void) | null = null;
  let finished = false;

  const onMessage = (ev: MessageEvent) => {
    try {
      const event = JSON.parse(ev.data) as ChatEvent;
      queue.push(event);
      if (event.type === "done" || event.type === "error") finished = true;
    } catch {
      /* ignore malformed frames */
    }
    resolve?.();
  };

  const onClose = () => {
    finished = true;
    resolve?.();
  };
  const onAbort = () => {
    finished = true;
    resolve?.();
  };

  ws.addEventListener("message", onMessage);
  ws.addEventListener("close", onClose);
  signal?.addEventListener("abort", onAbort);

  try {
    while (true) {
      while (queue.length > 0) {
        const event = queue.shift()!;
        yield event;
        if (event.type === "done") return;
        if (event.type === "error") return;
      }
      if (finished) return;
      await new Promise<void>((r) => {
        resolve = r;
      });
      resolve = null;
    }
  } finally {
    ws.removeEventListener("message", onMessage);
    ws.removeEventListener("close", onClose);
    signal?.removeEventListener("abort", onAbort);
  }
}
