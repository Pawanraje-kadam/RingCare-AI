import { z } from "zod";
import {
  ACTION_CATEGORIES,
  AI_SOURCES,
  ATTENTION_LEVELS,
  CAREGIVER_CRITERIA,
  CONFIDENCE_LEVELS,
  EVENT_LOCATIONS,
  EVENT_SOURCES,
  EVENT_TYPES,
  FALLBACK_REASONS,
  PROCESSING_STATUSES,
  RULE_IDS,
} from "@/lib/constants/events";
import {
  AI_LIMITS,
  AI_VERIFICATION_STATUSES,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_LABEL,
  PROMPT_VERSION,
} from "@/lib/constants/ai";
import {
  DEFAULT_SETTINGS,
  NOTIFICATION_DEFAULTS,
  SETTINGS_LIMITS,
} from "@/lib/constants/settings";
import {
  SEARCH_INTENTS,
  SEARCH_DATE_PRESETS,
  SEARCH_SORTS,
  TIME_OF_DAY,
} from "@/lib/constants/search";

/* -------------------------------------------------------------------------- */
/*                               Primitives                                   */
/* -------------------------------------------------------------------------- */

export const isoDateTimeSchema = z.iso.datetime({ message: "Expected an ISO-8601 UTC timestamp" });
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((timeZone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
      return true;
    } catch {
      return false;
    }
  }, "Unknown IANA time zone");
export const shortTextSchema = z.string().trim().min(1).max(300);
export const mediumTextSchema = z.string().trim().min(1).max(800);
export const safeModelNameSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Unsupported model identifier");

const eventIdSchema = z
  .string()
  .min(6)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/, "Event ids may only contain letters, numbers, _ and -");

/* -------------------------------------------------------------------------- */
/*                                  Events                                    */
/* -------------------------------------------------------------------------- */

export const eventMetadataSchema = z
  .object({
    packageDetected: z.boolean().optional(),
    doorbellPressed: z.boolean().optional(),
    caregiverLabel: z.string().trim().min(1).max(40).optional(),
    deviceName: z.string().trim().max(60).optional(),
    signalQuality: z.enum(["good", "fair", "poor", "unknown"]).optional(),
    clipAvailable: z.boolean().optional(),
    motionZones: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
    notes: z.string().trim().max(AI_LIMITS.maxMetadataNoteChars).optional(),
  })
  .strict();

export const aiAnalysisSchema = z
  .object({
    summary: z.string().trim().min(1).max(600),
    eventInterpretation: z.string().trim().min(1).max(800),
    confidence: z.enum(CONFIDENCE_LEVELS),
    evidence: z.array(z.string().trim().min(1).max(240)).min(1).max(6),
    recommendedAction: z.string().trim().min(1).max(400),
    attentionLevel: z.enum(ATTENTION_LEVELS),
    uncertainty: z.array(z.string().trim().min(1).max(240)).max(6),
    limitations: z.array(z.string().trim().min(1).max(240)).max(6),
    source: z.enum(AI_SOURCES),
    model: safeModelNameSchema.optional(),
    generatedAt: isoDateTimeSchema,
    cached: z.boolean().optional(),
    fallbackReason: z.enum(FALLBACK_REASONS).optional(),
    notice: z.string().trim().max(320).optional(),
  })
  .strict();

export const analysisErrorSchema = z
  .object({
    code: z.enum(FALLBACK_REASONS),
    message: z.string().trim().min(1).max(300),
    retryable: z.boolean(),
  })
  .strict();

