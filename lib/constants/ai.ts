/**
 * Pinned Gemini model and server-side AI limits.
 *
 * The app is written, prompted, and tested against Gemini 3.8 Flash. The model
 * identifier is pinned here and used by every AI route, the health check, the
 * settings page, and the tests. `GEMINI_MODEL` may repeat the same model (with
 * or without a `models/` prefix), but it cannot switch the app to a different
 * model.
 */
export const GEMINI_MODEL_ID = "gemini-3.8-flash";

/** Display label kept in one place for UI copy. */
export const GEMINI_MODEL_LABEL = "Gemini 3.8 Flash";

/** Backwards-compatible alias used across the codebase. */
export const DEFAULT_GEMINI_MODEL = GEMINI_MODEL_ID;

/**
 * Gemini 3.8 Flash thinks at "medium" by default and MINIMAL is rejected for
 * this model. "low" is the fastest supported level and is enough for the short,
 * schema-constrained JSON tasks used here; without it, thinking tokens can
 * consume the whole output budget and delay responses past the route timeout.
 */
export const GEMINI_THINKING_LEVEL = "LOW" as const;

/** Bump when prompts change so cached analyses are not reused. */
export const PROMPT_VERSION = "2026-10-23.2";

export const AI_LIMITS = {
  analyzeTimeoutMs: 20_000,
  summaryTimeoutMs: 24_000,
  searchTimeoutMs: 15_000,
  insightsTimeoutMs: 24_000,
  healthCheckTimeoutMs: 8_000,
  healthCacheTtlMs: 5 * 60 * 1000,
  maxRequestBodyBytes: 128 * 1024,
  maxEventDescriptionChars: 500,
  maxMetadataNoteChars: 300,
  maxEventsForSummary: 120,
  maxEventsForInsights: 180,
  maxContextEventsForAnalyze: 10,
  maxSearchQueryChars: 240,
  rateLimitRequestsPerMinute: 12,
  cacheMaxEntries: 150,
  cacheTtlMs: 30 * 60 * 1000,
  /**
   * Output budgets include any thinking tokens, so they are intentionally
   * larger than the JSON payloads need.
   */
  maxOutputTokensNarrative: 2048,
  maxOutputTokensSearch: 1024,
} as const;

import type { FallbackReason } from "./events";

export const SAFE_AI_MESSAGES: Record<FallbackReason, string> = {
  missing_api_key:
    "AI analysis is not configured on this deployment. A deterministic rules-based explanation is shown instead.",
  ai_disabled:
    "AI analysis is turned off in Settings. A deterministic rules-based explanation is shown instead.",
  timeout:
    "The AI request timed out. A deterministic rules-based explanation is shown instead.",
  rate_limited:
    "The AI service reported a rate or quota limit. A deterministic rules-based explanation is shown instead. Try again later.",
  provider_error:
    "The AI service could not complete the request. A deterministic rules-based explanation is shown instead.",
  invalid_response:
    "The AI response could not be validated, so a deterministic rules-based explanation is shown instead.",
  unsafe_response:
    "The AI response made a claim beyond the available evidence, so a deterministic rules-based explanation is shown instead.",
  network_error:
    "The AI service could not be reached. A deterministic rules-based explanation is shown instead.",
  unknown:
    "The AI analysis was unavailable. A deterministic rules-based explanation is shown instead.",
};

/**
 * Actionable, deployment-oriented hints shown next to a fallback. These are
 * deliberately about configuration, never about event content.
 */
export const AI_FALLBACK_HINTS: Partial<Record<FallbackReason, string>> = {
  missing_api_key:
    "Add GEMINI_API_KEY (or GOOGLE_API_KEY) to your deployment environment and redeploy.",
  provider_error:
    "Gemini rejected the request. Check the key, the pinned model, and the AI status in Settings.",
  rate_limited:
    "Gemini quota for this project is exhausted. Check https://aistudio.google.com/rate-limit.",
  network_error:
    "The server could not reach Gemini. Check outbound network access and try again.",
  timeout:
    "Gemini took too long. Try again, or keep using the deterministic rules.",
  invalid_response:
    "Gemini returned data that did not match the required schema. Retrying usually works.",
  unsafe_response:
    "The model's wording exceeded the evidence rules, so it was discarded.",
};

export const AI_VERIFICATION_STATUSES = [
  "ok",
  "not_configured",
  "invalid_key",
  "model_unavailable",
  "quota",
  "unreachable",
  "error",
  "unverified",
] as const;

export type AiVerificationStatus = (typeof AI_VERIFICATION_STATUSES)[number];
