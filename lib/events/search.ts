import {
  ATTENTION_META,
  EVENT_LOCATION_META,
  EVENT_LOCATIONS,
  EVENT_TYPE_META,
  EVENT_TYPES,
  type AttentionLevel,
  type EventLocation,
  type EventType,
} from "@/lib/constants/events";
import {
  SEARCH_DATE_PRESET_LABELS,
  TIME_OF_DAY_LABELS,
  type SearchDatePreset,
  type SearchSort,
  type TimeOfDay,
} from "@/lib/constants/search";
import type { RuleSettings } from "@/lib/events/rules";
import { evaluateEvent } from "@/lib/events/rules";
import type { RingCareEvent } from "@/types/events";
import type { SearchExecutionResult, SearchPlan } from "@/types/search";
import {
  formatDuration,
  pluralize,
  truncate,
} from "@/lib/utils/format";
import {
  getSearchPresetRange,
  getTimeOfDay,
  isWithinInclusive,
} from "@/lib/utils/date";

/* -------------------------------------------------------------------------- */
/*                         Deterministic query parsing                        */
/* -------------------------------------------------------------------------- */

const TYPE_KEYWORDS: Array<{ pattern: RegExp; type: EventType }> = [
  { pattern: /\b(delivery|deliveries|package|parcel|courier)\b/i, type: "delivery_related" },
  { pattern: /\b(caregiver|carer|care giver)\b/i, type: "caregiver_arrival" },
  { pattern: /\b(doorbell|door bell|rang)\b/i, type: "doorbell_pressed" },
  { pattern: /\b(prolonged|lingering|loitering|stood|stayed|presence)\b/i, type: "prolonged_presence" },
  { pattern: /\b(motion|movement)\b/i, type: "motion_detected" },
  { pattern: /\b(person|people|someone|visitor)\b/i, type: "person_detected" },
  { pattern: /\b(unknown|unclassified|unclear)\b/i, type: "unknown_activity" },
];

const LOCATION_KEYWORDS: Array<{ pattern: RegExp; location: EventLocation }> = [
  { pattern: /\bfront door\b/i, location: "front_door" },
  { pattern: /\bporch\b/i, location: "porch" },
  { pattern: /\bdriveway\b/i, location: "driveway" },
  { pattern: /\bside gate\b/i, location: "side_gate" },
  { pattern: /\b(back yard|backyard)\b/i, location: "back_yard" },
  { pattern: /\b(mailbox|mail box)\b/i, location: "mailbox" },
];

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  sixty: 60,
  ninety: 90,
};

function parseDurationSeconds(text: string): number | null {
  const match = text.match(
    /\b(?:longer than|over|more than|at least|exceeding|exceeded|lasted|lasting|duration (?:of |greater than )?|for)\s+(a|an|\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|sixty|ninety)\s*(seconds?|secs?|minutes?|mins?)\b/i,
  );
  if (!match) return null;
  const rawValue = (match[1] ?? "").toLowerCase();
  const value = /^\d+$/.test(rawValue) ? Number(rawValue) : NUMBER_WORDS[rawValue];
  if (!value || value <= 0) return null;
  const unit = (match[2] ?? "").toLowerCase();
  const seconds = unit.startsWith("min") ? value * 60 : value;
  return Math.min(86_400, Math.max(1, seconds));
}

function parseTimeOfDay(text: string): TimeOfDay | null {
  if (/\b(morning)\b/i.test(text)) return "morning";
  if (/\b(afternoon)\b/i.test(text)) return "afternoon";
  if (/\b(evening|tonight)\b/i.test(text)) return "evening";
  if (/\b(night|overnight|late)\b/i.test(text)) return "night";
  return null;
}

function parseDatePreset(text: string): SearchDatePreset | null {
  if (/\byesterday evening\b/i.test(text)) return "yesterday_evening";
  if (/\b(today|this morning|this afternoon|this evening|tonight)\b/i.test(text)) {
    return "today";
  }
  if (/\byesterday\b/i.test(text)) return "yesterday";
  if (/\b(last|past|previous)\s+(seven|7)\s+days?\b|\bpast week\b|\bthis week\b/i.test(text)) {
    return "last_7_days";
  }
  if (/\b(last|past|previous)\s+(thirty|30)\s+days?\b|\bpast month\b|\blast month\b/i.test(text)) {
    return "last_30_days";
  }
  if (/\b(all time|all events|everything|all recorded events)\b/i.test(text)) {
    return "all_time";
  }
  return null;
}

