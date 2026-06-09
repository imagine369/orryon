import type { NextRequest } from "next/server";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Strip port from Host header; supports bracketed IPv6 (e.g. [::1]:3000). */
export function hostnameFromHostHeader(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    if (end > 1) return h.slice(1, end);
  }
  const colon = h.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(h.slice(colon + 1))) {
    return h.slice(0, colon);
  }
  return h;
}

/** Demo API routes only respond on the local Next dev server (localhost). */
export function isDemoRouteAllowed(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production" || vercelEnv === "preview") return false;

  const host = hostnameFromHostHeader(req.headers.get("host") ?? "");
  return LOCAL_HOSTS.has(host);
}