export const ringCareEventSchema = z
  .object({
    id: eventIdSchema,
    source: z.enum(EVENT_SOURCES),
    simulated: z.boolean(),
    eventType: z.enum(EVENT_TYPES),
    occurredAt: isoDateTimeSchema,
    location: z.enum(EVENT_LOCATIONS),
    durationSeconds: z.number().int().min(0).max(86_400).optional(),
    availableDescription: z
      .string()
      .trim()
      .min(1)
      .max(AI_LIMITS.maxEventDescriptionChars)
      .optional(),
    availableMetadata: eventMetadataSchema.optional(),
    processingStatus: z.enum(PROCESSING_STATUSES),
    createdAt: isoDateTimeSchema,
    analysis: aiAnalysisSchema.optional(),
    analysisError: analysisErrorSchema.optional(),
  })
  .strict()
  .superRefine((event, ctx) => {
    if (event.simulated !== (event.source === "simulated_ring")) {
      ctx.addIssue({
        code: "custom",
        path: ["simulated"],
        message: "`simulated` must be true for simulated_ring events and false for live Ring events",
      });
    }
    if (event.location === "unknown" && event.eventType !== "unknown_activity") {
      // Allowed, but the rule engine will flag it as incomplete information.
    }
    if (event.processingStatus === "ai_complete" && event.analysis?.source !== "gemini") {
      ctx.addIssue({
        code: "custom",
        path: ["processingStatus"],
        message: "ai_complete requires a Gemini-sourced analysis",
      });
    }
  });

export type EventMetadataInput = z.infer<typeof eventMetadataSchema>;

/** Compact event projection sent to bounded AI batch endpoints. */
export const eventDigestSchema = z
  .object({
    id: eventIdSchema,
    eventType: z.enum(EVENT_TYPES),
    occurredAt: isoDateTimeSchema,
    location: z.enum(EVENT_LOCATIONS),
    durationSeconds: z.number().int().min(0).max(86_400).optional(),
    availableDescription: z
      .string()
      .trim()
      .max(AI_LIMITS.maxEventDescriptionChars)
      .optional(),
    caregiverLabel: z.string().trim().max(40).optional(),
    packageDetected: z.boolean().optional(),
    doorbellPressed: z.boolean().optional(),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/*                                 Rule output                                */
/* -------------------------------------------------------------------------- */

export const ruleMatchSchema = z
  .object({
    id: z.enum(RULE_IDS),
    label: z.string().min(1).max(120),
    explanation: z.string().min(1).max(400),
    attentionEffect: z.enum(ATTENTION_LEVELS),
  })
  .strict();

export const ruleCheckSchema = z
  .object({
    id: z.enum(RULE_IDS),
    label: z.string().min(1).max(120),
    passed: z.boolean(),
    detail: z.string().min(1).max(400),
  })
  .strict();

export const ruleEvaluationSchema = z
  .object({
    matchedRules: z.array(ruleMatchSchema).max(12),
    evaluatedRules: z.array(ruleCheckSchema).max(16),
    attentionLevel: z.enum(ATTENTION_LEVELS),
    reasons: z.array(z.string().min(1).max(400)).min(1).max(8),
    recommendedActionCategory: z.enum(ACTION_CATEGORIES),
    notify: z.boolean(),
    missingInformation: z.array(z.string().min(1).max(200)).max(8),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/*                                 Settings                                   */
/* -------------------------------------------------------------------------- */

export const notificationPreferencesSchema = z
  .record(z.enum(EVENT_TYPES), z.boolean())
  .default(NOTIFICATION_DEFAULTS);

export const analysisSettingsSchema = z
  .object({
    prolongedPresenceThresholdSeconds: z
      .number()
      .int()
      .min(SETTINGS_LIMITS.prolongedPresenceMinSeconds)
      .max(SETTINGS_LIMITS.prolongedPresenceMaxSeconds),
    notificationPreferences: notificationPreferencesSchema,
    caregiverLabel: z
      .string()
      .trim()
      .min(SETTINGS_LIMITS.caregiverLabelMinLength)
      .max(SETTINGS_LIMITS.caregiverLabelMaxLength),
    caregiverCriteria: z.enum(CAREGIVER_CRITERIA),
    caregiverAlertsEnabled: z.boolean(),
    aiEnabled: z.boolean(),
  })
  .strict();

export const settingsSchema = z.object({
  prolongedPresenceThresholdSeconds: z
    .number()
    .int()
    .min(SETTINGS_LIMITS.prolongedPresenceMinSeconds)
    .max(SETTINGS_LIMITS.prolongedPresenceMaxSeconds)
    .default(DEFAULT_SETTINGS.prolongedPresenceThresholdSeconds),
  notificationPreferences: notificationPreferencesSchema,
  retentionLimit: z
    .number()
    .int()
    .min(SETTINGS_LIMITS.retentionMin)
    .max(SETTINGS_LIMITS.retentionMax)
    .default(DEFAULT_SETTINGS.retentionLimit),
  autoGenerateEnabled: z.boolean().default(DEFAULT_SETTINGS.autoGenerateEnabled),
  autoGenerateIntervalSeconds: z
    .number()
    .int()
    .min(SETTINGS_LIMITS.autoGenerationMinSeconds)
    .max(SETTINGS_LIMITS.autoGenerationMaxSeconds)
    .default(DEFAULT_SETTINGS.autoGenerateIntervalSeconds),
  caregiverLabel: z
    .string()
    .trim()
    .min(SETTINGS_LIMITS.caregiverLabelMinLength)
    .max(SETTINGS_LIMITS.caregiverLabelMaxLength)
    .default(DEFAULT_SETTINGS.caregiverLabel),
  caregiverCriteria: z
    .enum(CAREGIVER_CRITERIA)
    .default(DEFAULT_SETTINGS.caregiverCriteria),
  caregiverAlertsEnabled: z
    .boolean()
    .default(DEFAULT_SETTINGS.caregiverAlertsEnabled),
  aiEnabled: z.boolean().default(DEFAULT_SETTINGS.aiEnabled),
});

/** Parse settings, filling in defaults for missing fields. */
export function parseSettings(value: unknown) {
  const result = settingsSchema.safeParse(value);
  return result.success ? result.data : settingsSchema.parse({});
}

/* -------------------------------------------------------------------------- */
/*                              API requests                                  */
/* -------------------------------------------------------------------------- */

const maxRangeMs = 90 * 24 * 60 * 60 * 1000;

export const analyzeRequestSchema = z
  .object({
    event: ringCareEventSchema,
    contextEvents: z
      .array(eventDigestSchema)
      .max(AI_LIMITS.maxContextEventsForAnalyze)
      .default([]),
    settings: analysisSettingsSchema,
  })
  .strict();

export const summaryRequestSchema = z
  .object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    label: z.string().trim().min(1).max(80),
    events: z.array(eventDigestSchema).max(AI_LIMITS.maxEventsForSummary),
    settings: analysisSettingsSchema,
    timeZone: timeZoneSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const from = Date.parse(value.from);
    const to = Date.parse(value.to);
    if (to <= from) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Range end must be after range start" });
    }
    if (to - from > maxRangeMs) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "Range must not exceed 90 days" });
    }
  });

