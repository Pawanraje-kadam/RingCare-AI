/** Default model. Verify availability and quotas before relying on it. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/** Bump when prompts change so cached analyses are not reused. */
export const PROMPT_VERSION = "2026-10-22.1";

export const AI_LIMITS = {
  analyzeTimeoutMs: 20_000,
  summaryTimeoutMs: 24_000,
  searchTimeoutMs: 15_000,
  insightsTimeoutMs: 24_000,
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
