import {
  ATTENTION_META,
  EVENT_LOCATION_META,
  EVENT_TYPE_META,
  type FallbackReason,
} from "@/lib/constants/events";
import { SAFE_AI_MESSAGES } from "@/lib/constants/ai";
import { getDeterministicRecommendation, getEventSummary } from "@/lib/events/classifier";
import type { AiAnalysis, RuleEvaluation, RingCareEvent } from "@/types/events";
import type {
  DailySummary,
  InsightFacts,
  InsightNarrative,
  SummaryFacts,
  SummaryNarrative,
} from "@/types/ai";
import type { AiResponseMeta } from "@/types/ai";
import { formatDuration, truncate } from "@/lib/utils/format";

function evidenceFor(event: RingCareEvent): string[] {
  const evidence: string[] = [
    `Event type: ${EVENT_TYPE_META[event.eventType].label} (source metadata).`,
    `Location: ${EVENT_LOCATION_META[event.location]}.`,
  ];
  if (event.durationSeconds !== undefined) {
    evidence.push(`Reported duration: ${formatDuration(event.durationSeconds)}.`);
  }
  if (event.availableDescription) {
    evidence.push(`Source description: “${truncate(event.availableDescription, 180)}”`);
  }
  if (event.availableMetadata?.caregiverLabel) {
    evidence.push(
      `Caregiver label metadata: “${event.availableMetadata.caregiverLabel}” (not a verified identity).`,
    );
  }
  if (event.availableMetadata?.packageDetected !== undefined) {
    evidence.push(
      `Package detection metadata: ${event.availableMetadata.packageDetected ? "reported as detected" : "not reported as detected"}.`,
    );
  }
  if (event.availableMetadata?.doorbellPressed) {
    evidence.push("Doorbell press metadata: reported as pressed.");
  }
  if (event.simulated) {
    evidence.push("This is a clearly labelled simulated demo event.");
  }
  return evidence.slice(0, 6);
}

function uncertaintyFor(event: RingCareEvent, evaluation: RuleEvaluation): string[] {
  const uncertainty: string[] = [];
  if (event.eventType === "unknown_activity") {
    uncertainty.push("The event category is unknown.");
  }
  if (!event.availableDescription) uncertainty.push("No description was supplied.");
  if (!event.availableMetadata) uncertainty.push("No supporting metadata was supplied.");
  if (event.durationSeconds === undefined) uncertainty.push("No duration was reported.");
  if (
    ["person_detected", "doorbell_pressed", "prolonged_presence"].includes(event.eventType)
  ) {
    uncertainty.push("No identity or intent information is available.");
  }
  if (
    event.eventType === "caregiver_arrival" &&
    !evaluation.matchedRules.some((rule) => rule.id === "caregiver_arrival_match")
  ) {
    uncertainty.push("The configured caregiver rule did not confirm this arrival.");
  }
  if (uncertainty.length === 0) {
    uncertainty.push("No intent or danger assessment is possible from this data.");
  }
  return uncertainty.slice(0, 5);
}

function interpretationFor(event: RingCareEvent, evaluation: RuleEvaluation): string {
  const location = EVENT_LOCATION_META[event.location].toLowerCase();
  let base: string;
  switch (event.eventType) {
    case "delivery_related":
      base =
        "The event source reported delivery-related activity. The available data does not confirm that a package was successfully delivered or left securely.";
      break;
    case "caregiver_arrival": {
      const matched = evaluation.matchedRules.some(
        (rule) => rule.id === "caregiver_arrival_match",
      );
      base = matched
        ? "This arrival met the configured caregiver rule using the supplied event metadata. A rule match is not independently verified identity."
        : "This event is labelled as a caregiver arrival, but it did not meet the configured caregiver criteria.";
      break;
    }
    case "doorbell_pressed":
      base =
        "A doorbell press was reported. The event data does not describe who pressed it or why.";
      break;
    case "person_detected":
      base =
        "A person-related detection was reported. No identity, appearance, emotional state, or intent information is included in the data.";
      break;
    case "prolonged_presence":
      base =
        event.durationSeconds !== undefined
          ? `Presence at the ${location} was reported for ${formatDuration(event.durationSeconds)}. Duration alone does not establish intent.`
          : "A prolonged-presence event was reported without a duration, so the configured threshold could not be evaluated.";
      break;
    case "motion_detected":
      base = "Motion was reported. Motion detection does not identify who or what moved.";
      break;
    case "unknown_activity":
    default:
      base =
        "The available information is insufficient to determine what happened. No identity or intent information is present.";
      break;
  }
  if (evaluation.attentionLevel === "high_attention") {
    return `Multiple configured conditions were met, so this event is highlighted for review. ${base} This is not a validated threat assessment.`;
  }
  if (evaluation.attentionLevel === "review") {
    return `${base} A configured rule suggested review; this is not a judgement about any person.`;
  }
  return base;
}

