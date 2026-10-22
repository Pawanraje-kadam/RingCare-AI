import {
  ATTENTION_LEVELS,
  CONFIDENCE_LEVELS,
  EVENT_LOCATIONS,
  EVENT_TYPES,
} from "@/lib/constants/events";
import {
  SEARCH_DATE_PRESETS,
  SEARCH_INTENTS,
  SEARCH_SORTS,
  TIME_OF_DAY,
} from "@/lib/constants/search";

/**
 * Constrained output schemas (OpenAPI subset) passed to Gemini.
 * Zod validation runs again server-side before anything is rendered.
 */

export const eventInterpretationResponseSchema: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    summary: {
      type: "STRING",
      description: "One calm sentence describing what was recorded.",
    },
    eventInterpretation: {
      type: "STRING",
      description:
        "Two or three sentences separating supplied facts from cautious interpretation.",
    },
    confidence: {
      type: "STRING",
      enum: [...CONFIDENCE_LEVELS],
      description: "Confidence based only on the supplied structured data.",
    },
    evidence: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Short factual evidence items drawn only from the supplied fields.",
    },
    recommendedAction: {
      type: "STRING",
      description: "A proportionate next step, or no action if appropriate.",
    },
    attentionLevel: {
      type: "STRING",
      enum: [...ATTENTION_LEVELS],
      description:
        "Must exactly equal the deterministic rule attention level supplied in the input.",
    },
    uncertainty: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Unknown or ambiguous details.",
    },
    limitations: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Limits of the data and analysis.",
    },
  },
  required: [
    "summary",
    "eventInterpretation",
    "confidence",
    "evidence",
    "recommendedAction",
    "attentionLevel",
    "uncertainty",
    "limitations",
  ],
  propertyOrdering: [
    "summary",
    "eventInterpretation",
    "confidence",
    "evidence",
    "recommendedAction",
    "attentionLevel",
    "uncertainty",
    "limitations",
  ],
};

export const summaryResponseSchema: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING", description: "Short neutral headline." },
    mainActivity: {
      type: "STRING",
      description: "Two or three sentences describing recorded activity using only facts.",
    },
    patterns: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Notable patterns supported by the supplied facts.",
    },
    reviewItems: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Events that may warrant review and the reason.",
    },
    limitations: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Limits, including partial or simulated records.",
    },
  },
  required: ["headline", "mainActivity", "patterns", "reviewItems", "limitations"],
  propertyOrdering: ["headline", "mainActivity", "patterns", "reviewItems", "limitations"],
};

export const insightResponseSchema: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING", description: "Short neutral headline." },
    observations: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Observations grounded only in the supplied comparison facts.",
    },
    limitations: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Limits of the comparison and demo data.",
    },
  },
  required: ["headline", "observations", "limitations"],
  propertyOrdering: ["headline", "observations", "limitations"],
};

export const searchPlanResponseSchema: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    intent: { type: "STRING", enum: [...SEARCH_INTENTS] },
    eventTypes: {
      type: "ARRAY",
      items: { type: "STRING", enum: [...EVENT_TYPES] },
    },
    locations: {
      type: "ARRAY",
      items: { type: "STRING", enum: [...EVENT_LOCATIONS] },
    },
    datePreset: { type: "STRING", enum: [...SEARCH_DATE_PRESETS] },
    timeOfDay: { type: "STRING", enum: [...TIME_OF_DAY, "any"] },
    minDurationSeconds: { type: "INTEGER", minimum: 0, maximum: 86_400 },
    attentionLevels: {
      type: "ARRAY",
      items: { type: "STRING", enum: [...ATTENTION_LEVELS] },
    },
    caregiverMatchedOnly: { type: "BOOLEAN" },
    keyword: { type: "STRING", description: "Optional quoted keyword; empty if none." },
    sort: { type: "STRING", enum: [...SEARCH_SORTS] },
    clarifyingQuestion: {
      type: "STRING",
      description: "A short question when intent is clarify; empty otherwise.",
    },
  },
  required: [
    "intent",
    "eventTypes",
    "locations",
    "datePreset",
    "timeOfDay",
    "minDurationSeconds",
    "attentionLevels",
    "caregiverMatchedOnly",
    "keyword",
    "sort",
    "clarifyingQuestion",
  ],
  propertyOrdering: [
    "intent",
    "eventTypes",
    "locations",
    "datePreset",
    "timeOfDay",
    "minDurationSeconds",
    "attentionLevels",
    "caregiverMatchedOnly",
    "keyword",
    "sort",
    "clarifyingQuestion",
  ],
};
