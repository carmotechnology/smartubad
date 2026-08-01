import "server-only";

import { headers } from "next/headers";

/**
 * Fixed-window rate limiter for auth, invite and public-intake endpoints.
 *
 * Backed by an in-process Map. On Vercel that means the limit is per serverless
 * instance, not global — which blunts a distributed attack but still stops the
 * ordinary case of one client hammering an endpoint. When traffic justifies it,
 * swap the two functions below for Upstash Redis; nothing else changes.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Bound memory: a hot instance should not accumulate keys forever.
const MAX_KEYS = 10_000;

function sweep(now: number) {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, bucket);
    return { ok: true, remaining: limit - 1, resetAt: bucket.resetAt, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const ok = existing.count <= limit;

  return {
    ok,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: ok ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return (
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

/** Preset windows for the endpoints that need protecting. */
export const LIMITS = {
  /** Magic-link / OAuth start: 5 attempts per 15 minutes per IP. */
  authStart: { limit: 5, windowMs: 15 * 60 * 1000 },
  /** Invite acceptance attempts: 10 per hour per IP — brute-forcing tokens. */
  inviteAccept: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** Invite creation: 30 per hour per inviting user. */
  inviteCreate: { limit: 30, windowMs: 60 * 60 * 1000 },
  /** Public admission form: 5 submissions per hour per IP. */
  admissionSubmit: { limit: 5, windowMs: 60 * 60 * 1000 },
} as const;

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;
  readonly status = 429;

  constructor(retryAfterSeconds: number) {
    super(`Too many attempts. Try again in ${retryAfterSeconds} seconds.`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function enforceRateLimit(
  scope: keyof typeof LIMITS,
  identifier?: string,
): Promise<void> {
  const { limit, windowMs } = LIMITS[scope];
  const id = identifier ?? (await clientIp());
  const result = rateLimit(`${scope}:${id}`, limit, windowMs);
  if (!result.ok) throw new RateLimitError(result.retryAfterSeconds);
}