export interface FallbackAnalysisOptions {
  event: RingCareEvent;
  evaluation: RuleEvaluation;
  reason?: FallbackReason;
  generatedAt?: Date;
  notice?: string;
}

/** Deterministic explanation used whenever Groq is unavailable or rejected. */
export function createFallbackAnalysis({
  event,
  evaluation,
  reason = "unknown",
  generatedAt = new Date(),
  notice,
}: FallbackAnalysisOptions): AiAnalysis {
  const recommendation = getDeterministicRecommendation(evaluation, event);
  const confidence: AiAnalysis["confidence"] =
    evaluation.attentionLevel === "unknown"
      ? "low"
      : event.availableDescription && event.availableMetadata
        ? "medium"
        : "low";

  return {
    summary: getEventSummary(event, evaluation),
    eventInterpretation: interpretationFor(event, evaluation),
    confidence,
    evidence: evidenceFor(event),
    recommendedAction: `${recommendation.title}. ${recommendation.description}`,
    attentionLevel: evaluation.attentionLevel,
    uncertainty: uncertaintyFor(event, evaluation),
    limitations: [
      "Rules-based explanation generated without Groq.",
      "Simulated demo event: no video, audio, or images were analysed.",
      "Event labels and durations are input metadata, not verified observations.",
      `Attention category “${ATTENTION_META[evaluation.attentionLevel].label}” comes from deterministic rules.`,
    ],
    source: "fallback",
    generatedAt: generatedAt.toISOString(),
    fallbackReason: reason,
    notice: notice ?? SAFE_AI_MESSAGES[reason],
  };
}

/* -------------------------------------------------------------------------- */
/*                              Summary fallback                              */
/* -------------------------------------------------------------------------- */

function summaryMainActivity(facts: SummaryFacts): string {
  const { counts } = facts;
  if (counts.total === 0) {
    return "No recorded demo events fall within this range. This does not mean that no activity occurred.";
  }
  const parts: string[] = [];
  if (counts.deliveries > 0) {
    parts.push(`${counts.deliveries} delivery-related ${counts.deliveries === 1 ? "event" : "events"}`);
  }
  if (counts.caregiverArrivals > 0) {
    parts.push(`${counts.caregiverArrivals} caregiver ${counts.caregiverArrivals === 1 ? "arrival" : "arrivals"}`);
  }
  if (counts.byType.doorbell_pressed > 0) {
    parts.push(`${counts.byType.doorbell_pressed} doorbell ${counts.byType.doorbell_pressed === 1 ? "press" : "presses"}`);
  }
  if (counts.byType.person_detected > 0) {
    parts.push(`${counts.byType.person_detected} person-related ${counts.byType.person_detected === 1 ? "detection" : "detections"}`);
  }
  if (counts.byType.motion_detected > 0) {
    parts.push(`${counts.byType.motion_detected} motion ${counts.byType.motion_detected === 1 ? "event" : "events"}`);
  }
  if (counts.byType.prolonged_presence > 0) {
    parts.push(`${counts.byType.prolonged_presence} prolonged-presence ${counts.byType.prolonged_presence === 1 ? "event" : "events"}`);
  }
  if (counts.byType.unknown_activity > 0) {
    parts.push(`${counts.byType.unknown_activity} unclassified ${counts.byType.unknown_activity === 1 ? "event" : "events"}`);
  }
  return `The records contain ${parts.join(", ")}. ${counts.routine} ${counts.routine === 1 ? "event" : "events"} matched routine rules and ${counts.review + counts.highAttention} suggested or required review.`;
}

export interface FallbackSummaryOptions {
  facts: SummaryFacts;
  reason?: FallbackReason;
  generatedAt?: Date;
  notice?: string;
  detail?: string;
}

