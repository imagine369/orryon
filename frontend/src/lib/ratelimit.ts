import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Edge rate limiting backed by Upstash Redis.
 *
 * Why a separate layer when the FastAPI backend already rate-limits?
 *  1. Cost — every proxy call is a Vercel function invocation + a Railway
 *     hop. Short-circuiting abuse at the edge is ~100× cheaper.
 *  2. Blast radius — if the backend is being slammed, the rest of the API
 *     proxy shouldn't get starved waiting for the abusive endpoint's cold
 *     backend to respond.
 *  3. Correctness — in-memory limiters inside serverless functions reset on
 *     every cold start and run per-instance, so they don't actually limit.
 *     Only a shared Redis gives a real ceiling across Vercel's fleet.
 *
 * Graceful degradation: if `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
 * aren't set (local dev without Upstash), this module becomes a no-op so dev
 * flows aren't throttled. Production MUST have them set.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const enabled = Boolean(url && token);

const redis = enabled ? new Redis({ url: url!, token: token! }) : null;
const limiters = new Map<string, Ratelimit>();

function getLimiter(tier: string, limit: number, windowSeconds: number): Ratelimit | null {
  if (!redis) return null;
  const cacheKey = `${tier}:${limit}:${windowSeconds}`;
  let rl = limiters.get(cacheKey);
  if (!rl) {
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      prefix: `rl:${tier}`,
      analytics: false,
    });
    limiters.set(cacheKey, rl);
  }
  return rl;
}

/**
 * Pull the real client IP from Vercel / Railway edge headers. `x-forwarded-for`
 * can be a comma-separated list; the left-most entry is the original client.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "0.0.0.0";
}

export interface RateLimitOptions {
  /** Short identifier used as the Redis key prefix, e.g. `"waitlist"`. */
  tier: string;
  /** Max requests allowed in the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Optional extra discriminator appended to the IP, e.g. an email. */
  keyExtra?: string;
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfter: number };

export async function checkRateLimit(
  req: Request,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const limiter = getLimiter(opts.tier, opts.limit, opts.windowSeconds);
  if (!limiter) return { ok: true };

  const ip = clientIp(req);
  const key = opts.keyExtra ? `${ip}:${opts.keyExtra}` : ip;

  try {
    const { success, reset } = await limiter.limit(key);
    if (success) return { ok: true };
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return { ok: false, retryAfter };
  } catch (err) {
    // Fail-open: a transient Upstash outage must not take down signup/login.
    // The backend still enforces its own limits, so abuse is bounded.
    console.error("[ratelimit] upstream error, allowing request", err);
    return { ok: true };
  }
}

export function tooManyRequests(retryAfter: number, message?: string) {
  return NextResponse.json(
    { error: message ?? "Too many requests. Please wait a moment." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}
