import {
  ATTENTION_META,
  EVENT_LOCATION_META,
  EVENT_TYPE_META,
  type ActionCategory,
  type AttentionLevel,
  type CaregiverCriteria,
  type EventType,
  type RuleId,
} from "@/lib/constants/events";
import type {
  RuleCheck,
  RuleEvent,
  RuleEvaluation,
  RuleMatch,
} from "@/types/events";

/**
 * Deterministic rule engine.
 *
 * Design principles:
 *  - Only objective, configured conditions are evaluated.
 *  - The engine never infers identity, intent, danger, or guilt.
 *  - Duration, familiarity, and event labels are treated as input metadata,
 *    not proof of anything.
 *  - Every match includes a plain-language reason for transparency.
 */

export interface RuleSettings {
  prolongedPresenceThresholdSeconds: number;
  notificationPreferences: Record<EventType, boolean>;
  caregiverLabel: string;
  caregiverCriteria: CaregiverCriteria;
  caregiverAlertsEnabled: boolean;
}

export const REPEATED_VISIT_WINDOW_MINUTES = 15;
export const MIN_RELATED_VISITS = 2;

const REPEAT_ELIGIBLE_TYPES: EventType[] = [
  "person_detected",
  "prolonged_presence",
  "doorbell_pressed",
  "unknown_activity",
];

export function normalizeLabel(value: string | undefined | null): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

export function caregiverLabelMatches(event: RuleEvent, settings: RuleSettings): boolean {
  if (event.eventType !== "caregiver_arrival") return false;
  if (settings.caregiverCriteria === "event_type_only") return true;
  const supplied = normalizeLabel(event.availableMetadata?.caregiverLabel);
  const configured = normalizeLabel(settings.caregiverLabel);
  return supplied.length > 0 && supplied === configured;
}

/**
 * Other person-related events near the same location. Used to explain clusters;
 * it is not a measure of suspicion.
 */
export function findRelatedVisits(
  event: RuleEvent,
  relatedEvents: RuleEvent[],
  windowMinutes = REPEATED_VISIT_WINDOW_MINUTES,
): RuleEvent[] {
  if (!REPEAT_ELIGIBLE_TYPES.includes(event.eventType)) return [];
  const eventTime = Date.parse(event.occurredAt);
  if (Number.isNaN(eventTime)) return [];
  const windowMs = windowMinutes * 60_000;

  return relatedEvents.filter((candidate) => {
    if (candidate.id === event.id) return false;
    if (candidate.location !== event.location) return false;
    if (!REPEAT_ELIGIBLE_TYPES.includes(candidate.eventType)) return false;
    const candidateTime = Date.parse(candidate.occurredAt);
    if (Number.isNaN(candidateTime)) return false;
    return Math.abs(candidateTime - eventTime) <= windowMs;
  });
}

function hasMetadata(event: RuleEvent): boolean {
  return Boolean(event.availableMetadata && Object.keys(event.availableMetadata).length > 0);
}

function attentionFromMatches(matches: RuleMatch[], fallback: AttentionLevel): AttentionLevel {
  let level = fallback;
  for (const match of matches) {
    if (ATTENTION_META[match.attentionEffect].severity > ATTENTION_META[level].severity) {
      level = match.attentionEffect;
    }
  }
  return level;
}