function parseSort(text: string): SearchSort {
  if (/\b(oldest|earliest|chronological)\b/i.test(text)) return "oldest";
  if (/\b(longest|most prolonged)\b/i.test(text)) return "longest";
  return "newest";
}

/**
 * Local fallback interpreter. Only maps text to a constrained, validated plan;
 * it never executes arbitrary instructions and never invents events.
 */
export function parseSearchQueryLocally(query: string, _now: Date = new Date()): SearchPlan {
  const text = query.trim();

  const eventTypes = Array.from(
    new Set(
      TYPE_KEYWORDS.filter(({ pattern }) => pattern.test(text)).map(({ type }) => type),
    ),
  );
  const locations = Array.from(
    new Set(
      LOCATION_KEYWORDS.filter(({ pattern }) => pattern.test(text)).map(
        ({ location }) => location,
      ),
    ),
  );

  const minDurationSeconds = parseDurationSeconds(text);
  const timeOfDay = parseTimeOfDay(text);
  const datePreset = parseDatePreset(text) ?? "all_time";
  const sort = parseSort(text);
  const caregiverMatchedOnly =
    /\b(match(?:es|ed|ing)? (?:my|the|your) caregiver rule|configured caregiver rule|caregiver rule match)\b/i.test(
      text,
    );

  const attentionLevels: AttentionLevel[] = [];
  if (/\b(needs? attention|high attention|highlighted|most important)\b/i.test(text)) {
    attentionLevels.push("high_attention");
  }
  if (/\b(review|check|look at|suspicious|concerning|unusual)\b/i.test(text)) {
    attentionLevels.push("review", "high_attention");
  }
  if (/\b(routine|normal|expected)\b/i.test(text)) attentionLevels.push("routine");
  if (/\b(uncertain|unknown|unclear)\b/i.test(text)) attentionLevels.push("unknown");

  const uniqueAttention = Array.from(new Set(attentionLevels));

  const quoted = text.match(/"([^"]{2,60})"/);
  const keyword = quoted?.[1]?.trim() ?? null;

  const intent = /\b(summar(y|ize|ise)|overview|report|how many|what happened)\b/i.test(text)
    ? "summarize"
    : "filter";

  const asksForAll =
    /\b(all events|everything|all recorded events|show all|every event)\b/i.test(text) &&
    eventTypes.length === 0 &&
    locations.length === 0;

  const hasAnyFilter =
    eventTypes.length > 0 ||
    locations.length > 0 ||
    uniqueAttention.length > 0 ||
    minDurationSeconds !== null ||
    caregiverMatchedOnly ||
    datePreset !== "all_time" ||
    timeOfDay !== null ||
    keyword !== null ||
    asksForAll;

  if (!hasAnyFilter) {
    return {
      intent: "clarify",
      eventTypes: [],
      locations: [],
      datePreset: "all_time",
      timeOfDay: null,
      minDurationSeconds: null,
      attentionLevels: [],
      caregiverMatchedOnly: false,
      keyword: null,
      sort: "newest",
      clarifyingQuestion:
        "I could not map that request to recorded event fields. Try a date such as “today”, an event type such as “delivery”, or a duration such as “longer than one minute”.",
    };
  }

  return {
    intent,
    eventTypes,
    locations,
    datePreset: asksForAll ? "all_time" : datePreset,
    timeOfDay,
    minDurationSeconds,
    attentionLevels: uniqueAttention,
    caregiverMatchedOnly,
    keyword,
    sort,
    clarifyingQuestion: null,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Plan presentation                             */
/* -------------------------------------------------------------------------- */

export function describeSearchPlan(plan: SearchPlan): string {
  if (plan.intent === "clarify") return "Clarification needed";
  const parts: string[] = [];
  if (plan.eventTypes.length > 0) {
    parts.push(plan.eventTypes.map((type) => EVENT_TYPE_META[type].label.toLowerCase()).join(" or "));
  } else {
    parts.push("all event types");
  }
  if (plan.locations.length > 0) {
    parts.push(
      `at ${plan.locations.map((location) => EVENT_LOCATION_META[location].toLowerCase()).join(" or ")}`,
    );
  }
  parts.push(SEARCH_DATE_PRESET_LABELS[plan.datePreset].toLowerCase());
  if (plan.timeOfDay) parts.push(TIME_OF_DAY_LABELS[plan.timeOfDay].toLowerCase());
  if (plan.minDurationSeconds !== null) {
    parts.push(`duration at least ${formatDuration(plan.minDurationSeconds)}`);
  }
  if (plan.attentionLevels.length > 0) {
    parts.push(
      `attention: ${plan.attentionLevels
        .map((level) => ATTENTION_META[level].shortLabel.toLowerCase())
        .join(" or ")}`,
    );
  }
  if (plan.caregiverMatchedOnly) parts.push("matching your caregiver rule");
  if (plan.keyword) parts.push(`containing “${truncate(plan.keyword, 40)}”`);
  return parts.join(" · ");
}

/* -------------------------------------------------------------------------- */
/*                              Plan execution                                */
/* -------------------------------------------------------------------------- */

export function executeSearchPlan(
  events: RingCareEvent[],
  plan: SearchPlan,
  settings: RuleSettings,
  now: Date = new Date(),
): SearchExecutionResult {
  if (plan.intent === "clarify" || plan.clarifyingQuestion) {
    return {
      matches: [],
      range: null,
      description: "Clarification needed",
      summary:
        plan.clarifyingQuestion ??
        "Please refine the search with an event type, location, or date.",
    };
  }

  const range = getSearchPresetRange(plan.datePreset, now);
  const evaluations = new Map(
    events.map((event) => [event.id, evaluateEvent(event, settings, events)]),
  );

  const matches = events
    .filter((event) => {
      if (range && !isWithinInclusive(event.occurredAt, range.from, range.to)) return false;
      if (plan.timeOfDay && getTimeOfDay(event.occurredAt) !== plan.timeOfDay) return false;
      if (plan.eventTypes.length > 0 && !plan.eventTypes.includes(event.eventType)) {
        return false;
      }
      if (plan.locations.length > 0 && !plan.locations.includes(event.location)) {
        return false;
      }
      if (
        plan.minDurationSeconds !== null &&
        (event.durationSeconds === undefined ||
          event.durationSeconds < plan.minDurationSeconds)
      ) {
        return false;
      }
      const evaluation = evaluations.get(event.id);
      if (plan.attentionLevels.length > 0) {
        if (!evaluation || !plan.attentionLevels.includes(evaluation.attentionLevel)) {
          return false;
        }
      }
      if (plan.caregiverMatchedOnly) {
        const matched = evaluation?.matchedRules.some(
          (rule) => rule.id === "caregiver_arrival_match",
        );
        if (!matched) return false;
      }
      if (plan.keyword) {
        const haystack = [
          event.availableDescription ?? "",
          EVENT_TYPE_META[event.eventType].label,
          EVENT_LOCATION_META[event.location],
          event.availableMetadata?.caregiverLabel ?? "",
          event.availableMetadata?.notes ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(plan.keyword.toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (plan.sort === "oldest") return Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
      if (plan.sort === "longest") {
        return (b.durationSeconds ?? -1) - (a.durationSeconds ?? -1);
      }
      return Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    })
    .map((event) => ({ event, evaluation: evaluations.get(event.id)! }));

  let reviewCount = 0;
  for (const match of matches) {
    if (
      match.evaluation.attentionLevel === "review" ||
      match.evaluation.attentionLevel === "high_attention"
    ) {
      reviewCount += 1;
    }
  }

  const typeCounts = new Map<EventType, number>();
  for (const match of matches) {
    typeCounts.set(match.event.eventType, (typeCounts.get(match.event.eventType) ?? 0) + 1);
  }
  const typeSummary = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(
      ([type, count]) =>
        `${count} ${EVENT_TYPE_META[type].label.toLowerCase()}${count === 1 ? "" : "s"}`,
    )
    .join(", ");

  const summary =
    matches.length === 0
      ? "No recorded events matched this interpretation. Try widening the date range or removing a filter."
      : `${matches.length} matching ${pluralize(matches.length, "event")}${typeSummary ? ` (${typeSummary})` : ""}${reviewCount > 0 ? `; ${reviewCount} suggested review` : "; none suggested review"}.`;

  return {
    matches,
    range: range
      ? { from: range.from.toISOString(), to: range.to.toISOString() }
      : null,
    description: describeSearchPlan(plan),
    summary,
  };
}

export const SEARCH_PLAN_TYPES = EVENT_TYPES;
export const SEARCH_PLAN_LOCATIONS = EVENT_LOCATIONS;