export const insightsRequestSchema = z
  .object({
    rangeLabel: z.enum(["today", "last_7_days", "last_30_days"]),
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    previousFrom: isoDateTimeSchema,
    previousTo: isoDateTimeSchema,
    events: z.array(eventDigestSchema).max(AI_LIMITS.maxEventsForInsights),
    settings: analysisSettingsSchema,
    timeZone: timeZoneSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const from = Date.parse(value.from);
    const to = Date.parse(value.to);
    const previousFrom = Date.parse(value.previousFrom);
    const previousTo = Date.parse(value.previousTo);
    if (!(to > from) || !(previousTo > previousFrom)) {
      ctx.addIssue({ code: "custom", message: "Ranges must have a positive duration" });
    }
    if (to - from > maxRangeMs || previousTo - previousFrom > maxRangeMs) {
      ctx.addIssue({ code: "custom", message: "Ranges must not exceed 90 days" });
    }
  });

export const searchRequestSchema = z
  .object({
    query: z.string().trim().min(2).max(AI_LIMITS.maxSearchQueryChars),
    clientNow: isoDateTimeSchema,
    aiEnabled: z.boolean().default(true),
  })
  .strict();

export const demoSeedRequestSchema = z
  .object({
    settings: analysisSettingsSchema,
  })
  .strict();

