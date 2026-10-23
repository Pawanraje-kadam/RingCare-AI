/**
 * Groq model and server-side AI limits.
 *
 * RingCare AI uses Groq's OpenAI-compatible Chat Completions API with
 * `llama-3.3-70b-versatile`. The model identifier and display label live here
 * so every AI route, the health check, Settings, and the tests report the same
 * value.
 */
export const GROQ_MODEL_ID = "openai/gpt-oss-120b";

/** Display label kept in one place for UI copy. */
export const GROQ_MODEL_LABEL = "GPT-OSS 120B";

/** Backwards-compatible alias used across the codebase. */
export const DEFAULT_GROQ_MODEL = GROQ_MODEL_ID;

/** Provider name shown in the UI and health endpoint. */
export const AI_PROVIDER_NAME = "Groq";

/** Default OpenAI-compatible endpoint. Overridable for proxies and tests. */
export const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/** Bump when prompts change so cached analyses are not reused. */
export const PROMPT_VERSION = "2026-10-23.1";

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
  /** Output budgets for the JSON payloads these prompts request. */
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
    "Add GROQ_API_KEY to your deployment environment and redeploy.",
  provider_error:
    "Groq rejected the request. Check the key, the configured model, and the AI status in Settings.",
  rate_limited:
    "Groq quota or per-minute limit reached. Check https://console.groq.com/settings/limits.",
  network_error:
    "The server could not reach Groq. Check outbound network access and try again.",
  timeout:
    "Groq took too long. Try again, or keep using the deterministic rules.",
  invalid_response:
    "Groq returned data that did not match the required schema. Retrying usually works.",
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

/** Safe fallback reasons surfaced by the Groq client. */
export const GROQ_FALLBACK_REASONS = [
  "timeout",
  "rate_limited",
  "provider_error",
  "invalid_response",
  "network_error",
] as const satisfies readonly FallbackReason[];
