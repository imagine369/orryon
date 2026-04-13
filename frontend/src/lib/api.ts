const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
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

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: form,
  });
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
  type: "token" | "tool" | "done" | "error";
  content?: string;
  name?: string;
  label?: string;
  message?: string;
  actions?: unknown[];
  tabs?: string[];
  undo_info?: { table: string; id: string; tool: string; label: string } | null;
}

export async function* streamChat(message: string): AsyncGenerator<ChatEvent> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok || !res.body) {
    yield { type: "error", message: "Connection failed" };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
}