/* -------------------------------------------------------------------------- */
/*                             Model output schemas                           */
/* -------------------------------------------------------------------------- */

export const eventInterpretationModelSchema = z
  .object({
    summary: z.string().trim().min(1).max(600),
    eventInterpretation: z.string().trim().min(1).max(800),
    confidence: z.enum(CONFIDENCE_LEVELS),
    evidence: z.array(z.string().trim().min(1).max(240)).min(1).max(6),
    recommendedAction: z.string().trim().min(1).max(400),
    attentionLevel: z.enum(ATTENTION_LEVELS),
    uncertainty: z.array(z.string().trim().min(1).max(240)).max(5),
    limitations: z.array(z.string().trim().min(1).max(240)).max(5),
  })
  .strict();

export const summaryNarrativeModelSchema = z
  .object({
    headline: z.string().trim().min(1).max(160),
    mainActivity: z.string().trim().min(1).max(600),
    patterns: z.array(z.string().trim().min(1).max(240)).max(4),
    reviewItems: z.array(z.string().trim().min(1).max(240)).max(4),
    limitations: z.array(z.string().trim().min(1).max(240)).max(3),
  })
  .strict();

export const insightNarrativeModelSchema = z
  .object({
    headline: z.string().trim().min(1).max(180),
    observations: z.array(z.string().trim().min(1).max(240)).min(1).max(5),
    limitations: z.array(z.string().trim().min(1).max(240)).max(3),
  })
  .strict();

export const searchPlanModelSchema = z
  .object({
    intent: z.enum(SEARCH_INTENTS),
    eventTypes: z.array(z.enum(EVENT_TYPES)).max(EVENT_TYPES.length),
    locations: z.array(z.enum(EVENT_LOCATIONS)).max(EVENT_LOCATIONS.length),
    datePreset: z.enum(SEARCH_DATE_PRESETS),
    timeOfDay: z.enum([...TIME_OF_DAY, "any"]),
    minDurationSeconds: z.number().int().min(0).max(86_400),
    attentionLevels: z.array(z.enum(ATTENTION_LEVELS)).max(ATTENTION_LEVELS.length),
    caregiverMatchedOnly: z.boolean(),
    keyword: z.string().trim().max(80),
    sort: z.enum(SEARCH_SORTS),
    clarifyingQuestion: z.string().trim().max(240),
  })
  .strict();

export const searchPlanSchema = z
  .object({
    intent: z.enum(SEARCH_INTENTS),
    eventTypes: z.array(z.enum(EVENT_TYPES)),
    locations: z.array(z.enum(EVENT_LOCATIONS)),
    datePreset: z.enum(SEARCH_DATE_PRESETS),
    timeOfDay: z.enum(TIME_OF_DAY).nullable(),
    minDurationSeconds: z.number().int().min(0).max(86_400).nullable(),
    attentionLevels: z.array(z.enum(ATTENTION_LEVELS)),
    caregiverMatchedOnly: z.boolean(),
    keyword: z.string().trim().min(1).max(80).nullable(),
    sort: z.enum(SEARCH_SORTS),
    clarifyingQuestion: z.string().trim().min(1).max(240).nullable(),
  })
  .strict();

export const aiResponseMetaSchema = z
  .object({
    mode: z.enum(["gemini", "fallback"]),
    reason: z.enum(FALLBACK_REASONS).optional(),
    message: z.string().trim().max(320).optional(),
    detail: z.string().trim().max(200).optional(),
    model: safeModelNameSchema.optional(),
    cached: z.boolean(),
    generatedAt: isoDateTimeSchema,
  })
  .strict();

/* -------------------------------------------------------------------------- */
/*                              Helper utilities                              */
/* -------------------------------------------------------------------------- */

