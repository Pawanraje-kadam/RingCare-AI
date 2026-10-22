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
 * Schema hints for Groq's JSON mode.
 *
 * Groq's `response_format: { type: "json_object" }` guarantees syntactically
 * valid JSON but does not enforce a JSON Schema, so the exact shape and enum
 * values are described in the prompt and then *enforced server-side with Zod*
 * before anything is used or rendered. These hints are appended to every user
 * prompt so the model has no excuse to invent fields or enum values.
 */

const enumList = (values: readonly string[]) => values.join(" | ");

export const eventInterpretationSchemaHint = `

JSON SHAPE — return exactly these keys and no others:
{
  "summary": string (one calm sentence, max 300 chars),
  "eventInterpretation": string (2–3 sentences separating supplied facts from cautious interpretation),
  "confidence": ${enumList(CONFIDENCE_LEVELS)},
  "evidence": string[] (1–6 short factual items drawn only from the supplied fields),
  "recommendedAction": string (a proportionate next step, or no action),
  "attentionLevel": ${enumList(ATTENTION_LEVELS)} (must equal the supplied rule_attention_level exactly),
  "uncertainty": string[] (0–6 unknown or ambiguous details),
  "limitations": string[] (0–6 limits of the data)
}`;

export const summarySchemaHint = `

JSON SHAPE — return exactly these keys and no others:
{
  "headline": string (short, neutral, max 200 chars),
  "mainActivity": string (2–3 sentences using only the supplied facts),
  "patterns": string[] (0–5 patterns supported by the facts),
  "reviewItems": string[] (0–5 events that may warrant review, with the reason),
  "limitations": string[] (1–5 limits, including partial or simulated records)
}`;

export const insightSchemaHint = `

JSON SHAPE — return exactly these keys and no others:
{
  "headline": string (short, neutral, max 200 chars),
  "observations": string[] (1–5 observations grounded only in the supplied comparison facts),
  "limitations": string[] (1–4 limits of the comparison and demo data)
}`;

export const searchPlanSchemaHint = `

JSON SHAPE — return exactly these keys and no others:
{
  "intent": ${enumList(SEARCH_INTENTS)},
  "eventTypes": (${enumList(EVENT_TYPES)})[] (empty array if not specified),
  "locations": (${enumList(EVENT_LOCATIONS)})[] (empty array if not specified),
  "datePreset": ${enumList(SEARCH_DATE_PRESETS)},
  "timeOfDay": ${enumList([...TIME_OF_DAY, "any"])},
  "minDurationSeconds": integer 0–86400 (0 when no duration filter is requested),
  "attentionLevels": (${enumList(ATTENTION_LEVELS)})[] (empty array if not specified),
  "caregiverMatchedOnly": boolean,
  "keyword": string (a short literal keyword, or "" when none),
  "sort": ${enumList(SEARCH_SORTS)},
  "clarifyingQuestion": string (a short question when intent is "clarify", otherwise "")
}`;
