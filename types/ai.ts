import type { AttentionLevel, EventType, FallbackReason } from "@/lib/constants/events";

export interface AiResponseMeta {
  mode: "groq" | "fallback";
  reason?: FallbackReason;
  message?: string;
  /** Short, safe provider diagnostic (HTTP status / schema issue). No secrets. */
  detail?: string;
  model?: string;
  cached: boolean;
  generatedAt: string;
}

export interface AiAnalysisMeta {
  mode: "groq" | "fallback";
  reason?: FallbackReason;
  message?: string;
  detail?: string;
  model?: string;
  cached: boolean;
  generatedAt: string;
}

export interface SummaryFacts {
  range: { from: string; to: string; label: string };
  consideredEvents: number;
  counts: {
    total: number;
    byType: Record<EventType, number>;
    routine: number;
    review: number;
    highAttention: number;
    uncertain: number;
    deliveries: number;
    caregiverArrivals: number;
    unmatchedCaregiverArrivals: number;
  };
  busiestHour: { label: string; count: number } | null;
  topLocation: { location: string; label: string; count: number } | null;
  reviewSamples: Array<{
    id: string;
    title: string;
    reason: string;
    attentionLevel: AttentionLevel;
    occurredAt: string;
  }>;
  notes: string[];
}

export interface SummaryNarrative {
  headline: string;
  mainActivity: string;
  patterns: string[];
  reviewItems: string[];
  limitations: string[];
  source: "groq" | "fallback";
  model?: string;
  notice?: string;
}

export interface DailySummary {
  facts: SummaryFacts;
  narrative: SummaryNarrative;
  meta: AiResponseMeta;
  generatedAt: string;
}

export interface InsightComparison {
  id: string;
  label: string;
  current: number;
  previous: number;
  delta: number;
  direction: "up" | "down" | "flat";
  sentence: string;
}

export interface InsightFacts {
  rangeLabel: "today" | "last_7_days" | "last_30_days";
  rangeLabelText: string;
  current: {
    from: string;
    to: string;
    total: number;
    routine: number;
    review: number;
    highAttention: number;
    uncertain: number;
    deliveries: number;
    caregiverArrivals: number;
    byType: Record<EventType, number>;
    topLocation: { label: string; count: number } | null;
    busiestHour: { label: string; count: number } | null;
  };
  previous: {
    from: string;
    to: string;
    total: number;
    deliveries: number;
    caregiverArrivals: number;
    review: number;
  };
  comparisons: InsightComparison[];
  limitations: string[];
}

export interface InsightNarrative {
  headline: string;
  observations: string[];
  limitations: string[];
  source: "groq" | "fallback";
  model?: string;
  notice?: string;
}

export interface ActivityInsight {
  facts: InsightFacts;
  narrative: InsightNarrative;
  meta: AiResponseMeta;
  generatedAt: string;
}

export type AiHealthVerification =
  | "ok"
  | "not_configured"
  | "invalid_key"
  | "model_unavailable"
  | "quota"
  | "unreachable"
  | "error"
  | "unverified";

export interface AiHealth {
  configured: boolean;
  provider: "Groq";
  model: string;
  modelLabel: string;
  promptVersion: string;
  /** True only when Groq accepted this key during verification. */
  credentialsVerified: boolean;
  verificationStatus: AiHealthVerification;
  verificationMessage?: string;
  /** Which server-side env var supplied the key (name only). */
  keySource?: "GROQ_API_KEY" | null;
  /** Set when GROQ_MODEL was invalid and the default model is in use. */
  modelNotice?: string;
  latencyMs?: number;
  checkedAt: string;
}
