import { CANARY } from "@/lib/integrity";
import {
  clearToken,
  getCsrfToken,
  getLegacyToken,
  hasAuthSignal,
  isDemoMode,
} from "@/lib/api-auth";

export {
  clearToken,
  getCsrfToken,
  getLegacyToken,
  hasAuthSignal,
  hasToken,
  isDemoMode,
  setToken,
} from "@/lib/api-auth";

/**
 * API origin for HTTP requests.
 *
 * In the browser we ALWAYS go same-origin (`""`) so that `/api/*` is handled by
 * the Next.js route at `src/app/api/[[...path]]/route.ts`, which proxies to the
 * FastAPI backend (`BACKEND_URL` on Vercel).
 */
export function getApiBase(): string {
  if (typeof window !== "undefined") return "";
  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

export function clientHeaders(): Record<string, string> {
  return {
    "X-Orryon-Client": "web",
    "X-Orryon-Build": CANARY,
  };
}

export function parseApiDetail(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (typeof first?.msg === "string") return first.msg;
  }
  return fallback;
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

async function request<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const method = (opts.method || "GET").toUpperCase();
  const legacyToken = getLegacyToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...clientHeaders(),
    ...(opts.headers as Record<string, string>),
  };

  if (legacyToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${legacyToken}`;
  }

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
    if (isDemoMode()) throw new Error("Unauthorized");
    clearToken();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiDetail(body, `Request failed: ${res.status}`));
  }
  return res.json() as Promise<T>;
}

async function uploadFile<T = unknown>(
  path: string,
  file: File,
  fieldName = "file",
  extraFields?: Record<string, string>,
): Promise<T> {
  const legacyToken = getLegacyToken();
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
  upload: <T = unknown>(
    path: string,
    file: File,
    fieldName?: string,
    extraFields?: Record<string, string>,
  ) => uploadFile<T>(path, file, fieldName, extraFields),
};
