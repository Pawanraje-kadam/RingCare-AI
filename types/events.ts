import type { z } from "zod";
import type {
  aiAnalysisSchema,
  analysisErrorSchema,
  eventMetadataSchema,
  ringCareEventSchema,
} from "@/lib/validation/schemas";

export type {
  EventType,
  EventLocation,
  EventSource,
  ProcessingStatus,
  AttentionLevel,
  ConfidenceLevel,
  AiSource,
  ActionCategory,
  CaregiverCriteria,
  FallbackReason,
  RuleId,
} from "@/lib/constants/events";

export type EventMetadata = z.infer<typeof eventMetadataSchema>;
export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;
export type AnalysisError = z.infer<typeof analysisErrorSchema>;
export type RingCareEvent = z.infer<typeof ringCareEventSchema>;

/** The subset of an event the deterministic rule engine needs. */
export interface RuleEvent {
  id: string;
  eventType: RingCareEvent["eventType"];
  occurredAt: string;
  location: RingCareEvent["location"];
  durationSeconds?: number;
  availableDescription?: string;
  availableMetadata?: EventMetadata;
}

export interface RuleMatch {
  id: import("@/lib/constants/events").RuleId;
  label: string;
  explanation: string;
  attentionEffect: import("@/lib/constants/events").AttentionLevel;
}

export interface RuleCheck {
  id: import("@/lib/constants/events").RuleId;
  label: string;
  passed: boolean;
  detail: string;
}

export interface RuleEvaluation {
  matchedRules: RuleMatch[];
  evaluatedRules: RuleCheck[];
  attentionLevel: import("@/lib/constants/events").AttentionLevel;
  reasons: string[];
  recommendedActionCategory: import("@/lib/constants/events").ActionCategory;
  notify: boolean;
  missingInformation: string[];
}

export interface EventDigest {
  id: string;
  eventType: RingCareEvent["eventType"];
  occurredAt: string;
  location: RingCareEvent["location"];
  durationSeconds?: number;
  availableDescription?: string;
  caregiverLabel?: string;
  packageDetected?: boolean;
  doorbellPressed?: boolean;
}

export interface EventWithEvaluation {
  event: RingCareEvent;
  evaluation: RuleEvaluation;
}
