import {
  EVENT_LOCATION_META,
  EVENT_TYPE_META,
  EVENT_TYPES,
  type AttentionLevel,
  type EventType,
} from "@/lib/constants/events";
import { evaluateEvent, type RuleSettings } from "@/lib/events/rules";
import type { RuleEvent, RuleEvaluation } from "@/types/events";
import type {
  InsightComparison,
  InsightFacts,
  SummaryFacts,
} from "@/types/ai";
import {
  formatHourLabel,
  getHourInTimeZone,
  isWithinHalfOpen,
  startOfLocalDay,
} from "@/lib/utils/date";
import { signedNumber } from "@/lib/utils/format";

export function zeroTypeCounts(): Record<EventType, number> {
  return EVENT_TYPES.reduce(
    (record, type) => {
      record[type] = 0;
      return record;
    },
    {} as Record<EventType, number>,
  );
}

export function buildEvaluationMap(
  events: RuleEvent[],
  settings: RuleSettings,
): Map<string, RuleEvaluation> {
  const map = new Map<string, RuleEvaluation>();
  for (const event of events) {
    map.set(event.id, evaluateEvent(event, settings, events));
  }
  return map;
}

function attentionCounts(
  events: RuleEvent[],
  evaluations: Map<string, RuleEvaluation>,
) {
  const counts = { routine: 0, review: 0, highAttention: 0, uncertain: 0 };
  for (const event of events) {
    const level = evaluations.get(event.id)?.attentionLevel ?? "unknown";
    if (level === "routine") counts.routine += 1;
    else if (level === "review") counts.review += 1;
    else if (level === "high_attention") counts.highAttention += 1;
    else counts.uncertain += 1;
  }
  return counts;
}

function busiestHour(
  events: RuleEvent[],
  timeZone: string,
): { label: string; count: number } | null {
  if (events.length === 0) return null;
  const buckets = new Map<number, number>();
  for (const event of events) {
    const hour = getHourInTimeZone(event.occurredAt, timeZone);
    buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
  }
  let bestHour = -1;
  let bestCount = -1;
  for (const [hour, count] of buckets) {
    if (count > bestCount || (count === bestCount && hour < bestHour)) {
      bestHour = hour;
      bestCount = count;
    }
  }
  if (bestHour < 0) return null;
  return {
    label: `${formatHourLabel(bestHour, timeZone)}–${formatHourLabel(bestHour + 1, timeZone)}`,
    count: bestCount,
  };
}

function topLocation(
  events: RuleEvent[],
): { location: string; label: string; count: number } | null {
  if (events.length === 0) return null;
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.location, (counts.get(event.location) ?? 0) + 1);
  }
  let bestLocation = "";
  let bestCount = -1;
  for (const [location, count] of counts) {
    if (count > bestCount) {
      bestLocation = location;
      bestCount = count;
    }
  }
  if (!bestLocation) return null;
  return {
    location: bestLocation,
    label: EVENT_LOCATION_META[bestLocation as keyof typeof EVENT_LOCATION_META] ?? bestLocation,
    count: bestCount,
  };
}

function reviewSamples(
  events: RuleEvent[],
  evaluations: Map<string, RuleEvaluation>,
) {
  return events
    .filter((event) => {
      const attention = evaluations.get(event.id)?.attentionLevel;
      return attention === "review" || attention === "high_attention";
    })
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 3)
    .map((event) => {
      const evaluation = evaluations.get(event.id);
      return {
        id: event.id,
        title: `${EVENT_TYPE_META[event.eventType].label} at ${EVENT_LOCATION_META[event.location]}`,
        reason:
          evaluation?.reasons[0] ??
          "A configured rule suggested review of this event.",
        attentionLevel: evaluation?.attentionLevel ?? ("review" as AttentionLevel),
        occurredAt: event.occurredAt,
      };
    });
}

export interface SummaryFactsOptions {
  from: Date;
  to: Date;
  label: string;
  timeZone: string;
}