export function evaluateEvent(
  event: RuleEvent,
  settings: RuleSettings,
  relatedEvents: RuleEvent[] = [],
): RuleEvaluation {
  const matches: RuleMatch[] = [];
  const checks: RuleCheck[] = [];
  const missingInformation: string[] = [];
  const threshold = settings.prolongedPresenceThresholdSeconds;
  const typeMeta = EVENT_TYPE_META[event.eventType];
  const locationLabel = EVENT_LOCATION_META[event.location];

  const addMatch = (
    id: RuleId,
    label: string,
    explanation: string,
    attentionEffect: AttentionLevel,
  ) => {
    matches.push({ id, label, explanation, attentionEffect });
  };
  const addCheck = (id: RuleId, label: string, passed: boolean, detail: string) => {
    checks.push({ id, label, passed, detail });
  };
  const addMissing = (item: string) => {
    if (!missingInformation.includes(item)) missingInformation.push(item);
  };

  /* ------------------------------- metadata ------------------------------ */
  if (!event.availableDescription) {
    addMissing("No textual description was supplied.");
  }
  if (!hasMetadata(event)) {
    addMissing("No supporting metadata was supplied.");
  }
  if (event.location === "unknown") {
    addMissing("A precise location was not reported.");
  }
  if (event.durationSeconds === undefined) {
    addMissing("A duration was not reported.");
  }

  /* ------------------------------- delivery ------------------------------ */
  const isDelivery = event.eventType === "delivery_related";
  addCheck(
    "delivery_routine",
    "Delivery-related label",
    isDelivery,
    isDelivery
      ? "The event source labelled this event as delivery-related."
      : "The event is not labelled delivery-related.",
  );
  if (isDelivery) {
    const packageNote = event.availableMetadata?.packageDetected
      ? " The source also reported a package detection, which is input metadata rather than visual confirmation."
      : "";
    addMatch(
      "delivery_routine",
      "Delivery-related activity",
      `The event source labelled this activity as delivery-related. A completed delivery is not confirmed.${packageNote}`,
      "routine",
    );
  }

  /* ------------------------------- caregiver ----------------------------- */
  const isCaregiver = event.eventType === "caregiver_arrival";
  const caregiverMatched = caregiverLabelMatches(event, settings);
  addCheck(
    "caregiver_arrival_match",
    "Caregiver arrival rule",
    caregiverMatched,
    !isCaregiver
      ? "The event is not a caregiver-arrival event."
      : caregiverMatched
        ? settings.caregiverCriteria === "event_type_and_label"
          ? `The supplied caregiver label matches your configured label “${settings.caregiverLabel}”.`
          : "The event type matches your caregiver rule. The rule is configured to match on event type only."
        : "The event did not satisfy your configured caregiver-arrival criteria.",
  );

  let caregiverAlertsMuted = false;
  if (isCaregiver) {
    if (caregiverMatched) {
      const suppliedLabel = event.availableMetadata?.caregiverLabel;
      const labelMismatchNote =
        settings.caregiverCriteria === "event_type_only" &&
        suppliedLabel &&
        normalizeLabel(suppliedLabel) !== normalizeLabel(settings.caregiverLabel)
          ? ` The supplied label “${suppliedLabel}” differs from your configured label “${settings.caregiverLabel}”; it is metadata, not verified identity.`
          : "";
      addMatch(
        "caregiver_arrival_match",
        "Caregiver arrival rule matched",
        `This arrival met your configured caregiver rule (${settings.caregiverCriteria === "event_type_and_label" ? "event type and caregiver label" : "event type only"}). A rule match is not independently verified identity.${labelMismatchNote}`,
        "routine",
      );
      if (!settings.caregiverAlertsEnabled) {
        caregiverAlertsMuted = true;
        addMatch(
          "caregiver_alerts_disabled",
          "Caregiver alerts disabled",
          "Caregiver-related alerts are turned off in Settings.",
          "routine",
        );
      }
    } else {
      const suppliedLabel = event.availableMetadata?.caregiverLabel;
      if (!suppliedLabel) {
        addMissing("No caregiver label was included in the event metadata.");
      } else {
        addMissing("The supplied caregiver label does not match the configured label.");
      }
      addMatch(
        "caregiver_arrival_unmatched",
        "Caregiver arrival could not be confirmed",
        suppliedLabel
          ? `The event includes the label “${suppliedLabel}”, which does not match your configured caregiver label “${settings.caregiverLabel}”. No identity is inferred.`
          : "The event is a caregiver-arrival type but does not include a caregiver label, so your caregiver rule could not be confirmed.",
        "review",
      );
    }
  } else {
    addCheck(
      "caregiver_arrival_unmatched",
      "Unconfirmed caregiver arrival",
      false,
      "Not applicable: the event is not a caregiver arrival.",
    );
  }

  /* -------------------------------- doorbell ----------------------------- */
  const isDoorbell = event.eventType === "doorbell_pressed";
  addCheck(
    "doorbell_press",
    "Doorbell press",
    isDoorbell,
    isDoorbell
      ? "The event reports a doorbell press."
      : event.availableMetadata?.doorbellPressed
        ? "The metadata reports a doorbell press alongside another event type."
        : "No doorbell press was reported.",
  );
  if (isDoorbell) {
    addMatch(
      "doorbell_press",
      "Doorbell pressed",
      "The doorbell was reported as pressed. The available data does not describe who pressed it.",
      "review",
    );
    addMissing("Identity is not included in the available event data.");
  }

  /* ----------------------------- person detected ------------------------- */
  const isPerson = event.eventType === "person_detected";
  addCheck(
    "person_detected",
    "Person-related detection",
    isPerson,
    isPerson
      ? "The event source reported a person-related detection."
      : "No person-related detection was reported.",
  );
  if (isPerson) {
    addMatch(
      "person_detected",
      "Person-related activity",
      "A person-related detection was reported. The event does not include identity, appearance, or intent information.",
      "review",
    );
    addMissing("Identity is not included in the available event data.");
  }

  /* -------------------------------- motion ------------------------------- */
  const isMotion = event.eventType === "motion_detected";
  addCheck(
    "motion_routine",
    "Motion-only activity",
    isMotion,
    isMotion ? "Motion was reported without a person or delivery label." : "Not applicable.",
  );
  if (isMotion) {
    addMatch(
      "motion_routine",
      "Motion recorded",
      "Motion was reported. Motion detection does not identify who or what moved.",
      "routine",
    );
  }

  /* ---------------------------- duration rules --------------------------- */
  const duration = event.durationSeconds;
  const thresholdMet = duration !== undefined && duration >= threshold;
  addCheck(
    "prolonged_presence_threshold",
    "Prolonged-presence threshold",
    thresholdMet,
    duration === undefined
      ? "No duration was reported, so your threshold could not be evaluated."
      : thresholdMet
        ? `Reported duration was ${duration} seconds, at or above your ${threshold}-second threshold.`
        : `Reported duration was ${duration} seconds, below your ${threshold}-second threshold.`,
  );

  if (thresholdMet) {
    addMatch(
      "prolonged_presence_threshold",
      "Duration threshold met",
      `The recorded duration of ${duration} seconds met or exceeded your configured ${threshold}-second threshold. Duration alone is not evidence of intent.`,
      "review",
    );
    addMissing("Intent cannot be determined from presence duration.");
  } else if (event.eventType === "prolonged_presence" && duration === undefined) {
    addMatch(
      "incomplete_information",
      "Incomplete presence information",
      "This event is labelled as prolonged presence but does not include a duration, so your threshold cannot be evaluated.",
      "unknown",
    );
  } else if (duration !== undefined) {
    addMatch(
      "prolonged_presence_below_threshold",
      "Duration below threshold",
      `The recorded duration was below your configured ${threshold}-second threshold.`,
      "routine",
    );
  }

  /* ---------------------------- repeated visits -------------------------- */
  const relatedVisits = findRelatedVisits(event, relatedEvents);
  const repeatedVisits = relatedVisits.length >= MIN_RELATED_VISITS;
  addCheck(
    "repeated_visits",
    "Related activity nearby",
    repeatedVisits,
    repeatedVisits
      ? `${relatedVisits.length} other person-related events were recorded at ${locationLabel} within ${REPEATED_VISIT_WINDOW_MINUTES} minutes.`
      : `Fewer than ${MIN_RELATED_VISITS} other person-related events were recorded at ${locationLabel} within ${REPEATED_VISIT_WINDOW_MINUTES} minutes.`,
  );
  if (repeatedVisits) {
    addMatch(
      "repeated_visits",
      "Related activity nearby",
      `${relatedVisits.length} other person-related events were recorded at ${locationLabel} within ${REPEATED_VISIT_WINDOW_MINUTES} minutes. This is a timing observation, not a judgement about the person.`,
      "review",
    );
  }

  /* ------------------------ high attention combination ------------------- */
  const highAttention = thresholdMet && repeatedVisits;
  addCheck(
    "high_attention_combination",
    "Threshold plus related activity",
    highAttention,
    highAttention
      ? "Your duration threshold was met and multiple related person events occurred nearby within a short window."
      : "This event does not meet both the duration threshold and the related-activity condition.",
  );
  if (highAttention) {
    addMatch(
      "high_attention_combination",
      "Multiple signals met",
      "The recorded duration met your threshold and several related person-related events were recorded at the same location within 15 minutes. Review is suggested; this is not a validated threat assessment.",
      "high_attention",
    );
  }

  /* ----------------------------- unknown event --------------------------- */
  if (event.eventType === "unknown_activity") {
    addMatch(
      "incomplete_information",
      "Activity could not be classified",
      "The event type is unknown and the available information is insufficient to classify what was recorded.",
      "unknown",
    );
    addMissing("The event category is unknown.");
  }

  /* -------------------------- notification rules ------------------------- */
  const preferenceEnabled = settings.notificationPreferences[event.eventType];
  addCheck(
    "notification_preference_disabled",
    "Notification preference",
    !preferenceEnabled,
    preferenceEnabled
      ? `In-app notifications are enabled for ${typeMeta.label.toLowerCase()} events.`
      : `In-app notifications are turned off for ${typeMeta.label.toLowerCase()} events.`,
  );
  if (!preferenceEnabled) {
    addMatch(
      "notification_preference_disabled",
      "Notifications disabled for this category",
      `Notifications are turned off for ${typeMeta.label.toLowerCase()} events in Settings. The event is still recorded.`,
      "routine",
    );
  }

  const notify = preferenceEnabled && !caregiverAlertsMuted;

  /* ----------------------------- final result ---------------------------- */
  const baseAttention: AttentionLevel = event.eventType === "unknown_activity" ? "unknown" : "routine";
  let attentionLevel = attentionFromMatches(matches, baseAttention);

  // A routine event with only missing metadata stays routine; explicit review
  // or high-attention rules take precedence. Unknown events stay unknown.
  if (attentionLevel === "unknown" && matches.some((m) => m.attentionEffect === "review")) {
    attentionLevel = "review";
  }

  const reasons = Array.from(new Set(matches.map((match) => match.explanation)));
  if (reasons.length === 0) {
    reasons.push("No configured review criteria matched this event.");
  }

  let recommendedActionCategory: ActionCategory;
  if (attentionLevel === "high_attention" || attentionLevel === "review") {
    recommendedActionCategory = "review_event";
  } else if (attentionLevel === "unknown") {
    recommendedActionCategory = "review_if_needed";
  } else if (isDelivery) {
    recommendedActionCategory = "check_delivery";
  } else if (isCaregiver) {
    recommendedActionCategory = "verify_caregiver_arrival";
  } else {
    recommendedActionCategory = "no_action";
  }

  return {
    matchedRules: matches,
    evaluatedRules: checks,
    attentionLevel,
    reasons,
    recommendedActionCategory,
    notify,
    missingInformation,
  };
}

/** Evaluate many events, using the full collection as repeat-visit context. */
export function evaluateEvents(
  events: RuleEvent[],
  settings: RuleSettings,
): Array<RuleEvaluation> {
  return events.map((event) => evaluateEvent(event, settings, events));
}
