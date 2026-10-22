import type { AttentionLevel, EventType, FallbackReason } from "@/lib/constants/events";

export interface AiResponseMeta {
  mode: "gemini" | "fallback";
  reason?: FallbackReason;
  message?: string;
  model?: string;
  cached: boolean;
  generatedAt: string;
}

export interface AiAnalysisMeta {
  mode: "gemini" | "fallback";
  reason?: FallbackReason;
  message?: string;
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
  source: "gemini" | "fallback";
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
  source: "gemini" | "fallback";
  model?: string;
  notice?: string;
}

export interface ActivityInsight {
  facts: InsightFacts;
  narrative: InsightNarrative;
  meta: AiResponseMeta;
  generatedAt: string;
}

export interface AiHealth {
  configured: boolean;
  provider: "Google Gemini";
  model: string;
  promptVersion: string;
  checkedAt: string;
}