/** Deterministic facts used to ground daily summaries. */
export function computeSummaryFacts(
  events: RuleEvent[],
  settings: RuleSettings,
  options: SummaryFactsOptions,
): SummaryFacts {
  const inRange = events.filter((event) =>
    isWithinHalfOpen(event.occurredAt, options.from, options.to),
  );
  const evaluations = buildEvaluationMap(inRange, settings);
  const lowSession = attentionCounts(inRange, evaluations);
  const byType = zeroTypeCounts();
  let unmatchedCaregiverArrivals = 0;

  for (const event of inRange) {
    byType[event.eventType] += 1;
    if (event.eventType === "caregiver_arrival") {
      const matched = evaluations
        .get(event.id)
        ?.matchedRules.some((rule) => rule.id === "caregiver_arrival_match");
      if (!matched) unmatchedCaregiverArrivals += 1;
    }
  }

  const hour = busiestHour(inRange, options.timeZone);
  const location = topLocation(inRange);

  return {
    range: {
      from: options.from.toISOString(),
      to: options.to.toISOString(),
      label: options.label,
    },
    consideredEvents: inRange.length,
    counts: {
      total: inRange.length,
      byType,
      routine: lowSession.routine,
      review: lowSession.review,
      highAttention: lowSession.highAttention,
      uncertain: lowSession.uncertain,
      deliveries: byType.delivery_related,
      caregiverArrivals: byType.caregiver_arrival,
      unmatchedCaregiverArrivals,
    },
    busiestHour: hour,
    topLocation: location,
    reviewSamples: reviewSamples(inRange, evaluations),
    notes: [
      `Based on ${inRange.length} recorded demo event${inRange.length === 1 ? "" : "s"} in the selected range.`,
      "These are simulated events and do not represent continuous property monitoring.",
      "The absence of a record does not mean that no activity occurred.",
    ],
  };
}

export const INSIGHT_RANGE_LABELS = {
  today: "Today",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
} as const;

export interface InsightFactsOptions {
  rangeLabel: "today" | "last_7_days" | "last_30_days";
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  timeZone: string;
}

function makeComparison(
  id: string,
  label: string,
  current: number,
  previous: number,
): InsightComparison {
  const delta = current - previous;
  const direction: InsightComparison["direction"] =
    delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  let sentence: string;
  if (current === 0 && previous === 0) {
    sentence = `${label}: none recorded in either period.`;
  } else if (delta === 0) {
    sentence = `${label}: ${current}, unchanged from the previous period.`;
  } else {
    sentence = `${label}: ${current}, compared with ${previous} in the previous period (${signedNumber(delta)}).`;
  }
  return { id, label, current, previous, delta, direction, sentence };
}

/** Deterministic comparisons; Groq is only allowed to narrate these values. */
export function computeInsightFacts(
  events: RuleEvent[],
  settings: RuleSettings,
  options: InsightFactsOptions,
): InsightFacts {
  const currentEvents = events.filter((event) =>
    isWithinHalfOpen(event.occurredAt, options.from, options.to),
  );
  const previousEvents = events.filter((event) =>
    isWithinHalfOpen(event.occurredAt, options.previousFrom, options.previousTo),
  );
  const currentEvaluations = buildEvaluationMap(currentEvents, settings);
  const previousEvaluations = buildEvaluationMap(previousEvents, settings);
  const currentAttention = attentionCounts(currentEvents, currentEvaluations);
  const previousAttention = attentionCounts(previousEvents, previousEvaluations);
  const currentByType = zeroTypeCounts();
  const previousByType = zeroTypeCounts();
  for (const event of currentEvents) currentByType[event.eventType] += 1;
  for (const event of previousEvents) previousByType[event.eventType] += 1;

  const currentNeedsReview = currentAttention.review + currentAttention.highAttention;
  const previousNeedsReview = previousAttention.review + previousAttention.highAttention;

  const comparisons = [
    makeComparison("total", "Recorded events", currentEvents.length, previousEvents.length),
    makeComparison(
      "deliveries",
      "Delivery-related events",
      currentByType.delivery_related,
      previousByType.delivery_related,
    ),
    makeComparison(
      "caregiver",
      "Caregiver arrivals",
      currentByType.caregiver_arrival,
      previousByType.caregiver_arrival,
    ),
    makeComparison("review", "Events needing review", currentNeedsReview, previousNeedsReview),
  ];

  const top = topLocation(currentEvents);
  const hour = busiestHour(currentEvents, options.timeZone);

  return {
    rangeLabel: options.rangeLabel,
    rangeLabelText: INSIGHT_RANGE_LABELS[options.rangeLabel],
    current: {
      from: options.from.toISOString(),
      to: options.to.toISOString(),
      total: currentEvents.length,
      routine: currentAttention.routine,
      review: currentAttention.review,
      highAttention: currentAttention.highAttention,
      uncertain: currentAttention.uncertain,
      deliveries: currentByType.delivery_related,
      caregiverArrivals: currentByType.caregiver_arrival,
      byType: currentByType,
      topLocation: top ? { label: top.label, count: top.count } : null,
      busiestHour: hour,
    },
    previous: {
      from: options.previousFrom.toISOString(),
      to: options.previousTo.toISOString(),
      total: previousEvents.length,
      deliveries: previousByType.delivery_related,
      caregiverArrivals: previousByType.caregiver_arrival,
      review: previousNeedsReview,
    },
    comparisons,
    limitations: [
      "Comparisons use only the recorded demo events supplied for these two periods.",
      "Different retention settings can remove older records and change comparisons.",
      "This is not continuous monitoring and is not a threat assessment.",
    ],
  };
}

