import { DEFAULT_SETTINGS } from "@/lib/constants/settings";
import type { RuleSettings } from "@/lib/events/rules";
import type { RingCareEvent } from "@/types/events";

export const NOW = new Date("2026-10-22T12:00:00.000Z");

let counter = 0;

export function makeSettings(overrides: Partial<RuleSettings> = {}): RuleSettings {
  return {
    prolongedPresenceThresholdSeconds:
      DEFAULT_SETTINGS.prolongedPresenceThresholdSeconds,
    notificationPreferences: { ...DEFAULT_SETTINGS.notificationPreferences },
    caregiverLabel: DEFAULT_SETTINGS.caregiverLabel,
    caregiverCriteria: DEFAULT_SETTINGS.caregiverCriteria,
    caregiverAlertsEnabled: DEFAULT_SETTINGS.caregiverAlertsEnabled,
    ...overrides,
  };
}

export function minutesAgo(minutes: number, now = NOW): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

export function makeEvent(overrides: Partial<RingCareEvent> = {}): RingCareEvent {
  counter += 1;
  const occurredAt = overrides.occurredAt ?? minutesAgo(10);
  return {
    id: `evt_test_${String(counter).padStart(4, "0")}`,
    source: "simulated_ring",
    simulated: true,
    eventType: "person_detected",
    occurredAt,
    location: "front_door",
    durationSeconds: 20,
    availableDescription:
      "A person-related detection was reported. No identity is included.",
    availableMetadata: { deviceName: "Test Door (simulated)", signalQuality: "good" },
    processingStatus: "rules_evaluated",
    createdAt: occurredAt,
    ...overrides,
  };
}

export function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
