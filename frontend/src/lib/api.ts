import { CANARY } from "@/lib/integrity";

/**
 * API origin for HTTP requests.
 *
 * In the browser we ALWAYS go same-origin (`""`) so that `/api/*` is handled by
 * the Next.js route at `src/app/api/[[...path]]/route.ts`, which proxies to the
 * FastAPI backend (`BACKEND_URL` on Vercel). Going same-origin also lets the
 * HttpOnly `orryon_session` cookie attach automatically — a cross-origin call
 * would require CORS credentials and a matching Set-Cookie domain.
 *
 * `NEXT_PUBLIC_API_URL` is still used for the WebSocket connection (see
 * `connectChatWs` below) — Next.js doesn't tunnel WebSocket through the proxy,
 * so that has to connect directly to the backend host.
 *
 * On the server (SSR / route handlers) we fall back to `BACKEND_URL` /
 * `NEXT_PUBLIC_API_URL` / localhost because the proxy doesn't apply there.
 */
export function getApiBase(): string {
  if (typeof window !== "undefined") return "";
  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

// ── Token shims (legacy) ─────────────────────────────────────────────────────
// We no longer read or write localStorage for auth. These functions exist so
// any not-yet-migrated caller doesn't crash; they are effectively no-ops in
// the cookie world. Remove in a future cleanup once Capacitor also migrates.

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("orryon_token");
}

export function setToken(_token: string) {
  /* no-op: JWT is set as an HttpOnly cookie by /api/auth/login */
}

export function clearToken() {
  if (typeof window !== "undefined") localStorage.removeItem("orryon_token");
}

/** @deprecated Use `hasAuthSignal()` instead. Kept for back-compat. */
export function hasToken(): boolean {
  if (typeof window === "undefined") return false;
  return hasAuthSignal() || !!localStorage.getItem("orryon_token");
}

// ── Cookie-derived auth signals ──────────────────────────────────────────────

/**
 * Non-secret signal cookie set by /api/auth/login. Readable from JS so the
 * auth provider can avoid an unauthenticated /api/auth/me round-trip on cold
 * start — the real authentication is still the HttpOnly `orryon_session`.
 */
export function hasAuthSignal(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)orryon_auth=1/.test(document.cookie);
}

/**
 * True when the user is in local-only demo mode. Demo sessions have no
 * backend cookie, so API calls will 401 — we must NOT force-redirect to
 * /login in that case, or the app becomes unusable.
 */
export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("orryon_demo") === "true";
  } catch {
    return false;
  }
}

export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)orryon_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Headers attached to every outbound request so the backend can distinguish
 * real Orryon web-client traffic from scripted abuse. `X-Orryon-Build` is the
 * build canary (see `next.config.ts`); `X-Orryon-Client` is the client kind.
 */
export function clientHeaders(): Record<string, string> {
  return {
    "X-Orryon-Client": "web",
    "X-Orryon-Build": CANARY,
  };
}

function networkErrorMessage(): string {
  const isBrowser = typeof window !== "undefined";
  const onLocalhost =
    isBrowser &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  if (isBrowser && onLocalhost) {
    return "Can't reach the API. Start the backend (e.g. uvicorn on port 8000) and make sure BACKEND_URL is set.";
  }
  return "Can't reach the API. The backend proxy at /api/* may be misconfigured — check that BACKEND_URL is set on Vercel to your Railway URL.";
}