/** Semantic validation applied to *external* event inputs (size, time bounds). */
export function parseIncomingEvent(
  value: unknown,
  options: { now?: Date; maxAgeDays?: number } = {},
) {
  const result = ringCareEventSchema.safeParse(value);
  if (!result.success) return result;

  const now = (options.now ?? new Date()).getTime();
  const maxAgeDays = options.maxAgeDays ?? 400;
  const occurred = Date.parse(result.data.occurredAt);
  const created = Date.parse(result.data.createdAt);
  const issues: string[] = [];

  if (occurred > now + 5 * 60 * 1000) {
    issues.push("Event timestamp is more than 5 minutes in the future");
  }
  if (occurred < now - maxAgeDays * 24 * 60 * 60 * 1000) {
    issues.push(`Event timestamp is older than the ${maxAgeDays}-day input window`);
  }
  if (created > now + 5 * 60 * 1000) {
    issues.push("Creation timestamp is more than 5 minutes in the future");
  }
  if (result.data.source === "ring") {
    issues.push("Live Ring events are not supported yet; only simulated_ring is accepted");
  }
  if (
    result.data.availableDescription &&
    result.data.availableDescription.length > AI_LIMITS.maxEventDescriptionChars
  ) {
    issues.push("Description exceeds the maximum length");
  }

  if (issues.length > 0) {
    return {
      success: false as const,
      error: { message: issues[0]!, issues },
    };
  }
  return result;
}

