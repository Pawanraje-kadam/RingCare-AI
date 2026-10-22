/**
 * Domain vocabulary for RingCare AI.
 *
 * Event types are *input metadata*. They are never treated as proof of a
 * person's identity, intent, or danger.
 */

export const EVENT_TYPES = [
  "person_detected",
  "delivery_related",
  "doorbell_pressed",
  "caregiver_arrival",
  "prolonged_presence",
  "motion_detected",
  "unknown_activity",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LOCATIONS = [
  "front_door",
  "porch",
  "driveway",
  "side_gate",
  "back_yard",
  "mailbox",
  "unknown",
] as const;

export type EventLocation = (typeof EVENT_LOCATIONS)[number];

export const EVENT_SOURCES = ["simulated_ring", "ring"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const PROCESSING_STATUSES = [
  "received",
  "rules_evaluated",
  "ai_complete",
  "ai_fallback",
  "ai_error",
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const ATTENTION_LEVELS = [
  "routine",
  "review",
  "high_attention",
  "unknown",
] as const;
export type AttentionLevel = (typeof ATTENTION_LEVELS)[number];

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const AI_SOURCES = ["groq", "fallback"] as const;
export type AiSource = (typeof AI_SOURCES)[number];

export const ACTION_CATEGORIES = [
  "no_action",
  "check_delivery",
  "verify_caregiver_arrival",
  "review_event",
  "review_if_needed",
] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export const CAREGIVER_CRITERIA = [
  "event_type_and_label",
  "event_type_only",
] as const;
export type CaregiverCriteria = (typeof CAREGIVER_CRITERIA)[number];

export const FALLBACK_REASONS = [
  "ai_disabled",
  "missing_api_key",
  "timeout",
  "rate_limited",
  "provider_error",
  "invalid_response",
  "unsafe_response",
  "network_error",
  "unknown",
] as const;
export type FallbackReason = (typeof FALLBACK_REASONS)[number];

export const RULE_IDS = [
  "delivery_routine",
  "caregiver_arrival_match",
  "caregiver_arrival_unmatched",
  "caregiver_alerts_disabled",
  "doorbell_press",
  "person_detected",
  "motion_routine",
  "prolonged_presence_threshold",
  "prolonged_presence_below_threshold",
  "repeated_visits",
  "high_attention_combination",
  "incomplete_information",
  "notification_preference_disabled",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** Presentation metadata shared by the UI and deterministic copy. */
export const EVENT_TYPE_META: Record<
  EventType,
  {
    label: string;
    shortLabel: string;
    description: string;
    /** Default in-app notification preference. Motion is intentionally quiet. */
    notifyByDefault: boolean;
  }
> = {
  person_detected: {
    label: "Person detected",
    shortLabel: "Person",
    description:
      "The event source reported a person-related detection. No identity is implied.",
    notifyByDefault: true,
  },
  delivery_related: {
    label: "Delivery-related",
    shortLabel: "Delivery",
    description:
      "The event source labelled this event as delivery-related. A completed delivery is not confirmed.",
    notifyByDefault: true,
  },
  doorbell_pressed: {
    label: "Doorbell pressed",
    shortLabel: "Doorbell",
    description: "The doorbell was reported as pressed.",
    notifyByDefault: true,
  },
  caregiver_arrival: {
    label: "Caregiver arrival",
    shortLabel: "Caregiver",
    description:
      "An arrival event carrying caregiver metadata. Identity is confirmed only by a configured rule match.",
    notifyByDefault: true,
  },
  prolonged_presence: {
    label: "Prolonged presence",
    shortLabel: "Presence",
    description:
      "Presence near a location lasted for the reported duration. Duration alone is not evidence of intent.",
    notifyByDefault: true,
  },
  motion_detected: {
    label: "Motion detected",
    shortLabel: "Motion",
    description: "Motion was reported. This does not identify who or what moved.",
    notifyByDefault: false,
  },
  unknown_activity: {
    label: "Unknown activity",
    shortLabel: "Unknown",
    description:
      "The available information is insufficient to classify what was recorded.",
    notifyByDefault: true,
  },
};

export const EVENT_LOCATION_META: Record<EventLocation, string> = {
  front_door: "Front door",
  porch: "Porch",
  driveway: "Driveway",
  side_gate: "Side gate",
  back_yard: "Back yard",
  mailbox: "Mailbox",
  unknown: "Unknown location",
};

export const ATTENTION_META: Record<
  AttentionLevel,
  {
    label: string;
    shortLabel: string;
    description: string;
    /** Higher means it appears earlier in review queues. */
    severity: number;
  }
> = {
  routine: {
    label: "Routine",
    shortLabel: "Routine",
    description:
      "The recorded information matches a routine, non-urgent pattern. This is not a guarantee about what occurred.",
    severity: 0,
  },
  unknown: {
    label: "Uncertain",
    shortLabel: "Uncertain",
    description:
      "Not enough information is available to classify this event confidently.",
    severity: 1,
  },
  review: {
    label: "Review suggested",
    shortLabel: "Review",
    description:
      "This event may be worth checking against your own expectations. It is not a threat assessment.",
    severity: 2,
  },
  high_attention: {
    label: "Needs attention",
    shortLabel: "Attention",
    description:
      "One or more configured rules marked this event as worth closer attention. This is not a validated threat detection.",
    severity: 3,
  },
};

export const PROCESSING_STATUS_META: Record<
  ProcessingStatus,
  { label: string; description: string }
> = {
  received: {
    label: "Received",
    description: "The event has been validated and stored, but not yet explained.",
  },
  rules_evaluated: {
    label: "Rules evaluated",
    description: "Deterministic rules have evaluated this event.",
  },
  ai_complete: {
    label: "AI explanation ready",
    description: "A Groq-generated explanation is attached to this event.",
  },
  ai_fallback: {
    label: "Rules-based explanation",
    description:
      "A deterministic explanation is attached because Groq was unavailable or declined.",
  },
  ai_error: {
    label: "Analysis error",
    description: "The last analysis attempt failed. Raw event data is still available.",
  },
};

export const DEFAULT_CAREGIVER_LABEL = "Maya";
export const DEFAULT_PROLONGED_PRESENCE_SECONDS = 60;
