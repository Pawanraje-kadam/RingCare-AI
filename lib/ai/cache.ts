import "server-only";
import { createHash } from "node:crypto";
import { AI_LIMITS } from "@/lib/constants/ai";

/**
 * Lightweight per-instance cache.
 *
 * Vercel may run many serverless instances; this cache is not shared between
 * them. It only reduces repeated Groq calls within one warm instance.
 */

interface CacheEntry {
  value: unknown;
  expiresAt: number;
  insertedAt: number;
}

const globalStore = globalThis as typeof globalThis & {
  __ringcareAiCache?: Map<string, CacheEntry>;
};

const cache = globalStore.__ringcareAiCache ?? new Map<string, CacheEntry>();
globalStore.__ringcareAiCache = cache;

export function stableCacheKey(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function getCached<T>(key: string, now = Date.now()): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCached(key: string, value: unknown, ttlMs = AI_LIMITS.cacheTtlMs): void {
  if (cache.size >= AI_LIMITS.cacheMaxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs, insertedAt: Date.now() });
}

export function clearAiCache(): void {
  cache.clear();
}

export function getCacheSize(): number {
  return cache.size;
}
