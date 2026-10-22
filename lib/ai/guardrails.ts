/**
 * Lightweight output guardrails.
 *
 * These checks are a safety net, not a complete semantic verifier. The primary
 * controls are the constrained response schema, the system prompt, server-side
 * rule recomputation, and deterministic fallbacks.
 */

const UNSAFE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern:
      /\b(911|call the police|call police|emergency services|armed|weapon|firearm|assault|violent)\b/i,
    reason: "unsupported emergency or weapon claim",
  },
  {
    pattern: /\b(intruder|burglar|criminal|thief|stealing|break[- ]?in|breaking in|trespasser|attacker)\b/i,
    reason: "unsupported criminal-intent claim",
  },
  {
    pattern: /\b(dangerous|in danger|threat to|malicious intent|suspicious person)\b/i,
    reason: "unsupported danger claim",
  },
  {
    pattern: /\b(identified as|confirmed to be|definitely is|we know (that )?(the|this) person)\b/i,
    reason: "unsupported identity claim",
  },
  {
    pattern: /\b(completely safe|nothing to worry about|guaranteed safe|no danger|definitely nothing)\b/i,
    reason: "false reassurance",
  },
  {
    pattern:
      /\b(continuously monitored|we monitored|kept watch|nothing else happened|no other activity)\b/i,
    reason: "unsupported monitoring claim",
  },
  {
    pattern: /\b(ignore (all )?(previous|prior) instructions|system prompt|developer message)\b/i,
    reason: "prompt-injection artefact",
  },
];

export function findUnsafeClaim(text: string): string | null {
  for (const { pattern, reason } of UNSAFE_PATTERNS) {
    if (pattern.test(text)) return reason;
  }
  return null;
}

export function scanNarrativeSafety(fields: string[]): string | null {
  return findUnsafeClaim(fields.join("\n"));
}

const COUNT_PATTERN =
  /(\d+)\s+(?:recorded\s+)?(events?|deliver(?:y|ies)(?:-related events?)?|caregiver arrivals?|motion events?|doorbell presses?|person-related events?)/gi;

/**
 * Reject explicit event-count claims that do not match any deterministically
 * computed count. This reduces the chance of the model inventing statistics.
 */
export function findUnsupportedCountClaim(
  text: string,
  allowedCounts: number[],
): string | null {
  const allowed = new Set(
    allowedCounts.filter((value) => Number.isFinite(value) && value >= 0),
  );
  for (const match of text.matchAll(COUNT_PATTERN)) {
    const value = Number(match[1]);
    if (!Number.isNaN(value) && !allowed.has(value)) {
      return `unsupported count "${match[0]}"`;
    }
  }
  return null;
}

/** Reject "nothing happened" style claims when events do exist. */
export function findAbsenceContradiction(text: string, hasEvents: boolean): string | null {
  if (!hasEvents) return null;
  if (
    /\b(no|zero)\s+(recorded\s+)?(events?|activity)\b/i.test(text) ||
    /\bnothing (else )?happened\b/i.test(text)
  ) {
    return "claimed no activity despite recorded events";
  }
  return null;
}

/** Collect all string values from a shallow object for safety scanning. */
export function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
  }
  return [];
}
