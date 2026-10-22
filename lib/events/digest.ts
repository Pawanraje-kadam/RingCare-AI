import type { EventDigest, RingCareEvent } from "@/types/events";

/**
 * Minimal projection sent to server-side AI routes. Descriptions are truncated
 * here and validated again by the server. Never include local storage metadata.
 */
export function toEventDigest(event: RingCareEvent): EventDigest {
  const metadata = event.availableMetadata;
  return {
    id: event.id,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    location: event.location,
    ...(event.durationSeconds !== undefined
      ? { durationSeconds: event.durationSeconds }
      : {}),
    ...(event.availableDescription
      ? { availableDescription: event.availableDescription.slice(0, 500) }
      : {}),
    ...(metadata?.caregiverLabel ? { caregiverLabel: metadata.caregiverLabel } : {}),
    ...(metadata?.packageDetected !== undefined
      ? { packageDetected: metadata.packageDetected }
      : {}),
    ...(metadata?.doorbellPressed !== undefined
      ? { doorbellPressed: metadata.doorbellPressed }
      : {}),
  };
}

/** Related events used as context for repeat-visit rules and event explanations. */
export function selectAnalysisContext(
  target: RingCareEvent,
  events: RingCareEvent[],
  options: { maxEvents?: number; windowMinutes?: number } = {},
): RingCareEvent[] {
  const maxEvents = options.maxEvents ?? 8;
  const windowMs = (options.windowMinutes ?? 30) * 60_000;
  const targetTime = Date.parse(target.occurredAt);

  return events
    .filter((candidate) => {
      if (candidate.id === target.id) return false;
      const time = Date.parse(candidate.occurredAt);
      if (Number.isNaN(time)) return false;
      return Math.abs(time - targetTime) <= windowMs;
    })
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    .slice(-maxEvents);
}
