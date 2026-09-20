import { cacheKeys, getCache } from './cache';
import { ApiError } from './http';

export interface RateLimitOptions {
  /** Logical bucket, e.g. "auth:login" or "submit". */
  bucket: string;
  /** Stable identity - user id when authenticated, otherwise client IP. */
  identity: string;
  limit: number;
  windowSeconds: number;
  message?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  count: number;
}

/**
 * Fixed-window counter. Backed by the shared cache driver, so it becomes a
 * cluster-wide limit as soon as REDIS_URL is configured.
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const cache = getCache();
  const key = cacheKeys.rateLimit(options.bucket, options.identity);
  const count = await cache.incr(key, options.windowSeconds);
  return {
    allowed: count <= options.limit,
    remaining: Math.max(0, options.limit - count),
    count,
  };
}

/** Same as checkRateLimit but throws the standard 429 error. */
export async function enforceRateLimit(options: RateLimitOptions): Promise<void> {
  const result = await checkRateLimit(options);
  if (!result.allowed) {
    throw ApiError.rateLimited(
      options.message ?? 'Too many requests. Please wait a moment and try again.',
    );
  }
}

/**
 * Limits tuned for the endpoints that matter most.
 *
 * Registration is deliberately generous per IP: a class or an office signs up
 * as a group from behind one NAT address, and a tight limit would lock out
 * everyone after the first few players. It is still low enough to make scripted
 * mass account creation impractical.
 */
export const RATE_LIMITS = {
  login: { limit: 10, windowSeconds: 60 },
  register: { limit: 30, windowSeconds: 600 },
  join: { limit: 20, windowSeconds: 60 },
  submit: { limit: 30, windowSeconds: 60 },
  upload: { limit: 20, windowSeconds: 300 },
  write: { limit: 120, windowSeconds: 60 },
} as const;
