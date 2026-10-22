import "server-only";
import type { ZodType } from "zod";
import {
  AI_LIMITS,
  GEMINI_MODEL_ID,
  GEMINI_MODEL_LABEL,
  PROMPT_VERSION,
  SAFE_AI_MESSAGES,
} from "@/lib/constants/ai";
import type { FallbackReason } from "@/lib/constants/events";
import { computeInsightFacts, computeSummaryFacts } from "@/lib/analytics/facts";
import { createFallbackAnalysis, createFallbackInsight, createFallbackSummary } from "@/lib/ai/fallback";
import {
  findAbsenceContradiction,
  findUnsupportedCountClaim,
  scanNarrativeSafety,
} from "@/lib/ai/guardrails";
import {
  classifyGeminiError,
  createGeminiClient,
  generateStructured,
  GeminiRequestError,
  logGeminiFailure,
  readGeminiConfig,
  verifyGeminiAccess,
  type GeminiJsonClient,
} from "@/lib/ai/gemini";
import {
  buildEventInterpretationPrompt,
  buildInsightPrompt,
  buildSearchPrompt,
  buildSummaryPrompt,
  EVENT_SYSTEM_PROMPT,
  INSIGHT_SYSTEM_PROMPT,
  SEARCH_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";
import {
  eventInterpretationResponseSchema,
  insightResponseSchema,
  searchPlanResponseSchema,
  summaryResponseSchema,
} from "@/lib/ai/response-schemas";
import { getCached, setCached, stableCacheKey } from "@/lib/ai/cache";
import { evaluateEvent, type RuleSettings } from "@/lib/events/rules";
import { parseSearchQueryLocally } from "@/lib/events/search";
import {
  eventInterpretationModelSchema,
  insightNarrativeModelSchema,
  searchPlanModelSchema,
  summaryNarrativeModelSchema,
  type AnalysisSettings,
  type EventDigestInput,
} from "@/lib/validation/schemas";
import type { AiHealth, AiResponseMeta, ActivityInsight, DailySummary, InsightNarrative, SummaryNarrative } from "@/types/ai";
import type { AiAnalysis, RingCareEvent, RuleEvaluation, RuleEvent } from "@/types/events";
import type { SearchInterpretation, SearchPlan } from "@/types/search";

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

function toRuleSettings(settings: AnalysisSettings): RuleSettings {
  return {
    prolongedPresenceThresholdSeconds: settings.prolongedPresenceThresholdSeconds,
    notificationPreferences: settings.notificationPreferences,
    caregiverLabel: settings.caregiverLabel,
    caregiverCriteria: settings.caregiverCriteria,
    caregiverAlertsEnabled: settings.caregiverAlertsEnabled,
  };
}

export function digestToRuleEvent(digest: EventDigestInput): RuleEvent {
  const metadata = {
    ...(digest.caregiverLabel ? { caregiverLabel: digest.caregiverLabel } : {}),
    ...(digest.packageDetected !== undefined
      ? { packageDetected: digest.packageDetected }
      : {}),
    ...(digest.doorbellPressed !== undefined
      ? { doorbellPressed: digest.doorbellPressed }
      : {}),
  };
  return {
    id: digest.id,
    eventType: digest.eventType,
    occurredAt: digest.occurredAt,
    location: digest.location,
    ...(digest.durationSeconds !== undefined
      ? { durationSeconds: digest.durationSeconds }
      : {}),
    ...(digest.availableDescription
      ? { availableDescription: digest.availableDescription }
      : {}),
    ...(Object.keys(metadata).length > 0 ? { availableMetadata: metadata } : {}),
  };
}

function makeFallbackMeta(
  reason: FallbackReason | undefined,
  now: Date,
  message?: string,
  cached = false,
  detail?: string,
): AiResponseMeta {
  const resolvedMessage = message ?? (reason ? SAFE_AI_MESSAGES[reason] : undefined);
  return {
    mode: "fallback",
    ...(reason ? { reason } : {}),
    ...(resolvedMessage ? { message: resolvedMessage } : {}),
    ...(detail ? { detail } : {}),
    cached,
    generatedAt: now.toISOString(),
  };
}

function makeGeminiMeta(model: string, now: Date, cached: boolean): AiResponseMeta {
  return {
    mode: "gemini",
    model,
    cached,
    generatedAt: now.toISOString(),
  };
}

function resolveClient(explicit?: GeminiJsonClient): GeminiJsonClient | null {
  if (explicit) return explicit;
  const runtime = readGeminiConfig();
  if (!runtime.configured) return null;
  return createGeminiClient({ apiKey: runtime.apiKey, model: runtime.model });
}

/**
 * Health/configuration snapshot. When a key is present, this verifies it with
 * Gemini's free model-metadata endpoint (cached per instance) so the UI can
 * distinguish "key present" from "Gemini actually accepts this key".
 */
export async function getHealth(
  options: { refresh?: boolean } = {},
): Promise<AiHealth> {
  const config = readGeminiConfig();
  const verification = await verifyGeminiAccess(config, {
    force: options.refresh,
  });
  return {
    configured: config.configured,
    provider: "Google Gemini",
    model: config.model,
    modelLabel: GEMINI_MODEL_LABEL,
    promptVersion: PROMPT_VERSION,
    credentialsVerified: verification.status === "ok",
    verificationStatus: verification.status,
    verificationMessage: verification.message,
    keySource: config.keySource,
    ...(config.ignoredModelEnv
      ? {
          modelNotice: `GEMINI_MODEL="${config.ignoredModelEnv}" was ignored. RingCare AI is pinned to ${GEMINI_MODEL_ID}.`,
        }
      : {}),
    ...(verification.latencyMs !== undefined
      ? { latencyMs: verification.latencyMs }
      : {}),
    checkedAt: verification.checkedAt,
  };
}

export const getAiHealth = getHealth;

const CORRECTION_INSTRUCTION = `

CORRECTION IMPORTANT: Your previous answer was rejected. Return ONE JSON object that
matches the schema exactly. Use only the supplied facts. Never state identity, criminality,
danger, an emergency, monitoring, or reassurance. Every number must appear in the facts.
The attentionLevel must exactly equal the deterministic rule level supplied above.`;

interface ValidatedGenerationOptions<T> {
  client: GeminiJsonClient;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
  schema: ZodType<T>;
  timeoutMs: number;
  maxOutputTokens: number;
  buildPrompt: () => string;
  /** Throw a GeminiRequestError to reject an otherwise schema-valid result. */
  validate?: (value: T) => void;
}

/**
 * Generate, validate, and — when the model produced schema-valid JSON that
 * failed a semantic check — retry exactly once with a corrective instruction.
 * Transport and auth failures are never retried here.
 */
async function generateValidated<T>({
  client,
  systemInstruction,
  responseSchema,
  schema,
  timeoutMs,
  maxOutputTokens,
  buildPrompt,
  validate,
}: ValidatedGenerationOptions<T>): Promise<T> {
  const attempt = async (correction?: string): Promise<T> => {
    const value = await generateStructured({
      client,
      systemInstruction,
      userPrompt: `${buildPrompt()}${correction ?? ""}`,
      responseSchema,
      schema,
      timeoutMs,
      maxOutputTokens,
    });
    validate?.(value);
    return value;
  };

  try {
    return await attempt();
  } catch (error) {
    const classified = classifyGeminiError(error);
    if (
      classified.reason === "invalid_response" ||
      classified.reason === "unsafe_response"
    ) {
      return attempt(CORRECTION_INSTRUCTION);
    }
    throw classified;
  }
}

/* -------------------------------------------------------------------------- */
/*                             Event interpretation                           */
/* -------------------------------------------------------------------------- */

export interface AnalyzeEventInput {
  event: RingCareEvent;
  contextEvents: EventDigestInput[];
  settings: AnalysisSettings;
  now?: Date;
  /** Injectable client for tests. Never supplied by the browser. */
  client?: GeminiJsonClient;
}

export interface AnalyzeEventResult {
  analysis: AiAnalysis;
  meta: AiResponseMeta;
  evaluation: RuleEvaluation;
}

export async function analyzeEvent({
  event,
  contextEvents,
  settings,
  now = new Date(),
  client: explicitClient,
}: AnalyzeEventInput): Promise<AnalyzeEventResult> {
  const ruleSettings = toRuleSettings(settings);
  const related = contextEvents
    .filter((digest) => digest.id !== event.id)
    .map(digestToRuleEvent);
  const evaluation = evaluateEvent(event, ruleSettings, [event, ...related]);

  const fallback = (reason: FallbackReason, detail?: string) => {
    const analysis = createFallbackAnalysis({
      event,
      evaluation,
      reason,
      generatedAt: now,
      notice: SAFE_AI_MESSAGES[reason],
    });
    return {
      analysis,
      meta: makeFallbackMeta(reason, now, undefined, false, detail),
      evaluation,
    } satisfies AnalyzeEventResult;
  };

  if (!settings.aiEnabled) return fallback("ai_disabled");

  const client = resolveClient(explicitClient);
  if (!client) return fallback("missing_api_key");

  const cacheKey = stableCacheKey({
    kind: "event-analysis",
    promptVersion: PROMPT_VERSION,
    model: client.model,
    event: {
      id: event.id,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      location: event.location,
      durationSeconds: event.durationSeconds,
      availableDescription: event.availableDescription,
      availableMetadata: event.availableMetadata,
    },
    rules: evaluation.matchedRules.map((rule) => rule.id),
    threshold: settings.prolongedPresenceThresholdSeconds,
    caregiverLabel: settings.caregiverLabel,
    caregiverCriteria: settings.caregiverCriteria,
  });

  const cached = getCached<AiAnalysis>(cacheKey);
  if (cached) {
    return {
      analysis: { ...cached, cached: true },
      meta: makeGeminiMeta(client.model, now, true),
      evaluation,
    };
  }

  try {
    const model = await generateValidated({
      client,
      systemInstruction: EVENT_SYSTEM_PROMPT,
      buildPrompt: () =>
        buildEventInterpretationPrompt({
          event,
          evaluation,
          settings: ruleSettings,
          relatedEvents: contextEvents,
        }),
      responseSchema: eventInterpretationResponseSchema,
      schema: eventInterpretationModelSchema,
      timeoutMs: AI_LIMITS.analyzeTimeoutMs,
      maxOutputTokens: AI_LIMITS.maxOutputTokensNarrative,
      validate: (value) => {
        const unsafe = scanNarrativeSafety([
          value.summary,
          value.eventInterpretation,
          value.recommendedAction,
          ...value.evidence,
          ...value.uncertainty,
          ...value.limitations,
        ]);
        if (unsafe) {
          throw new GeminiRequestError("unsafe_response", `Unsafe narrative: ${unsafe}`);
        }
        if (value.attentionLevel !== evaluation.attentionLevel) {
          throw new GeminiRequestError(
            "invalid_response",
            "Model attention level disagreed with deterministic rules",
            { detail: `expected ${evaluation.attentionLevel}, received ${value.attentionLevel}` },
          );
        }
      },
    });

    const analysis: AiAnalysis = {
      summary: model.summary,
      eventInterpretation: model.eventInterpretation,
      confidence: model.confidence,
      evidence: model.evidence,
      recommendedAction: model.recommendedAction,
      attentionLevel: evaluation.attentionLevel,
      uncertainty: model.uncertainty,
      limitations: Array.from(
        new Set([
          ...model.limitations,
          "Based only on supplied structured event metadata; no video or audio was analysed.",
        ]),
      ).slice(0, 6),
      source: "gemini",
      model: client.model,
      generatedAt: now.toISOString(),
      cached: false,
    };

    setCached(cacheKey, analysis);
    return {
      analysis,
      meta: makeGeminiMeta(client.model, now, false),
      evaluation,
    };
  } catch (error) {
    const classified = classifyGeminiError(error);
    logGeminiFailure("analyze", classified);
    return fallback(classified.reason, classified.detail);
  }
}

/* -------------------------------------------------------------------------- */
/*                               Daily summary                                */
/* -------------------------------------------------------------------------- */

export interface SummaryServiceInput {
  events: EventDigestInput[];
  settings: AnalysisSettings;
  from: Date;
  to: Date;
  label: string;
  timeZone: string;
  now?: Date;
  client?: GeminiJsonClient;
}

export async function generateDailySummary({
  events,
  settings,
  from,
  to,
  label,
  timeZone,
  now = new Date(),
  client: explicitClient,
}: SummaryServiceInput): Promise<DailySummary> {
  const ruleSettings = toRuleSettings(settings);
  const ruleEvents = events.map(digestToRuleEvent);
  const facts = computeSummaryFacts(ruleEvents, ruleSettings, {
    from,
    to,
    label,
    timeZone,
  });

  const fallback = (reason?: FallbackReason, detail?: string) =>
    createFallbackSummary({ facts, reason, generatedAt: now, detail });

  if (!settings.aiEnabled) return fallback("ai_disabled");
  const client = resolveClient(explicitClient);
  if (!client) return fallback("missing_api_key");
  if (facts.consideredEvents === 0) {
    const summary = createFallbackSummary({
      facts,
      generatedAt: now,
      notice: "No recorded events fall in this range, so a deterministic summary is shown.",
    });
    return {
      ...summary,
      meta: {
        ...summary.meta,
        message: "No recorded events in range — deterministic summary used.",
      },
    };
  }

  const cacheKey = stableCacheKey({
    kind: "daily-summary",
    promptVersion: PROMPT_VERSION,
    model: client.model,
    facts,
    settings: {
      threshold: settings.prolongedPresenceThresholdSeconds,
      caregiverLabel: settings.caregiverLabel,
    },
  });
  const cached = getCached<{ narrative: SummaryNarrative; model: string }>(cacheKey);
  if (cached) {
    return {
      facts,
      narrative: { ...cached.narrative, model: cached.model },
      meta: makeGeminiMeta(cached.model, now, true),
      generatedAt: now.toISOString(),
    };
  }

  try {
    const model = await generateValidated({
      client,
      systemInstruction: SUMMARY_SYSTEM_PROMPT,
      buildPrompt: () => buildSummaryPrompt({ facts, events }),
      responseSchema: summaryResponseSchema,
      schema: summaryNarrativeModelSchema,
      timeoutMs: AI_LIMITS.summaryTimeoutMs,
      maxOutputTokens: AI_LIMITS.maxOutputTokensNarrative,
      validate: (value) => {
        const combined = [
          value.headline,
          value.mainActivity,
          ...value.patterns,
          ...value.reviewItems,
          ...value.limitations,
        ].join("\n");

        const unsafe = scanNarrativeSafety([
          value.headline,
          value.mainActivity,
          ...value.patterns,
          ...value.reviewItems,
          ...value.limitations,
        ]);
        if (unsafe) {
          throw new GeminiRequestError("unsafe_response", `Unsafe summary: ${unsafe}`);
        }
        const allowedCounts = [
          facts.counts.total,
          facts.counts.routine,
          facts.counts.review,
          facts.counts.highAttention,
          facts.counts.uncertain,
          facts.counts.deliveries,
          facts.counts.caregiverArrivals,
          facts.counts.unmatchedCaregiverArrivals,
          ...Object.values(facts.counts.byType),
          facts.reviewSamples.length,
          facts.busiestHour?.count ?? 0,
          facts.topLocation?.count ?? 0,
        ];
        const badCount = findUnsupportedCountClaim(combined, allowedCounts);
        if (badCount) {
          throw new GeminiRequestError("invalid_response", badCount);
        }
        const absence = findAbsenceContradiction(combined, facts.counts.total > 0);
        if (absence) {
          throw new GeminiRequestError("invalid_response", absence);
        }
      },
    });

    const limitations = Array.from(
      new Set([
        ...model.limitations,
        "This summary covers only the supplied demo records and is not continuous monitoring.",
      ]),
    ).slice(0, 4);

    const narrative: SummaryNarrative = {
      headline: model.headline,
      mainActivity: model.mainActivity,
      patterns: model.patterns,
      reviewItems: model.reviewItems,
      limitations,
      source: "gemini",
      model: client.model,
    };

    setCached(cacheKey, { narrative, model: client.model });
    return {
      facts,
      narrative,
      meta: makeGeminiMeta(client.model, now, false),
      generatedAt: now.toISOString(),
    };
  } catch (error) {
    const classified = classifyGeminiError(error);
    logGeminiFailure("summary", classified);
    return fallback(classified.reason, classified.detail);
  }
}

/* -------------------------------------------------------------------------- */
/*                             Activity insights                              */
/* -------------------------------------------------------------------------- */

export interface InsightsServiceInput {
  rangeLabel: "today" | "last_7_days" | "last_30_days";
  events: EventDigestInput[];
  settings: AnalysisSettings;
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  timeZone: string;
  now?: Date;
  client?: GeminiJsonClient;
}

export async function generateActivityInsight({
  rangeLabel,
  events,
  settings,
  from,
  to,
  previousFrom,
  previousTo,
  timeZone,
  now = new Date(),
  client: explicitClient,
}: InsightsServiceInput): Promise<ActivityInsight> {
  const ruleSettings = toRuleSettings(settings);
  const ruleEvents = events.map(digestToRuleEvent);
  const facts = computeInsightFacts(ruleEvents, ruleSettings, {
    rangeLabel,
    from,
    to,
    previousFrom,
    previousTo,
    timeZone,
  });

  const fallback = (reason?: FallbackReason, detail?: string) => {
    const fallbackResult = createFallbackInsight({
      facts,
      reason,
      generatedAt: now,
      detail,
    });
    return {
      facts,
      narrative: fallbackResult.narrative,
      meta: fallbackResult.meta,
      generatedAt: fallbackResult.generatedAt,
    } satisfies ActivityInsight;
  };

  if (!settings.aiEnabled) return fallback("ai_disabled");
  const client = resolveClient(explicitClient);
  if (!client) return fallback("missing_api_key");
  if (facts.current.total === 0 && facts.previous.total === 0) {
    return fallback(undefined);
  }

  const cacheKey = stableCacheKey({
    kind: "activity-insight",
    promptVersion: PROMPT_VERSION,
    model: client.model,
    facts,
    rangeLabel,
  });
  const cached = getCached<{ narrative: InsightNarrative; model: string }>(cacheKey);
  if (cached) {
    return {
      facts,
      narrative: { ...cached.narrative, model: cached.model },
      meta: makeGeminiMeta(cached.model, now, true),
      generatedAt: now.toISOString(),
    };
  }

  try {
    const model = await generateValidated({
      client,
      systemInstruction: INSIGHT_SYSTEM_PROMPT,
      buildPrompt: () => buildInsightPrompt(facts),
      responseSchema: insightResponseSchema,
      schema: insightNarrativeModelSchema,
      timeoutMs: AI_LIMITS.insightsTimeoutMs,
      maxOutputTokens: AI_LIMITS.maxOutputTokensNarrative,
      validate: (value) => {
        const combined = [value.headline, ...value.observations, ...value.limitations].join("\n");
        const unsafe = scanNarrativeSafety([
          value.headline,
          ...value.observations,
          ...value.limitations,
        ]);
        if (unsafe) {
          throw new GeminiRequestError("unsafe_response", `Unsafe insight: ${unsafe}`);
        }
        const totalComparison = facts.comparisons.find((item) => item.id === "total");
        if (/\bincreased\b/i.test(combined) && totalComparison?.direction !== "up") {
          throw new GeminiRequestError("invalid_response", "Incorrect increase claim");
        }
        if (/\bdecreased\b/i.test(combined) && totalComparison?.direction !== "down") {
          throw new GeminiRequestError("invalid_response", "Incorrect decrease claim");
        }
        const allowedCounts = [
          ...facts.comparisons.flatMap((item) => [
            item.current,
            item.previous,
            Math.abs(item.delta),
          ]),
          ...Object.values(facts.current.byType),
          facts.current.total,
          facts.current.routine,
          facts.current.review,
          facts.current.highAttention,
          facts.current.uncertain,
          facts.current.deliveries,
          facts.current.caregiverArrivals,
          facts.current.busiestHour?.count ?? 0,
          facts.current.topLocation?.count ?? 0,
        ];
        const badCount = findUnsupportedCountClaim(combined, allowedCounts);
        if (badCount) {
          throw new GeminiRequestError("invalid_response", badCount);
        }
        if (findAbsenceContradiction(combined, facts.current.total > 0)) {
          throw new GeminiRequestError("invalid_response", "Incorrect absence claim");
        }
      },
    });

    const narrative: InsightNarrative = {
      headline: model.headline,
      observations: model.observations,
      limitations: Array.from(
        new Set([
          ...model.limitations,
          "Based on partial simulated records, not continuous monitoring.",
        ]),
      ).slice(0, 4),
      source: "gemini",
      model: client.model,
    };

    setCached(cacheKey, { narrative, model: client.model });
    return {
      facts,
      narrative,
      meta: makeGeminiMeta(client.model, now, false),
      generatedAt: now.toISOString(),
    };
  } catch (error) {
    const classified = classifyGeminiError(error);
    logGeminiFailure("insights", classified);
    return fallback(classified.reason, classified.detail);
  }
}

/* -------------------------------------------------------------------------- */
/*                            Natural-language search                         */
/* -------------------------------------------------------------------------- */

export interface SearchInterpretationInput {
  query: string;
  clientNow: Date;
  aiEnabled: boolean;
  now?: Date;
  client?: GeminiJsonClient;
}

export async function interpretSearchQuery({
  query,
  clientNow,
  aiEnabled,
  now = new Date(),
  client: explicitClient,
}: SearchInterpretationInput): Promise<SearchInterpretation> {
  const localPlan = () => parseSearchQueryLocally(query, clientNow);

  const local = (
    reason: FallbackReason | undefined,
    detail?: string,
  ): SearchInterpretation => ({
    plan: localPlan(),
    interpretedBy: "rules",
    meta: makeFallbackMeta(reason, now, undefined, false, detail),
  });

  if (!aiEnabled) return local("ai_disabled");
  const client = resolveClient(explicitClient);
  if (!client) return local("missing_api_key");

  try {
    const model = await generateValidated({
      client,
      systemInstruction: SEARCH_SYSTEM_PROMPT,
      buildPrompt: () => buildSearchPrompt({ query, clientNow }),
      responseSchema: searchPlanResponseSchema,
      schema: searchPlanModelSchema,
      timeoutMs: AI_LIMITS.searchTimeoutMs,
      maxOutputTokens: AI_LIMITS.maxOutputTokensSearch,
      validate: (value) => {
        const unsafe = scanNarrativeSafety([
          value.keyword,
          value.clarifyingQuestion,
          ...value.eventTypes,
          ...value.locations,
        ]);
        if (unsafe) {
          throw new GeminiRequestError("unsafe_response", "Unsafe search interpretation");
        }
      },
    });

    const plan: SearchPlan = {
      intent: model.intent,
      eventTypes: model.eventTypes,
      locations: model.locations,
      datePreset: model.datePreset,
      timeOfDay: model.timeOfDay === "any" ? null : model.timeOfDay,
      minDurationSeconds:
        model.minDurationSeconds > 0 ? model.minDurationSeconds : null,
      attentionLevels: model.attentionLevels,
      caregiverMatchedOnly: model.caregiverMatchedOnly,
      keyword: model.keyword.trim() ? model.keyword.trim() : null,
      sort: model.sort,
      clarifyingQuestion:
        model.intent === "clarify"
          ? model.clarifyingQuestion.trim() ||
            "Please refine the request with an event type, location, or date."
          : null,
    };

    return {
      plan,
      interpretedBy: "gemini",
      meta: makeGeminiMeta(client.model, now, false),
    };
  } catch (error) {
    const classified = classifyGeminiError(error);
    logGeminiFailure("search", classified);
    return {
      plan: localPlan(),
      interpretedBy: "rules",
      meta: {
        ...makeFallbackMeta(
          classified.reason,
          now,
          `${SAFE_AI_MESSAGES[classified.reason]} Search was interpreted locally instead.`,
          false,
          classified.detail,
        ),
      },
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Exports                                   */
/* -------------------------------------------------------------------------- */

export type { AnalysisSettings };
