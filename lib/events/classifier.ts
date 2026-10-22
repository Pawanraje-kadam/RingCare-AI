import {
  EVENT_LOCATION_META,
  EVENT_TYPE_META,
  type ActionCategory,
  type EventType,
} from "@/lib/constants/events";
import type { RingCareEvent, RuleEvaluation } from "@/types/events";
import { formatDuration } from "@/lib/utils/format";

/**
 * Presentation helpers that turn structured event data into calm, factual copy.
 * Nothing here infers identity, intent, or danger.
 */

export interface DeterministicRecommendation {
  title: string;
  description: string;
  category: ActionCategory;
}

export function getDeterministicRecommendation(
  evaluation: RuleEvaluation,
  event: RingCareEvent,
): DeterministicRecommendation {
  switch (evaluation.recommendedActionCategory) {
    case "check_delivery":
      return {
        category: "check_delivery",
        title: "Check the delivery if you were expecting one",
        description:
          "A delivery-related event was recorded. RingCare AI cannot confirm that a package was delivered or left securely.",
      };
    case "verify_caregiver_arrival":
      return {
        category: "verify_caregiver_arrival",
        title: "Confirm the arrival if it was expected",
        description:
          "This event matched your configured caregiver rule. A rule match is metadata-based and is not independently verified identity.",
      };
    case "review_event":
      return {
        category: "review_event",
        title: "Review the available event details",
        description:
          "A configured rule suggested review. Use your own expectations for the household; this is not a threat assessment.",
      };
    case "review_if_needed": {
      const type = EVENT_TYPE_META[event.eventType];
      return {
        category: "review_if_needed",
        title: "Review only if it is useful",
        description: `The available information is insufficient to classify this ${type.label.toLowerCase()} event confidently. No identity or intent information is available.`,
      };
    }
    case "no_action":
    default:
      return {
        category: "no_action",
        title: "No action suggested",
        description:
          "No configured review rule matched this event. This does not guarantee that nothing occurred.",
      };
  }
}

export function getEventSummary(
  event: Pick<RingCareEvent, "eventType" | "location" | "durationSeconds">,
  evaluation?: RuleEvaluation,
): string {
  const location = EVENT_LOCATION_META[event.location].toLowerCase();
  switch (event.eventType) {
    case "delivery_related":
      return `A delivery-related event was recorded at the ${location}.`;
    case "caregiver_arrival": {
      const matched = evaluation?.matchedRules.some(
        (rule) => rule.id === "caregiver_arrival_match",
      );
      return matched
        ? `An arrival matching your configured caregiver rule was recorded at the ${location}.`
        : `A caregiver-arrival event was recorded at the ${location}, but your caregiver rule did not confirm it.`;
    }
    case "doorbell_pressed":
      return `The doorbell was reported as pressed at the ${location}.`;
    case "person_detected":
      return `A person-related detection was recorded at the ${location}.`;
    case "prolonged_presence":
      return event.durationSeconds !== undefined
        ? `Presence at the ${location} was reported for ${formatDuration(event.durationSeconds)}.`
        : `A prolonged-presence event was recorded at the ${location} without a reported duration.`;
    case "motion_detected":
      return `Motion was recorded at the ${location}.`;
    case "unknown_activity":
    default:
      return "An event was recorded with insufficient information to classify it.";
  }
}

export function getEventTitle(event: RingCareEvent): string {
  return EVENT_TYPE_META[event.eventType].label;
}

export interface EventFactRow {
  label: string;
  value: string;
  missing?: boolean;
}

export function getEventFacts(event: RingCareEvent): EventFactRow[] {
  const metadata = event.availableMetadata;
  const rows: EventFactRow[] = [
    {
      label: "Description supplied by source",
      value: event.availableDescription ?? "Not provided",
      missing: !event.availableDescription,
    },
    {
      label: "Location",
      value: EVENT_LOCATION_META[event.location],
      missing: event.location === "unknown",
    },
    {
      label: "Duration",
      value:
        event.durationSeconds !== undefined
          ? formatDuration(event.durationSeconds)
          : "Not reported",
      missing: event.durationSeconds === undefined,
    },
    {
      label: "Source",
      value:
        event.source === "simulated_ring"
          ? "Simulated Ring-compatible event"
          : "Ring integration",
    },
  ];

  if (metadata) {
    if (metadata.caregiverLabel) {
      rows.push({ label: "Caregiver label (metadata)", value: metadata.caregiverLabel });
    }
    if (metadata.packageDetected !== undefined) {
      rows.push({
        label: "Package detection metadata",
        value: metadata.packageDetected
          ? "Reported as detected (not verified)"
          : "Not reported as detected",
      });
    }
    if (metadata.doorbellPressed !== undefined) {
      rows.push({
        label: "Doorbell press metadata",
        value: metadata.doorbellPressed ? "Reported as pressed" : "Not reported as pressed",
      });
    }
    if (metadata.deviceName) {
      rows.push({ label: "Device", value: metadata.deviceName });
    }
    if (metadata.signalQuality) {
      rows.push({ label: "Signal quality", value: metadata.signalQuality });
    }
    if (metadata.clipAvailable !== undefined) {
      rows.push({
        label: "Clip availability metadata",
        value: metadata.clipAvailable ? "Reported as available in source" : "Not available",
      });
    }
    if (metadata.motionZones?.length) {
      rows.push({ label: "Motion zones", value: metadata.motionZones.join(", ") });
    }
    if (metadata.notes) {
      rows.push({ label: "Source note (untrusted text)", value: metadata.notes });
    }
  } else {
    rows.push({
      label: "Supporting metadata",
      value: "None supplied",
      missing: true,
    });
  }

  return rows;
}

export function getTypeBadgeLabel(type: EventType): string {
  return EVENT_TYPE_META[type].shortLabel;
}