async function request<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const method = (opts.method || "GET").toUpperCase();
  const legacyToken = getToken(); // back-compat for any tab still using localStorage

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...clientHeaders(),
    ...(opts.headers as Record<string, string>),
  };

  // Same-origin cookies attach automatically; Authorization is only for the
  // transitional Capacitor / mobile case that still holds a localStorage JWT.
  if (legacyToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${legacyToken}`;
  }

  // Double-submit CSRF for mutating methods. Harmless if the cookie isn't
  // present yet (e.g. first request from a fresh browser) — the proxy only
  // enforces the check when there's also a session cookie.
  if (method !== "GET" && method !== "HEAD") {
    const csrf = getCsrfToken();
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      ...opts,
      method,
      headers,
      credentials: "same-origin",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (e instanceof TypeError && (msg === "Failed to fetch" || msg === "Load failed")) {
      throw new Error(networkErrorMessage());
    }
    throw e;
  }
  if (res.status === 401) {
    // Demo users have no backend session; surface the error silently so
    // the local-only UI (streaks, journal, etc.) stays usable.
    if (isDemoMode()) throw new Error("Unauthorized");
    clearToken();
    // We deliberately do NOT redirect to /login from here. A single stray
    // 401 from any background fetch (subscription, dashboard stats, etc.)
    // would otherwise yank the user mid-flow — including bouncing them
    // back to /login the very moment they sign in if any of /home's
    // useEffect-triggered fetches happens to race ahead of the cookie.
    // Auth state lives in AuthProvider; the (app) layout already redirects
    // to /login when `user` is null, which is the single source of truth.
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function uploadFile<T = unknown>(
  path: string,
  file: File,
  fieldName = "file",
  extraFields?: Record<string, string>,
): Promise<T> {
  const legacyToken = getToken();
  const form = new FormData();
  form.append(fieldName, file);
  if (extraFields) {
    for (const [k, v] of Object.entries(extraFields)) {
      form.append(k, v);
    }
  }

  const headers: Record<string, string> = { ...clientHeaders() };
  if (legacyToken) headers.Authorization = `Bearer ${legacyToken}`;
  const csrf = getCsrfToken();
  if (csrf) headers["X-CSRF-Token"] = csrf;

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      method: "POST",
      headers,
      body: form,
      credentials: "same-origin",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (e instanceof TypeError && (msg === "Failed to fetch" || msg === "Load failed")) {
      throw new Error(networkErrorMessage());
    }
    throw e;
  }
  if (res.status === 401) {
    if (isDemoMode()) throw new Error("Unauthorized");
    clearToken();
    // No auto-redirect — see request() above for rationale.
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Upload failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T = unknown>(path: string) => request<T>(path),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T = unknown>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T = unknown>(path: string, file: File, fieldName?: string, extraFields?: Record<string, string>) =>
    uploadFile<T>(path, file, fieldName, extraFields),
};


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

/** Thrown by streamChat when monthly message or API caps are hit. */
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


// ── Connection warmup ────────────────────────────────────────────────────────

export function warmConnection(): void {
  if (!hasAuthSignal() && !getToken()) return;
  fetch(`${getApiBase()}/api/chat/warm`, {
    headers: clientHeaders(),
    credentials: "same-origin",
  }).catch(() => {});
}


// ── SSE transport (fallback) ─────────────────────────────────────────────────

export async function* streamChat(
  message: string,
  sessionId?: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const legacyToken = getToken();
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
    // Don't force-navigate here either — yield the error and let the UI
    // surface it. AuthProvider will reconcile via /api/auth/me on next
    // mount; (app) layout redirects when user becomes null.
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


// ── WebSocket transport (primary, lower latency) ─────────────────────────────
// Next.js HTTP rewrites do not tunnel WebSocket; connect only when
// NEXT_PUBLIC_API_URL is set. We request a 30-second, single-use ticket from
// /api/chat/ws-ticket and put THAT in the URL — the JWT never appears on the
// wire in plaintext ws:// params.

let _chatWs: WebSocket | null = null;
let _wsConnected = false;
let _wsConnecting = false;

async function fetchWsTicket(): Promise<string | null> {
  try {
    const legacyToken = getToken();
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
  if (!hasAuthSignal() && !getToken()) return;
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
    } catch { /* ignore malformed frames */ }
    resolve?.();
  };

  const onClose = () => { finished = true; resolve?.(); };
  const onAbort = () => { finished = true; resolve?.(); };

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
      await new Promise<void>((r) => { resolve = r; });
      resolve = null;
    }
  } finally {
    ws.removeEventListener("message", onMessage);
    ws.removeEventListener("close", onClose);
    signal?.removeEventListener("abort", onAbort);
  }
}
