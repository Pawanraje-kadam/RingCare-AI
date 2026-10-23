import { beforeEach, describe, expect, it } from "vitest";
import { clearAiCache } from "@/lib/ai/cache";
import {
  analyzeEvent,
  generateActivityInsight,
  generateDailySummary,
  interpretSearchQuery,
} from "@/lib/ai/service";
import type { GroqJsonClient } from "@/lib/ai/groq";
import { evaluateEvent } from "@/lib/events/rules";
import { toEventDigest } from "@/lib/events/digest";
import { parseSettings } from "@/lib/validation/schemas";
import { toAnalysisSettings } from "@/lib/events/summary-request";
import { makeEvent, minutesAgo, NOW } from "./fixtures";

const analysisSettings = toAnalysisSettings(parseSettings({}));

type Responder = (call: number, prompt: string) => string;

function fakeClient(responder: Responder, model = "openai/gpt-oss-120b") {
  let calls = 0;
  const client: GroqJsonClient & { calls: () => number } = {
    model,
    calls: () => calls,
    async generateJson(input) {
      calls += 1;
      return responder(calls, input.userPrompt);
    },
  };
  return client;
}

function analyzePayload(attentionLevel: string) {
  return {
    summary: "Delivery-related activity was reported near the front door.",
    eventInterpretation:
      "The simulated source flagged a package. The record does not show who handled it.",
    confidence: "medium",
    evidence: ["Package detection metadata was supplied."],
    recommendedAction: "No action is needed right now.",
    attentionLevel,
    uncertainty: ["Who handled the package is unknown."],
    limitations: ["Based on simulated metadata only."],
  };
}

beforeEach(() => {
  clearAiCache();
});