export interface OverviewStats {
  total: number;
  routine: number;
  review: number;
  highAttention: number;
  uncertain: number;
  needsReview: number;
  deliveries7d: number;
  deliveriesToday: number;
  caregiverArrivals7d: number;
  unmatchedCaregiverArrivals: number;
  latestEventAt: string | null;
}

export function computeOverviewStats(
  events: RuleEvent[],
  settings: RuleSettings,
  now: Date = new Date(),
): OverviewStats {
  const evaluations = buildEvaluationMap(events, settings);
  const attention = attentionCounts(events, evaluations);
  const sevenDayStart = startOfLocalDay(new Date(now.getTime() - 6 * 86_400_000));
  const todayStart = startOfLocalDay(now);

  let deliveries7d = 0;
  let deliveriesToday = 0;
  let caregiverArrivals7d = 0;
  let unmatchedCaregiverArrivals = 0;

  for (const event of events) {
    const evaluation = evaluations.get(event.id);
    const occurred = new Date(event.occurredAt);
    const within7d = occurred >= sevenDayStart && occurred <= now;
    const withinToday = occurred >= todayStart && occurred <= now;
    if (event.eventType === "delivery_related" && within7d) deliveries7d += 1;
    if (event.eventType === "delivery_related" && withinToday) deliveriesToday += 1;
    if (event.eventType === "caregiver_arrival" && within7d) {
      caregiverArrivals7d += 1;
      const matched = evaluation?.matchedRules.some(
        (rule) => rule.id === "caregiver_arrival_match",
      );
      if (!matched) unmatchedCaregiverArrivals += 1;
    }
  }

  return {
    total: events.length,
    routine: attention.routine,
    review: attention.review,
    highAttention: attention.highAttention,
    uncertain: attention.uncertain,
    needsReview: attention.review + attention.highAttention,
    deliveries7d,
    deliveriesToday,
    caregiverArrivals7d,
    unmatchedCaregiverArrivals,
    latestEventAt:
      events.length > 0
        ? events
            .map((event) => event.occurredAt)
            .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
        : null,
  };
}

export interface AttentionItem {
  event: RuleEvent;
  evaluation: RuleEvaluation;
}

/** Events that met review criteria or could not be classified, most notable first. */
export function getAttentionQueue(
  events: RuleEvent[],
  settings: RuleSettings,
  limit = 4,
): AttentionItem[] {
  const evaluations = buildEvaluationMap(events, settings);
  return events
    .map((event) => ({ event, evaluation: evaluations.get(event.id)! }))
    .filter(
      (item) =>
        item.evaluation.attentionLevel === "review" ||
        item.evaluation.attentionLevel === "high_attention" ||
        item.evaluation.attentionLevel === "unknown",
    )
    .sort((a, b) => {
      const severity =
        severityOf(b.evaluation.attentionLevel) - severityOf(a.evaluation.attentionLevel);
      if (severity !== 0) return severity;
      return Date.parse(b.event.occurredAt) - Date.parse(a.event.occurredAt);
    })
    .slice(0, limit);
}

export function severityOf(level: AttentionLevel): number {
  if (level === "high_attention") return 3;
  if (level === "review") return 2;
  if (level === "unknown") return 1;
  return 0;
}

export interface CaregiverArrival {
  event: RuleEvent;
  evaluation: RuleEvaluation;
  matched: boolean;
  suppliedLabel: string | null;
}

export function getCaregiverActivity(
  events: RuleEvent[],
  settings: RuleSettings,
): CaregiverArrival[] {
  const evaluations = buildEvaluationMap(events, settings);
  return events
    .filter((event) => event.eventType === "caregiver_arrival")
    .map((event) => ({
      event,
      evaluation: evaluations.get(event.id)!,
      matched:
        evaluations
          .get(event.id)
          ?.matchedRules.some((rule) => rule.id === "caregiver_arrival_match") ?? false,
      suppliedLabel: event.availableMetadata?.caregiverLabel ?? null,
    }))
    .sort((a, b) => Date.parse(b.event.occurredAt) - Date.parse(a.event.occurredAt));
}

export function summarizeEventCounts(byType: Record<EventType, number>): string {
  const parts: string[] = [];
  for (const type of EVENT_TYPES) {
    if (byType[type] > 0) {
      parts.push(`${byType[type]} ${EVENT_TYPE_META[type].label.toLowerCase()}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "no recorded events";
}
