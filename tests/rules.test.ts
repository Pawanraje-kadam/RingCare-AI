import { describe, expect, it } from "vitest";
import { evaluateEvent } from "@/lib/events/rules";
import { buildSeedEvents } from "@/lib/events/seed";
import { parseSettings, ringCareEventSchema } from "@/lib/validation/schemas";
import { makeEvent, makeSettings, minutesAgo } from "./fixtures";

describe("deterministic rule engine", () => {
  const settings = makeSettings();

  it("treats a delivery-labelled event as routine without confirming delivery", () => {
    const event = makeEvent({
      eventType: "delivery_related",
      durationSeconds: 24,
      availableMetadata: { packageDetected: true, deviceName: "Front Door" },
    });
    const evaluation = evaluateEvent(event, settings, [event]);

    expect(evaluation.attentionLevel).toBe("routine");
    expect(evaluation.recommendedActionCategory).toBe("check_delivery");
    expect(evaluation.notify).toBe(true);
    expect(evaluation.reasons.join(" ")).toMatch(/completed delivery is not confirmed/i);
    expect(
      evaluation.matchedRules.some((rule) => rule.id === "delivery_routine"),
    ).toBe(true);
  });

  it("keeps motion routine and quiet by default", () => {
    const event = makeEvent({ eventType: "motion_detected", durationSeconds: 7 });
    const evaluation = evaluateEvent(event, settings, [event]);

    expect(evaluation.attentionLevel).toBe("routine");
    expect(evaluation.recommendedActionCategory).toBe("no_action");
    expect(evaluation.notify).toBe(false);
    expect(
      evaluation.matchedRules.some(
        (rule) => rule.id === "notification_preference_disabled",
      ),
    ).toBe(true);
  });

  it("suggests review for a person event while avoiding intent claims", () => {
    const event = makeEvent({
      eventType: "person_detected",
      availableDescription:
        "A suspicious-looking stranger in dark clothing lingered; probably a burglar.",
    });
    const evaluation = evaluateEvent(event, settings, [event]);

    expect(evaluation.attentionLevel).toBe("review");
    expect(evaluation.recommendedActionCategory).toBe("review_event");
    expect(evaluation.attentionLevel).not.toBe("high_attention");
    expect(evaluation.reasons.join(" ")).not.toMatch(
      /burglar|criminal|intruder|dangerous|threat/i,
    );
    expect(
      evaluation.missingInformation.some((item) => /identity/i.test(item)),
    ).toBe(true);
  });

  it("matches a caregiver arrival by label as metadata, not identity", () => {
    const event = makeEvent({
      eventType: "caregiver_arrival",
      availableMetadata: { caregiverLabel: "Maya" },
    });
    const evaluation = evaluateEvent(event, settings, [event]);

    expect(evaluation.attentionLevel).toBe("routine");
    expect(evaluation.recommendedActionCategory).toBe("verify_caregiver_arrival");
    expect(
      evaluation.matchedRules.some((rule) => rule.id === "caregiver_arrival_match"),
    ).toBe(true);
    const text = evaluation.reasons.join(" ");
    expect(text).toMatch(/not independently verified identity/i);
    expect(text).not.toMatch(/confirmed to be Maya/i);
  });

  it("flags a caregiver arrival with a mismatched label for review without suspicion", () => {
    const event = makeEvent({
      eventType: "caregiver_arrival",
      availableMetadata: { caregiverLabel: "Jordan" },
    });
    const evaluation = evaluateEvent(event, settings, [event]);

    expect(evaluation.attentionLevel).toBe("review");
    expect(
      evaluation.matchedRules.some(
        (rule) => rule.id === "caregiver_arrival_unmatched",
      ),
    ).toBe(true);
    expect(evaluation.reasons.join(" ")).toMatch(/no identity is inferred/i);
  });

  it("honours the caregiver event-type-only criterion and disabled alerts", () => {
    const eventTypeOnly = makeSettings({
      caregiverCriteria: "event_type_only",
      caregiverAlertsEnabled: false,
    });
    const event = makeEvent({
      eventType: "caregiver_arrival",
      availableMetadata: { caregiverLabel: "Jordan" },
    });
    const evaluation = evaluateEvent(event, eventTypeOnly, [event]);

    expect(
      evaluation.matchedRules.some((rule) => rule.id === "caregiver_arrival_match"),
    ).toBe(true);
    expect(
      evaluation.matchedRules.some((rule) => rule.id === "caregiver_alerts_disabled"),
    ).toBe(true);
    expect(evaluation.notify).toBe(false);
    expect(evaluation.reasons.join(" ")).toMatch(/differs from your configured label/i);
  });

  it("keeps presence below the threshold routine and above it review-only", () => {
    const below = makeEvent({ eventType: "prolonged_presence", durationSeconds: 30 });
    const belowEvaluation = evaluateEvent(below, settings, [below]);
    expect(belowEvaluation.attentionLevel).toBe("routine");

    const above = makeEvent({ eventType: "prolonged_presence", durationSeconds: 150 });
    const aboveEvaluation = evaluateEvent(above, settings, [above]);
    expect(aboveEvaluation.attentionLevel).toBe("review");
    expect(aboveEvaluation.recommendedActionCategory).toBe("review_event");
    expect(aboveEvaluation.reasons.join(" ")).toMatch(/duration alone/i);
  });

  it("requires duration and repeated related activity for high attention", () => {
    const prolonged = makeEvent({
      id: "evt_prolonged_01",
      eventType: "prolonged_presence",
      occurredAt: minutesAgo(5),
      durationSeconds: 150,
    });
    const first = makeEvent({
      id: "evt_person_01",
      eventType: "person_detected",
      occurredAt: minutesAgo(8),
      durationSeconds: 18,
    });
    const second = makeEvent({
      id: "evt_person_02",
      eventType: "person_detected",
      occurredAt: minutesAgo(11),
      durationSeconds: 14,
    });

    const alone = evaluateEvent(prolonged, settings, [prolonged]);
    expect(alone.attentionLevel).toBe("review");

    const combined = evaluateEvent(prolonged, settings, [prolonged, first, second]);
    expect(combined.attentionLevel).toBe("high_attention");
    expect(
      combined.matchedRules.some((rule) => rule.id === "high_attention_combination"),
    ).toBe(true);

    // Duration below threshold must not be escalated by nearby activity.
    const short = makeEvent({
      eventType: "prolonged_presence",
      durationSeconds: 30,
      occurredAt: minutesAgo(5),
    });
    const shortCombined = evaluateEvent(short, settings, [short, first, second]);
    expect(shortCombined.attentionLevel).not.toBe("high_attention");
    expect(
      shortCombined.matchedRules.some((rule) => rule.id === "high_attention_combination"),
    ).toBe(false);
  });

  it("marks unknown activity as uncertain rather than guessing", () => {
    const event = makeEvent({
      eventType: "unknown_activity",
      location: "unknown",
      durationSeconds: undefined,
      availableDescription: undefined,
      availableMetadata: undefined,
    });
    const evaluation = evaluateEvent(event, settings, [event]);

    expect(evaluation.attentionLevel).toBe("unknown");
    expect(evaluation.recommendedActionCategory).toBe("review_if_needed");
    expect(evaluation.missingInformation.length).toBeGreaterThan(0);
  });

  it("does not notify when the event category preference is off", () => {
    const quiet = makeSettings({
      notificationPreferences: {
        ...settings.notificationPreferences,
        delivery_related: false,
      },
    });
    const event = makeEvent({ eventType: "delivery_related", durationSeconds: 20 });
    const evaluation = evaluateEvent(event, quiet, [event]);

    expect(evaluation.notify).toBe(false);
    expect(evaluation.attentionLevel).toBe("routine");
    expect(
      evaluation.matchedRules.some(
        (rule) => rule.id === "notification_preference_disabled",
      ),
    ).toBe(true);
  });
});

describe("seeded demo dataset", () => {
  const events = buildSeedEvents({ settings: parseSettings({}), now: new Date() });

  it("contains only valid simulated events", () => {
    expect(events.length).toBeGreaterThan(20);
    for (const event of events) {
      expect(ringCareEventSchema.safeParse(event).success).toBe(true);
      expect(event.simulated).toBe(true);
      expect(event.source).toBe("simulated_ring");
    }
  });

  it("contains at least one review and one high-attention example", () => {
    const evaluations = events.map((event) => evaluateEvent(event, makeSettings(), events));
    const levels = new Set(evaluations.map((evaluation) => evaluation.attentionLevel));
    expect(levels.has("review")).toBe(true);
    expect(levels.has("high_attention")).toBe(true);
  });
});
