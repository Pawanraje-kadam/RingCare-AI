import {
  DEFAULT_CAREGIVER_LABEL,
  EVENT_TYPE_META,
  type EventLocation,
  type EventType,
} from "@/lib/constants/events";
import type { AppSettings } from "@/types/settings";
import type { EventMetadata, RingCareEvent } from "@/types/events";
import { createId } from "@/lib/utils/id";

export const SIMULATION_SCENARIOS = [
  "delivery",
  "doorbell",
  "caregiver",
  "person",
  "motion",
  "prolonged",
  "generic",
] as const;

export type SimulationScenario = (typeof SIMULATION_SCENARIOS)[number];

export const SIMULATION_SCENARIO_META: Record<
  SimulationScenario,
  { label: string; description: string; eventType: EventType }
> = {
  delivery: {
    label: "Delivery event",
    description: "Delivery-related metadata with a package-detection flag.",
    eventType: "delivery_related",
  },
  doorbell: {
    label: "Doorbell press",
    description: "A doorbell press with no identity information.",
    eventType: "doorbell_pressed",
  },
  caregiver: {
    label: "Caregiver arrival",
    description: "Arrival event carrying your configured caregiver label.",
    eventType: "caregiver_arrival",
  },
  person: {
    label: "Person detected",
    description: "Person-related detection without identity or intent data.",
    eventType: "person_detected",
  },
  motion: {
    label: "Motion event",
    description: "Motion in the driveway, routinely quiet in notifications.",
    eventType: "motion_detected",
  },
  prolonged: {
    label: "Prolonged presence",
    description: "Presence that exceeds your configured duration threshold.",
    eventType: "prolonged_presence",
  },
  generic: {
    label: "Generic / unknown",
    description: "An unclassified event with deliberately incomplete metadata.",
    eventType: "unknown_activity",
  },
};

interface ScenarioInput {
  scenario: SimulationScenario;
  settings: Pick<
    AppSettings,
    "caregiverLabel" | "prolongedPresenceThresholdSeconds"
  >;
  now?: Date;
  occurredAt?: Date;
  durationSeconds?: number;
  id?: string;
  deviceSuffix?: string;
}

export function buildSimulatedEvent({
  scenario,
  settings,
  now = new Date(),
  occurredAt = now,
  durationSeconds,
  id = createId("evt"),
  deviceSuffix = "simulated",
}: ScenarioInput): RingCareEvent {
  const suffix = deviceSuffix ? ` (${deviceSuffix})` : "";
  const commonMetadata: EventMetadata = {
    deviceName: `Front Door${suffix}`,
    signalQuality: "good",
    clipAvailable: true,
  };

  let eventType: EventType;
  let location: EventLocation = "front_door";
  let description: string | undefined;
  let duration: number | undefined;
  let metadata: EventMetadata | undefined = commonMetadata;

  switch (scenario) {
    case "delivery":
      eventType = "delivery_related";
      location = "front_door";
      duration = durationSeconds ?? 24;
      description =
        "Delivery-related activity was reported near the front door. The event source flagged a package detection.";
      metadata = { ...commonMetadata, packageDetected: true };
      break;
    case "doorbell":
      eventType = "doorbell_pressed";
      location = "front_door";
      duration = durationSeconds ?? 9;
      description = "The doorbell button was reported as pressed.";
      metadata = { ...commonMetadata, doorbellPressed: true };
      break;
    case "caregiver":
      eventType = "caregiver_arrival";
      location = "front_door";
      duration = durationSeconds ?? 14;
      description =
        "An arrival event was reported with caregiver label metadata supplied by the source.";
      metadata = {
        ...commonMetadata,
        caregiverLabel: settings.caregiverLabel || DEFAULT_CAREGIVER_LABEL,
      };
      break;
    case "person":
      eventType = "person_detected";
      location = "porch";
      duration = durationSeconds ?? 16;
      description =
        "A person-related detection was reported. Identity, appearance, and intent are not included in the event data.";
      metadata = {
        ...commonMetadata,
        deviceName: `Porch${suffix}`,
        motionZones: ["porch"],
      };
      break;
    case "motion":
      eventType = "motion_detected";
      location = "driveway";
      duration = durationSeconds ?? 7;
      description = "Motion was reported in the driveway.";
      metadata = {
        ...commonMetadata,
        deviceName: `Driveway${suffix}`,
        motionZones: ["driveway"],
        signalQuality: "fair",
      };
      break;
    case "prolonged":
      eventType = "prolonged_presence";
      location = "front_door";
      duration =
        durationSeconds ?? settings.prolongedPresenceThresholdSeconds + 90;
      description =
        "Presence near the front door was reported for the recorded duration.";
      metadata = commonMetadata;
      break;
    case "generic":
    default:
      eventType = "unknown_activity";
      location = "unknown";
      duration = undefined;
      description = undefined;
      metadata = undefined;
      break;
  }

  return {
    id,
    source: "simulated_ring",
    simulated: true,
    eventType,
    occurredAt: occurredAt.toISOString(),
    location,
    ...(duration !== undefined ? { durationSeconds: duration } : {}),
    ...(description ? { availableDescription: description } : {}),
    ...(metadata ? { availableMetadata: metadata } : {}),
    processingStatus: "rules_evaluated",
    createdAt: now.toISOString(),
  };
}

/** Ordered rotation for automated generation; deliberately not high-frequency. */
export const AUTO_SCENARIO_ROTATION: SimulationScenario[] = [
  "delivery",
  "motion",
  "person",
  "doorbell",
  "generic",
  "prolonged",
  "caregiver",
];

export function buildAutoSimulatedEvent(
  settings: AppSettings,
  rotationIndex: number,
  now = new Date(),
): RingCareEvent {
  const scenario =
    AUTO_SCENARIO_ROTATION[rotationIndex % AUTO_SCENARIO_ROTATION.length] ??
    "motion";
  return buildSimulatedEvent({ scenario, settings, now });
}

export function describeScenario(scenario: SimulationScenario): string {
  return SIMULATION_SCENARIO_META[scenario].description;
}

export function getScenarioEventLabel(scenario: SimulationScenario): string {
  const type = SIMULATION_SCENARIO_META[scenario].eventType;
  return EVENT_TYPE_META[type].label;
}