export function createFallbackSummary({
  facts,
  reason = "unknown",
  generatedAt = new Date(),
  notice,
  detail,
}: FallbackSummaryOptions): DailySummary {
  const needsReview = facts.counts.review + facts.counts.highAttention;
  const headline =
    facts.counts.total === 0
      ? `No recorded demo events ${facts.range.label.toLowerCase() === "today" ? "today" : "in this range"}`
      : `${facts.counts.total} recorded ${facts.counts.total === 1 ? "event" : "events"}${needsReview > 0 ? `, ${needsReview} suggesting review` : ", none suggesting review"}`;

  const patterns: string[] = [];
  if (facts.busiestHour && facts.busiestHour.count >= 2) {
    patterns.push(
      `The busiest recorded hour was ${facts.busiestHour.label} with ${facts.busiestHour.count} events.`,
    );
  }
  if (facts.topLocation && facts.topLocation.count >= 2) {
    patterns.push(
      `Most records were associated with ${facts.topLocation.label} (${facts.topLocation.count}).`,
    );
  }
  if (facts.counts.caregiverArrivals > 0) {
    patterns.push(
      `${facts.counts.caregiverArrivals} caregiver ${facts.counts.caregiverArrivals === 1 ? "arrival was" : "arrivals were"} recorded; ${facts.counts.unmatchedCaregiverArrivals} did not match the configured rule.`,
    );
  }

  const narrative: SummaryNarrative = {
    headline,
    mainActivity: summaryMainActivity(facts),
    patterns: patterns.slice(0, 4),
    reviewItems:
      facts.reviewSamples.length > 0
        ? Array.from(
            new Set(
              facts.reviewSamples.map(
                (sample) => `${sample.title}: ${truncate(sample.reason, 160)}`,
              ),
            ),
          ).slice(0, 6)
        : ["No events in this range met the configured review rules."],
    limitations: [
      "This summary describes only the supplied demo event records.",
      "Absence of a record does not mean that no activity occurred.",
      "Rules-based summary generated without Groq.",
    ],
    source: "fallback",
    notice: notice ?? SAFE_AI_MESSAGES[reason],
  };

  const meta: AiResponseMeta = {
    mode: "fallback",
    reason,
    message: narrative.notice,
    ...(detail ? { detail } : {}),
    cached: false,
    generatedAt: generatedAt.toISOString(),
  };

  return {
    facts,
    narrative,
    meta,
    generatedAt: generatedAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*                              Insight fallback                              */
/* -------------------------------------------------------------------------- */

export interface FallbackInsightOptions {
  facts: InsightFacts;
  reason?: FallbackReason;
  generatedAt?: Date;
  notice?: string;
  detail?: string;
}

export function createFallbackInsight({
  facts,
  reason = "unknown",
  generatedAt = new Date(),
  notice,
  detail,
}: FallbackInsightOptions): {
  narrative: InsightNarrative;
  meta: AiResponseMeta;
  generatedAt: string;
} {
  const totalComparison = facts.comparisons.find((item) => item.id === "total");
  let headline: string;
  if (facts.current.total === 0 && facts.previous.total === 0) {
    headline = `No recorded demo events in ${facts.rangeLabelText.toLowerCase()}`;
  } else if (totalComparison && totalComparison.delta > 0) {
    headline = `Recorded activity increased by ${totalComparison.delta} ${totalComparison.delta === 1 ? "event" : "events"} in ${facts.rangeLabelText.toLowerCase()}`;
  } else if (totalComparison && totalComparison.delta < 0) {
    headline = `Recorded activity decreased by ${Math.abs(totalComparison.delta)} ${Math.abs(totalComparison.delta) === 1 ? "event" : "events"} in ${facts.rangeLabelText.toLowerCase()}`;
  } else {
    headline = `Recorded activity is unchanged in ${facts.rangeLabelText.toLowerCase()}`;
  }

  const observations = facts.comparisons.map((comparison) => comparison.sentence);
  if (facts.current.busiestHour && facts.current.busiestHour.count >= 2) {
    observations.push(
      `The busiest recorded hour was ${facts.current.busiestHour.label} with ${facts.current.busiestHour.count} events.`,
    );
  }
  if (facts.current.topLocation && facts.current.topLocation.count >= 2) {
    observations.push(
      `${facts.current.topLocation.label} accounted for ${facts.current.topLocation.count} recorded events.`,
    );
  }
  if (facts.current.highAttention > 0) {
    observations.push(
      `${facts.current.highAttention} ${facts.current.highAttention === 1 ? "event met" : "events met"} multiple attention criteria and ${facts.current.highAttention === 1 ? "is" : "are"} highlighted for review.`,
    );
  }
  if (facts.current.review + facts.current.highAttention === 0) {
    observations.push("No events in the current period met review criteria.");
  }

  const narrative: InsightNarrative = {
    headline,
    observations: observations.slice(0, 5),
    limitations: [
      ...facts.limitations.slice(0, 2),
      "Rules-based narrative generated without Groq.",
    ],
    source: "fallback",
    notice: notice ?? SAFE_AI_MESSAGES[reason],
  };

  const meta: AiResponseMeta = {
    mode: "fallback",
    reason,
    message: narrative.notice,
    ...(detail ? { detail } : {}),
    cached: false,
    generatedAt: generatedAt.toISOString(),
  };

  return { narrative, meta, generatedAt: generatedAt.toISOString() };
}