describe("Groq narration path", () => {
  it("returns a Groq-labelled analysis and keeps the rule attention level", async () => {
    const event = makeEvent({
      id: "evt_groq_delivery",
      eventType: "delivery_related",
      occurredAt: minutesAgo(20),
      availableMetadata: { packageDetected: true },
    });
    const evaluation = evaluateEvent(event, analysisSettings, [event]);
    const client = fakeClient(() => JSON.stringify(analyzePayload(evaluation.attentionLevel)));

    const result = await analyzeEvent({
      event,
      contextEvents: [],
      settings: analysisSettings,
      now: NOW,
      client,
    });

    expect(result.meta.mode).toBe("groq");
    expect(result.meta.model).toBe("openai/gpt-oss-120b");
    expect(result.analysis.source).toBe("groq");
    expect(result.analysis.attentionLevel).toBe(evaluation.attentionLevel);
    expect(client.calls()).toBe(1);
  });

  it("retries once with a corrective instruction when the model disagrees with the rules", async () => {
    const event = makeEvent({
      id: "evt_groq_mismatch",
      eventType: "delivery_related",
      occurredAt: minutesAgo(25),
      availableMetadata: { packageDetected: true },
    });
    const evaluation = evaluateEvent(event, analysisSettings, [event]);
    const wrong = evaluation.attentionLevel === "high_attention" ? "routine" : "high_attention";
    const client = fakeClient((call, prompt) =>
      JSON.stringify(
        analyzePayload(
          call === 1 ? wrong : prompt.includes("CORRECTION") ? evaluation.attentionLevel : wrong,
        ),
      ),
    );

    const result = await analyzeEvent({
      event,
      contextEvents: [],
      settings: analysisSettings,
      now: NOW,
      client,
    });

    expect(client.calls()).toBe(2);
    expect(result.meta.mode).toBe("groq");
    expect(result.analysis.attentionLevel).toBe(evaluation.attentionLevel);
  });

  it("retries malformed JSON once and then succeeds", async () => {
    const event = makeEvent({ id: "evt_groq_json", occurredAt: minutesAgo(15) });
    const evaluation = evaluateEvent(event, analysisSettings, [event]);
    const client = fakeClient((call) =>
      call === 1 ? "not json at all" : JSON.stringify(analyzePayload(evaluation.attentionLevel)),
    );

    const result = await analyzeEvent({
      event,
      contextEvents: [],
      settings: analysisSettings,
      now: NOW,
      client,
    });

    expect(client.calls()).toBe(2);
    expect(result.meta.mode).toBe("groq");
  });

  it("falls back when the model keeps making unsupported claims", async () => {
    const event = makeEvent({ id: "evt_groq_unsafe", occurredAt: minutesAgo(12) });
    const unsafe = {
      ...analyzePayload("routine"),
      summary: "An intruder was seen and the house is completely safe.",
    };
    const client = fakeClient(() => JSON.stringify(unsafe));

    const result = await analyzeEvent({
      event,
      contextEvents: [],
      settings: analysisSettings,
      now: NOW,
      client,
    });

    expect(client.calls()).toBe(2);
    expect(result.meta.mode).toBe("fallback");
    expect(result.meta.reason).toBe("unsafe_response");
    expect(result.analysis.attentionLevel).toBe(
      evaluateEvent(event, analysisSettings, [event]).attentionLevel,
    );
  });

  it("produces a Groq daily summary grounded in facts", async () => {
    const event = makeEvent({
      id: "evt_groq_summary",
      eventType: "delivery_related",
      occurredAt: minutesAgo(30),
      availableMetadata: { packageDetected: true },
    });
    const client = fakeClient(() =>
      JSON.stringify({
        headline: "Quiet day at the front door",
        mainActivity: "Delivery-related activity was recorded near the front door.",
        patterns: ["Recorded activity stayed near the front door."],
        reviewItems: [],
        limitations: ["Based only on the supplied demo records."],
      }),
    );

    const summary = await generateDailySummary({
      events: [toEventDigest(event)],
      settings: analysisSettings,
      from: new Date(NOW.getTime() - 60 * 60_000),
      to: NOW,
      label: "Today",
      timeZone: "UTC",
      now: NOW,
      client,
    });

    expect(summary.meta.mode).toBe("groq");
    expect(summary.narrative.source).toBe("groq");
    expect(summary.narrative.headline).toBe("Quiet day at the front door");
  });

  it("falls back with a safe detail when the provider rejects the key", async () => {
    const event = makeEvent({ id: "evt_groq_auth", occurredAt: minutesAgo(11) });
    const client: GroqJsonClient = {
      model: "openai/gpt-oss-120b",
      async generateJson() {
        throw new Error("HTTP 401: API key not valid");
      },
    };

    const result = await analyzeEvent({
      event,
      contextEvents: [],
      settings: analysisSettings,
      now: NOW,
      client,
    });

    expect(result.meta.mode).toBe("fallback");
    expect(result.meta.detail).toMatch(/401/);
  });

  it("interprets a search query with Groq", async () => {
    const client = fakeClient(() =>
      JSON.stringify({
        intent: "filter",
        eventTypes: ["delivery_related"],
        locations: ["front_door"],
        datePreset: "today",
        timeOfDay: "any",
        minDurationSeconds: 0,
        attentionLevels: [],
        caregiverMatchedOnly: false,
        keyword: "",
        sort: "newest",
        clarifyingQuestion: "",
      }),
    );

    const interpretation = await interpretSearchQuery({
      query: "deliveries at the front door today",
      clientNow: NOW,
      aiEnabled: true,
      now: NOW,
      client,
    });

    expect(interpretation.interpretedBy).toBe("groq");
    expect(interpretation.meta.mode).toBe("groq");
    expect(interpretation.plan.eventTypes).toEqual(["delivery_related"]);
    expect(interpretation.plan.timeOfDay).toBeNull();
    expect(interpretation.plan.minDurationSeconds).toBeNull();
  });

  it("produces a Groq comparative insight", async () => {
    const current = makeEvent({
      id: "evt_groq_insight",
      occurredAt: minutesAgo(30),
      eventType: "delivery_related",
      availableMetadata: { packageDetected: true },
    });
    const client = fakeClient(() =>
      JSON.stringify({
        headline: "Similar activity to the previous period",
        observations: ["Recorded activity stayed around the front door."],
        limitations: ["Based on partial simulated records."],
      }),
    );

    const insight = await generateActivityInsight({
      rangeLabel: "today",
      events: [toEventDigest(current)],
      settings: analysisSettings,
      from: new Date(NOW.getTime() - 6 * 60 * 60_000),
      to: NOW,
      previousFrom: new Date(NOW.getTime() - 30 * 60 * 60_000),
      previousTo: new Date(NOW.getTime() - 24 * 60 * 60_000),
      timeZone: "UTC",
      now: NOW,
      client,
    });

    expect(insight.meta.mode).toBe("groq");
    expect(insight.narrative.headline).toBe("Similar activity to the previous period");
  });
});