export const aiConfigSchema = z.object({
  configured: z.boolean(),
  provider: z.literal("Google Gemini"),
  model: safeModelNameSchema.default(DEFAULT_GEMINI_MODEL),
  promptVersion: z.string(),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;
export type SearchPlanInput = z.infer<typeof searchPlanSchema>;
export type SearchPlanModelOutput = z.infer<typeof searchPlanModelSchema>;
export type EventDigestInput = z.infer<typeof eventDigestSchema>;
export type AnalysisSettings = z.infer<typeof analysisSettingsSchema>;

export const PROMPT_VERSION_VALUE = PROMPT_VERSION;

/* -------------------------------------------------------------------------- */
/*                          API response validation                           */
/* -------------------------------------------------------------------------- */

export const summaryNarrativeSchema = z
  .object({
    headline: z.string().trim().min(1).max(400),
    mainActivity: z.string().trim().min(1).max(1200),
    patterns: z.array(z.string().trim().max(400)).max(6),
    reviewItems: z.array(z.string().trim().max(400)).max(6),
    limitations: z.array(z.string().trim().max(400)).max(6),
    source: z.enum(AI_SOURCES),
    model: safeModelNameSchema.optional(),
    notice: z.string().trim().max(500).optional(),
  })
  .strict();

export const summaryFactsSchema = z
  .object({
    range: z.object({
      from: isoDateTimeSchema,
      to: isoDateTimeSchema,
      label: z.string().min(1).max(80),
    }),
    consideredEvents: z.number().int().nonnegative(),
    counts: z.object({
      total: z.number().int().nonnegative(),
      byType: z.record(z.enum(EVENT_TYPES), z.number().int().nonnegative()),
      routine: z.number().int().nonnegative(),
      review: z.number().int().nonnegative(),
      highAttention: z.number().int().nonnegative(),
      uncertain: z.number().int().nonnegative(),
      deliveries: z.number().int().nonnegative(),
      caregiverArrivals: z.number().int().nonnegative(),
      unmatchedCaregiverArrivals: z.number().int().nonnegative(),
    }),
    busiestHour: z
      .object({ label: z.string().max(80), count: z.number().int().nonnegative() })
      .nullable(),
    topLocation: z
      .object({
        location: z.string().max(40),
        label: z.string().max(80),
        count: z.number().int().nonnegative(),
      })
      .nullable(),
    reviewSamples: z.array(
      z.object({
        id: z.string().max(80),
        title: z.string().max(240),
        reason: z.string().max(400),
        attentionLevel: z.enum(ATTENTION_LEVELS),
        occurredAt: isoDateTimeSchema,
      }),
    ),
    notes: z.array(z.string().max(400)).max(8),
  })
  .strict();

export const dailySummarySchema = z
  .object({
    facts: summaryFactsSchema,
    narrative: summaryNarrativeSchema,
    meta: aiResponseMetaSchema,
    generatedAt: isoDateTimeSchema,
  })
  .strict();

export const insightComparisonSchema = z
  .object({
    id: z.string().min(1).max(60),
    label: z.string().min(1).max(120),
    current: z.number(),
    previous: z.number(),
    delta: z.number(),
    direction: z.enum(["up", "down", "flat"]),
    sentence: z.string().min(1).max(400),
  })
  .strict();

export const insightFactsSchema = z
  .object({
    rangeLabel: z.enum(["today", "last_7_days", "last_30_days"]),
    rangeLabelText: z.string().max(60),
    current: z.object({
      from: isoDateTimeSchema,
      to: isoDateTimeSchema,
      total: z.number().int().nonnegative(),
      routine: z.number().int().nonnegative(),
      review: z.number().int().nonnegative(),
      highAttention: z.number().int().nonnegative(),
      uncertain: z.number().int().nonnegative(),
      deliveries: z.number().int().nonnegative(),
      caregiverArrivals: z.number().int().nonnegative(),
      byType: z.record(z.enum(EVENT_TYPES), z.number().int().nonnegative()),
      topLocation: z
        .object({ label: z.string().max(80), count: z.number().int().nonnegative() })
        .nullable(),
      busiestHour: z
        .object({ label: z.string().max(80), count: z.number().int().nonnegative() })
        .nullable(),
    }),
    previous: z.object({
      from: isoDateTimeSchema,
      to: isoDateTimeSchema,
      total: z.number().int().nonnegative(),
      deliveries: z.number().int().nonnegative(),
      caregiverArrivals: z.number().int().nonnegative(),
      review: z.number().int().nonnegative(),
    }),
    comparisons: z.array(insightComparisonSchema),
    limitations: z.array(z.string().max(400)).max(8),
  })
  .strict();

export const insightNarrativeSchema = z
  .object({
    headline: z.string().trim().min(1).max(400),
    observations: z.array(z.string().trim().max(400)).max(8),
    limitations: z.array(z.string().trim().max(400)).max(8),
    source: z.enum(AI_SOURCES),
    model: safeModelNameSchema.optional(),
    notice: z.string().trim().max(500).optional(),
  })
  .strict();

export const activityInsightSchema = z
  .object({
    facts: insightFactsSchema,
    narrative: insightNarrativeSchema,
    meta: aiResponseMetaSchema,
    generatedAt: isoDateTimeSchema,
  })
  .strict();

export const analyzeResponseSchema = z
  .object({
    ok: z.literal(true),
    analysis: aiAnalysisSchema,
    meta: aiResponseMetaSchema,
    evaluation: ruleEvaluationSchema.optional(),
  })
  .strict();

export const summaryResponseSchema = z
  .object({ ok: z.literal(true), summary: dailySummarySchema })
  .strict();

export const insightsResponseSchema = z
  .object({ ok: z.literal(true), insight: activityInsightSchema })
  .strict();

export const searchResponseSchema = z
  .object({
    ok: z.literal(true),
    plan: searchPlanSchema,
    interpretedBy: z.enum(["gemini", "rules"]),
    meta: aiResponseMetaSchema,
  })
  .strict();

export const demoSeedResponseSchema = z
  .object({
    ok: z.literal(true),
    events: z.array(ringCareEventSchema).max(500),
    generatedAt: isoDateTimeSchema,
  })
  .passthrough();

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    ai: z.object({
      configured: z.boolean(),
      provider: z.literal("Google Gemini"),
      model: safeModelNameSchema,
      modelLabel: z.string().trim().max(80).default(GEMINI_MODEL_LABEL),
      promptVersion: z.string(),
      credentialsVerified: z.boolean(),
      verificationStatus: z.enum(AI_VERIFICATION_STATUSES),
      verificationMessage: z.string().trim().max(360).optional(),
      keySource: z.enum(["GEMINI_API_KEY", "GOOGLE_API_KEY"]).nullable().optional(),
      modelNotice: z.string().trim().max(200).optional(),
      latencyMs: z.number().int().min(0).optional(),
    }),
    checkedAt: isoDateTimeSchema,
  })
  .passthrough();
