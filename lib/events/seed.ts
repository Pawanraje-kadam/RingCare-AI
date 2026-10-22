import { EVENT_TYPES } from "@/lib/constants/events";
import { buildSimulatedEvent, type SimulationScenario } from "@/lib/events/simulator";
import { evaluateEvent } from "@/lib/events/rules";
import { createFallbackAnalysis } from "@/lib/ai/fallback";
import type { AppSettings } from "@/types/settings";
import type { RingCareEvent, RuleEvent } from "@/types/events";
import { sortEventsNewestFirst } from "@/lib/events/store";

/**
 * Deterministic-ish demo dataset.
 *
 * Timestamps are relative to the moment the data is seeded so the dashboard
 * always has recent activity. Event types, locations, durations, and scenarios
 * are fixed to make the demonstration reproducible.
 */

interface SeedSpec {
  offsetMinutes: number;
  scenario: SimulationScenario;
  overrides?: Partial<RingCareEvent>;
}

const SEED_SPECS: SeedSpec[] = [
  // Today
  { offsetMinutes: 8, scenario: "delivery" },
  { offsetMinutes: 18, scenario: "prolonged", overrides: { location: "porch" } },
  { offsetMinutes: 26, scenario: "person" },
  { offsetMinutes: 32, scenario: "person" },
  { offsetMinutes: 44, scenario: "motion" },
  { offsetMinutes: 95, scenario: "doorbell" },
  { offsetMinutes: 170, scenario: "delivery" },
  { offsetMinutes: 210, scenario: "caregiver" },
  { offsetMinutes: 330, scenario: "delivery", overrides: {
    availableDescription:
      "The event source reported a package near the front door in its metadata.",
  } },
  // Yesterday
  { offsetMinutes: 1560, scenario: "delivery" },
  { offsetMinutes: 1680, scenario: "motion" },
  { offsetMinutes: 1800, scenario: "caregiver", overrides: {
    availableMetadata: {
      caregiverLabel: "Jordan",
      deviceName: "Front Door (simulated)",
      signalQuality: "fair",
    },
    availableDescription:
      "An arrival was reported with a caregiver label that is not your configured label.",
  } },
  { offsetMinutes: 1980, scenario: "doorbell" },
  // Two days ago
  { offsetMinutes: 3000, scenario: "delivery", overrides: { location: "mailbox" } },
  { offsetMinutes: 3120, scenario: "motion" },
  // Three days ago
  { offsetMinutes: 4440, scenario: "person", overrides: { location: "side_gate" } },
  { offsetMinutes: 4560, scenario: "motion", overrides: { location: "side_gate" } },
  // Four days ago
  { offsetMinutes: 5880, scenario: "prolonged", overrides: { location: "back_yard" } },
  { offsetMinutes: 5940, scenario: "delivery", overrides: {
    location: "porch",
    availableMetadata: {
      packageDetected: true,
      signalQuality: "unknown",
      notes: "Demo event prepared to illustrate a failed AI analysis and fallback.",
    },
  } },
  // Five days ago
  { offsetMinutes: 7320, scenario: "generic" },
  { offsetMinutes: 7500, scenario: "motion" },
  // Six days ago
  { offsetMinutes: 8760, scenario: "doorbell" },
  { offsetMinutes: 8880, scenario: "delivery" },
  // Previous comparison window
  { offsetMinutes: 11640, scenario: "delivery" },
  { offsetMinutes: 12660, scenario: "motion" },
  { offsetMinutes: 14580, scenario: "delivery" },
  { offsetMinutes: 15900, scenario: "caregiver" },
  { offsetMinutes: 17400, scenario: "person" },
  { offsetMinutes: 18900, scenario: "delivery", overrides: { location: "mailbox" } },
];

function seedEventId(base: string, index: number): string {
  return `seed_${base}_${String(index).padStart(2, "0")}`;
}

export interface SeedOptions {
  settings: AppSettings;
  now?: Date;
}

export function buildSeedEvents({ settings, now = new Date() }: SeedOptions): RingCareEvent[] {
  const base = now.getTime().toString(36);
  const events = SEED_SPECS.map((spec, index) => {
    const occurredAt = new Date(now.getTime() - spec.offsetMinutes * 60_000);
    const event = buildSimulatedEvent({
      scenario: spec.scenario,
      settings,
      now,
      occurredAt,
      id: seedEventId(base, index),
    });
    return {
      ...event,
      createdAt: new Date(occurredAt.getTime() + 3_000).toISOString(),
      ...spec.overrides,
    };
  });

  const ruleSettings = {
    prolongedPresenceThresholdSeconds: settings.prolongedPresenceThresholdSeconds,
    notificationPreferences: settings.notificationPreferences,
    caregiverLabel: settings.caregiverLabel,
    caregiverCriteria: settings.caregiverCriteria,
    caregiverAlertsEnabled: settings.caregiverAlertsEnabled,
  };

  const evaluated = events.map((event) => ({
    event,
    evaluation: evaluateEvent(event as RuleEvent, ruleSettings, events as RuleEvent[]),
  }));

  // Attach transparent deterministic explanations to a few seeded records.
  const fallbackNotice =
    "Seeded demo explanation generated deterministically. No live AI request was made for this seed record.";
  const withAnalysis = evaluated.map(({ event, evaluation }, index) => {
    const shouldAnalyze = [0, 7, 17, 18].includes(index);
    if (!shouldAnalyze) return event;

    const isFailureCase = index === 18;
    const analysis = createFallbackAnalysis({
      event,
      evaluation,
      reason: isFailureCase ? "provider_error" : "unknown",
      generatedAt: new Date(Date.parse(event.createdAt) + 2_000),
      notice: isFailureCase
        ? "Simulated AI failure for this seeded demo record. The deterministic fallback is shown below."
        : fallbackNotice,
    });

    return {
      ...event,
      analysis,
      processingStatus: "ai_fallback" as const,
      ...(isFailureCase
        ? {
            analysisError: {
              code: "provider_error" as const,
              message:
                "Simulated AI failure for demonstration. The rules-based fallback is available.",
              retryable: true,
            },
          }
        : {}),
    };
  });

  return sortEventsNewestFirst(withAnalysis);
}

export function seedEventTypeCoverage(events: RingCareEvent[]): Record<string, number> {
  const coverage: Record<string, number> = Object.fromEntries(
    EVENT_TYPES.map((type) => [type, 0]),
  );
  for (const event of events) coverage[event.eventType] += 1;
  return coverage;
}
