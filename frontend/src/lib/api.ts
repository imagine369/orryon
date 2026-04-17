/**
 * API origin for HTTP requests.
 * - If `NEXT_PUBLIC_API_URL` is set: browser talks to that host directly (optional; use for WebSocket + direct API).
 * - Otherwise in the browser: `""` (same origin; `next.config.ts` rewrites `/api/*` → `BACKEND_URL`).
 * - On the server (SSR): `BACKEND_URL` or localhost (rewrites do not apply to server-side fetch).
 */
export function getApiBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (typeof window !== "undefined") return "";
  return (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("orryon_token");
}

export function setToken(token: string) {
  localStorage.setItem("orryon_token", token);
}

export function clearToken() {
  localStorage.removeItem("orryon_token");
}

export function hasToken(): boolean {
  return !!getToken();
}

function networkErrorMessage(): string {
  const isBrowser = typeof window !== "undefined";
  const onLocalhost =
    isBrowser &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const base = getApiBase();
  const apiLooksLocal = base.includes("localhost") || base.includes("127.0.0.1");
  if (isBrowser && apiLooksLocal && !onLocalhost) {
    return (
      "Can't reach the API: this build points at localhost, but you're not on localhost. " +
      "Unset NEXT_PUBLIC_API_URL to use the built-in proxy, or set it to your backend's public URL."
    );
  }
  if (isBrowser && onLocalhost) {
    return (
      "Can't reach the API. Start the backend (e.g. uvicorn on port 8000) or set NEXT_PUBLIC_API_URL."
    );
  }
  return "Can't reach the API. Check that the backend is running and CORS allows this site (FRONTEND_URL on the server).";
}

async function request<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, { ...opts, headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (e instanceof TypeError && (msg === "Failed to fetch" || msg === "Load failed")) {
      throw new Error(networkErrorMessage());
    }
    throw e;
  }
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
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
  const token = getToken();
  const form = new FormData();
  form.append(fieldName, file);
  if (extraFields) {
    for (const [k, v] of Object.entries(extraFields)) {
      form.append(k, v);
    }
  }

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      method: "POST",
      headers,
      body: form,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (e instanceof TypeError && (msg === "Failed to fetch" || msg === "Load failed")) {
      throw new Error(networkErrorMessage());
    }
    throw e;
  }
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
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


export interface ChatEvent {
  type: "token" | "tool" | "done" | "error" | "session";
  content?: string;
  name?: string;
  label?: string;
  message?: string;
  actions?: unknown[];
  tabs?: string[];
  undo_info?: { table: string; id: string; tool: string; label: string } | null;
  session_id?: string;
}


// ── Connection warmup ────────────────────────────────────────────────────────

export function warmConnection(): void {
  const token = getToken();
  if (!token) return;
  fetch(`${getApiBase()}/api/chat/warm`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}


// ── SSE transport (fallback) ─────────────────────────────────────────────────

export async function* streamChat(
  message: string,
  sessionId?: string,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const token = getToken();
  const res = await fetch(`${getApiBase()}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, session_id: sessionId || "" }),
    signal,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    yield { type: "error", message: "Session expired — please log in again." };
    return;
  }

  if (!res.ok || !res.body) {
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
// Next.js HTTP rewrites do not tunnel WebSocket; connect only when NEXT_PUBLIC_API_URL is set.

let _chatWs: WebSocket | null = null;
let _wsConnected = false;
let _wsConnecting = false;

export function connectChatWs(): void {
  const token = getToken();
  if (!token || _wsConnected || _wsConnecting) return;
  const publicUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!publicUrl) return;

  _wsConnecting = true;
  const wsBase = publicUrl.replace(/^http/, "ws");
  const ws = new WebSocket(`${wsBase}/ws/chat?token=${encodeURIComponent(token)}`);

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
