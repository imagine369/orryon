/**
 * Client-side HMAC-SHA256 request signing.
 *
 * Mirrors `backend/signing.py`. The signing key is fetched once per session
 * from POST /api/auth/sign-key (cookie-auth'd) and kept in memory only —
 * never written to localStorage/sessionStorage/cookies.
 *
 * Protected endpoints today: `/api/chat`, `/api/voice/stt`, `/api/voice/tts`.
 */

import { clientHeaders, getCsrfToken } from "@/lib/api";

type SignKey = { key: string; kid: string; iat: number };

function legacyBearer(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const token = localStorage.getItem("orryon_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

let _cached: SignKey | null = null;
let _inflight: Promise<SignKey | null> | null = null;
let _lastSignKeyError: string | null = null;

/** Last sign-key fetch failure detail (for user-visible chat errors). */
export function getLastSignKeyError(): string | null {
  return _lastSignKeyError;
}

function csrfHeader(): Record<string, string> {
  const csrf = getCsrfToken();
  return csrf ? { "X-CSRF-Token": csrf } : {};
}

async function fetchSignKey(): Promise<SignKey | null> {
  try {
    const res = await fetch("/api/auth/sign-key", {
      method: "POST",
      headers: {
        ...clientHeaders(),
        ...legacyBearer(),
        ...csrfHeader(),
      },
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail =
        typeof body?.detail === "string" ? body.detail : `HTTP ${res.status}`;
      _lastSignKeyError = detail;
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[signing] sign-key failed:", detail);
      }
      return null;
    }
    _lastSignKeyError = null;
    const data = (await res.json()) as SignKey;
    if (!data?.key) {
      _lastSignKeyError = "sign-key response missing key";
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

async function ensureKey(): Promise<SignKey | null> {
  if (_cached) return _cached;
  if (!_inflight) _inflight = fetchSignKey().finally(() => { _inflight = null; });
  _cached = await _inflight;
  return _cached;
}

export function invalidateSigningKey(): void {
  _cached = null;
  _inflight = null;
}

/**
 * Warm the in-memory signing key after login or session restore so the first
 * chat/voice request is not rejected when the backend enforces signatures.
 */
export async function prefetchSigningKey(): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      _cached = null;
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
    const key = await ensureKey();
    if (key) return true;
  }
  return false;
}

async function hmacSha256Hex(keyHex: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const keyBytes = enc.encode(keyHex);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return bytesToHex(new Uint8Array(sig));
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  // Slice into a fresh ArrayBuffer so TS can narrow the buffer type (TS's lib
  // dom now distinguishes ArrayBuffer vs SharedArrayBuffer on Uint8Array).
  const buf = data.slice().buffer as ArrayBuffer;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return bytesToHex(new Uint8Array(hash));
}

function bytesToHex(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i].toString(16).padStart(2, "0"));
  }
  return hex.join("");
}

/**
 * Compute `{X-Orryon-Sig, X-Orryon-Ts}` for an outbound request. Call ahead
 * of `fetch(...)`. Returns an empty object when no session exists (so the
 * caller still gets a 401 from the server, not a confusing signing error).
 *
 * `path` must match the path the backend sees — for the Next proxy that's
 * the URL path (e.g. `/api/chat`), which is exactly what the client fetches.
 */
export async function signRequest(
  method: string,
  path: string,
  body: BodyInit | null | undefined,
): Promise<Record<string, string>> {
  let key = await ensureKey();
  // One retry — cookie may not be visible until right after login redirect.
  if (!key) {
    _cached = null;
    key = await ensureKey();
  }
  if (!key) return {};

  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = randomNonceHex();
  const bodyBytes = await bodyToBytes(body);
  const digest = await sha256Hex(bodyBytes);
  const msg = `${method.toUpperCase()}|${path}|${digest}|${ts}|${nonce}`;
  const sig = await hmacSha256Hex(key.key, msg);
  return {
    "X-Orryon-Sig": sig,
    "X-Orryon-Ts": ts,
    "X-Orryon-Nonce": nonce,
  };
}

function randomNonceHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function bodyToBytes(body: BodyInit | null | undefined): Promise<Uint8Array> {
  if (body == null) return new Uint8Array(0);
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof FormData) {
    // FormData can't be stringified losslessly. For multipart requests we
    // sign an empty body on purpose — the HMAC still binds method+path+ts,
    // which is enough to fail replays from non-browser callers that can't
    // fetch a signing key. If this proves insufficient we can switch to
    // signing a stable hash of the form parts.
    return new Uint8Array(0);
  }
  try {
    const clone = new Response(body as BodyInit);
    return new Uint8Array(await clone.arrayBuffer());
  } catch {
    return new Uint8Array(0);
  }
}
