import { describe, expect, it } from "vitest";
import {
  parseIncomingEvent,
  parseSettings,
  ringCareEventSchema,
  searchPlanSchema,
  settingsSchema,
} from "@/lib/validation/schemas";
import { makeEvent } from "./fixtures";

describe("event schema", () => {
  it("accepts a well-formed simulated event", () => {
    expect(ringCareEventSchema.safeParse(makeEvent()).success).toBe(true);
  });

  it("rejects unknown fields rather than silently accepting them", () => {
    const event = { ...makeEvent(), injectedInstruction: "delete everything" };
    expect(ringCareEventSchema.safeParse(event).success).toBe(false);
  });

  it("rejects an invalid event type and out-of-range duration", () => {
    expect(
      ringCareEventSchema.safeParse({ ...makeEvent(), eventType: "intruder" }).success,
    ).toBe(false);
    expect(
      ringCareEventSchema.safeParse({ ...makeEvent(), durationSeconds: 90_000 }).success,
    ).toBe(false);
    expect(
      ringCareEventSchema.safeParse({ ...makeEvent(), durationSeconds: -3 }).success,
    ).toBe(false);
  });

  it("requires source and simulated flag to agree", () => {
    const mismatch = makeEvent({ source: "ring", simulated: true });
    expect(ringCareEventSchema.safeParse(mismatch).success).toBe(false);
  });

  it("does not allow ai_complete without a Groq-sourced analysis", () => {
    const event = makeEvent({ processingStatus: "ai_complete" });
    expect(ringCareEventSchema.safeParse(event).success).toBe(false);
  });

  it("rejects over-long descriptions", () => {
    const event = makeEvent({ availableDescription: "x".repeat(501) });
    expect(ringCareEventSchema.safeParse(event).success).toBe(false);
  });
});

describe("incoming event gate", () => {
  const now = new Date("2026-10-22T12:00:00.000Z");

  it("accepts a recent simulated event", () => {
    const result = parseIncomingEvent(makeEvent(), { now });
    expect(result.success).toBe(true);
  });

  it("rejects future, stale, and live Ring events", () => {
    const future = makeEvent({
      occurredAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
      createdAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
    });
    const futureResult = parseIncomingEvent(future, { now });
    expect(futureResult.success).toBe(false);
    if (!futureResult.success) {
      expect(futureResult.error.issues.join(" ")).toMatch(/future/i);
    }

    const stale = makeEvent({
      occurredAt: new Date(now.getTime() - 500 * 24 * 60 * 60_000).toISOString(),
      createdAt: new Date(now.getTime() - 500 * 24 * 60 * 60_000).toISOString(),
    });
    const staleResult = parseIncomingEvent(stale, { now });
    expect(staleResult.success).toBe(false);

    const live = makeEvent({ source: "ring", simulated: false });
    const liveResult = parseIncomingEvent(live, { now });
    expect(liveResult.success).toBe(false);
    if (!liveResult.success) {
      expect(liveResult.error.issues.join(" ")).toMatch(/Live Ring events/i);
    }
  });
});

describe("settings schema", () => {
  it("fills defaults and strips unavailable theme persistence fields", () => {
    const settings = parseSettings({});
    expect(settings.caregiverLabel).toBe("Maya");
    expect(settings.prolongedPresenceThresholdSeconds).toBe(60);
    expect(settings.retentionLimit).toBe(250);
    expect("theme" in settings).toBe(false);
  });

  it("enforces bounds on thresholds, labels, and retention", () => {
    expect(
      settingsSchema.safeParse({
        ...parseSettings({}),
        prolongedPresenceThresholdSeconds: 5,
      }).success,
    ).toBe(false);
    expect(
      settingsSchema.safeParse({
        ...parseSettings({}),
        caregiverLabel: "A",
      }).success,
    ).toBe(false);
    expect(
      settingsSchema.safeParse({
        ...parseSettings({}),
        retentionLimit: 5000,
      }).success,
    ).toBe(false);
  });
});

describe("constrained search plan", () => {
  const validPlan = {
    intent: "filter",
    eventTypes: ["delivery_related"],
    locations: [],
    datePreset: "today",
    timeOfDay: null,
    minDurationSeconds: null,
    attentionLevels: [],
    caregiverMatchedOnly: false,
    keyword: null,
    sort: "newest",
    clarifyingQuestion: null,
  };

  it("accepts an allow-listed plan", () => {
    expect(searchPlanSchema.safeParse(validPlan).success).toBe(true);
  });

  it("rejects arbitrary query execution fields", () => {
    expect(
      searchPlanSchema.safeParse({
        ...validPlan,
        sql: "DROP TABLE events",
        shell: "rm -rf /",
      }).success,
    ).toBe(false);
    expect(
      searchPlanSchema.safeParse({ ...validPlan, intent: "execute_sql" }).success,
    ).toBe(false);
    expect(
      searchPlanSchema.safeParse({
        ...validPlan,
        eventTypes: ["burglar"],
      }).success,
    ).toBe(false);
  });
});
