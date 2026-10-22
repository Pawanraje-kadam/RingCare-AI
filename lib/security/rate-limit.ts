/**
 * In-memory fixed-window rate limiter.
 *
 * IMPORTANT: This is only a lightweight safeguard. Serverless deployments may
 * run multiple isolated instances, so limits are not shared globally. Use a
 * shared store (for example Redis/Upstash) if you need reliable distributed
 * rate limiting for public traffic.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const globalStore = globalThis as typeof globalThis & {
  __ringcareRateLimits?: Map<string, Bucket>;
};

const buckets = globalStore.__ringcareRateLimits ?? new Map<string, Bucket>();
globalStore.__ringcareRateLimits = buckets;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  limit = 12,
  windowMs = 60_000,
  now = Date.now(),
): RateLimitResult {
  if (buckets.size > 5000) {
    for (const [storedKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(storedKey);
    }
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      resetAt,
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    resetAt: existing.resetAt,
  };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const candidate = first || realIp || "anonymous";
  return candidate.slice(0, 64);
}

export function rateLimitKey(route: string, request: Request): string {
  return `${route}:${getClientIp(request)}`;
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
