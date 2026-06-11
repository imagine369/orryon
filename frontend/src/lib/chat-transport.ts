/**
 * Chat transport — WebSocket preferred, SSE fallback. Single code path for streaming.
 */
import type { ChatEvent, PlanLimitDetail } from "@/lib/api-chat";
import {
  clearToken,
  clientHeaders,
  getApiBase,
  getCsrfToken,
  getLegacyToken,
  hasAuthSignal,
  hasToken,
  isDemoMode,
  parseApiDetail,
} from "@/lib/api-client";

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

async function readResponseBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function parseLimitResponse(body: unknown): Promise<PlanLimitDetail | null> {
  if (!body || typeof body !== "object") return null;
  const detail = (body as { detail?: unknown }).detail;
  if (
    detail &&
    typeof detail === "object" &&
    ((detail as PlanLimitDetail).code === "chat_limit_reached" ||
      (detail as PlanLimitDetail).code === "usage_limit_reached")
  ) {
    return detail as PlanLimitDetail;
  }
  return null;
}

let _chatWs: WebSocket | null = null;
let _wsConnected = false;
let _wsConnecting = false;

export function warmConnection(): void {
  if (!hasAuthSignal() && !getLegacyToken()) return;
  fetch(`${getApiBase()}/api/chat/warm`, {
    headers: clientHeaders(),
    credentials: "same-origin",
  }).catch(() => {});
}

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

export function isChatWsConnected(): boolean {
  return _wsConnected && _chatWs !== null;
}

/** Preferred entry: WebSocket when connected, otherwise SSE. */
export async function* streamChatMessage(
  message: string,
  sessionId?: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  if (_chatWs && _wsConnected) {
    try {
      yield* streamViaWebSocket(_chatWs, message, sessionId, signal);
      return;
    } catch {
      _chatWs = null;
      _wsConnected = false;
    }
  }
  yield* streamChatSse(message, sessionId, signal);
}

/** @deprecated Use streamChatMessage */
export const streamChatAuto = streamChatMessage;

async function* streamViaWebSocket(
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

export async function* streamChatSse(
  message: string,
  sessionId?: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const legacyToken = getLegacyToken();
  const csrf = getCsrfToken();
  const bodyStr = JSON.stringify({ message, session_id: sessionId || "" });
  const { signRequest, invalidateSigningKey, prefetchSigningKey, getLastSignKeyError } =
    await import("@/lib/signing");

  if (!(await prefetchSigningKey())) {
    const reason = getLastSignKeyError();
    yield {
      type: "error",
      message: reason
        ? `Couldn't prepare secure chat (${reason}). Refresh the page.`
        : "Couldn't secure this chat turn. Refresh the page, or log out and back in.",
    };
    return;
  }

  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const sigHeaders = await signRequest("POST", "/api/chat", bodyStr);
    res = await fetch(`${getApiBase()}/api/chat`, {
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
    if (res.status === 401 && attempt === 0) {
      invalidateSigningKey();
      await prefetchSigningKey();
      continue;
    }
    break;
  }
  if (!res) return;

  if (res.status === 401) {
    const authBody = await readResponseBody(res);
    const detail = parseApiDetail(authBody, "");
    const lower = detail.toLowerCase();
    const signingRelated =
      lower.includes("signature") || lower.includes("missing session iat");
    const sessionDead =
      lower.includes("revoked") ||
      lower.includes("missing authorization") ||
      lower.includes("invalid token") ||
      lower.includes("not authenticated");

    if (isDemoMode()) {
      yield { type: "error", message: "Chat isn't available in the demo." };
      return;
    }

    if (signingRelated) {
      invalidateSigningKey();
      yield {
        type: "error",
        message:
          "Secure chat handshake failed. Refresh the page — your login is still valid.",
      };
      return;
    }

    if (sessionDead) {
      clearToken();
      invalidateSigningKey();
      yield { type: "error", message: "Session expired — please log in again." };
      return;
    }

    invalidateSigningKey();
    yield {
      type: "error",
      message:
        detail || "Couldn't verify your session. Refresh the page or log in again.",
    };
    return;
  }

  const errorBody = !res.ok ? await readResponseBody(res) : null;

  if (res.status === 402 || res.status === 429) {
    const limit = await parseLimitResponse(errorBody);
    if (limit) {
      throw new PlanLimitError(res.status, limit);
    }
  }

  if (!res.ok || !res.body) {
    const limit = await parseLimitResponse(errorBody);
    if (limit) {
      throw new PlanLimitError(res.status, limit);
    }
    if (res.status === 402) {
      yield {
        type: "error",
        message:
          "You've reached your monthly AI usage limit. Upgrade for more.",
      };
      return;
    }
    if (res.status === 429) {
      let msg: string | null = null;
      if (errorBody && typeof errorBody === "object") {
        const record = errorBody as { detail?: { message?: string } | string; message?: string };
        if (typeof record.detail === "object" && record.detail?.message) {
          msg = record.detail.message;
        } else if (typeof record.detail === "string") {
          msg = record.detail;
        } else if (typeof record.message === "string") {
          msg = record.message;
        }
      }
      yield {
        type: "error",
        message: msg || "Too many requests. Please wait a moment.",
      };
      return;
    }
    const detail = parseApiDetail(errorBody, `Request failed (${res.status})`);
    yield { type: "error", message: detail };
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

/** @deprecated Use streamChatSse */
export const streamChat = streamChatSse;
