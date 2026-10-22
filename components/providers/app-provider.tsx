"use client";

import * as React from "react";
import { getJson, postJson, ApiClientError } from "@/lib/api/client";
import { AI_LIMITS, SAFE_AI_MESSAGES } from "@/lib/constants/ai";
import type { FallbackReason } from "@/lib/constants/events";
import { SETTINGS_STORAGE_KEY } from "@/lib/constants/settings";
import { buildEvaluationMap, computeInsightFacts, computeSummaryFacts } from "@/lib/analytics/facts";
import {
  createFallbackAnalysis,
  createFallbackInsight,
  createFallbackSummary,
} from "@/lib/ai/fallback";
import { getAnalyticsRange, isWithinInclusive } from "@/lib/utils/date";
import { toEventDigest, selectAnalysisContext } from "@/lib/events/digest";
import { executeSearchPlan, parseSearchQueryLocally } from "@/lib/events/search";
import { buildSeedEvents } from "@/lib/events/seed";
import {
  applyRetention,
  browserEventStorage,
  mergeEvents,
  removeEventById,
  type EventStorage,
} from "@/lib/events/store";
import {
  buildAutoSimulatedEvent,
  buildSimulatedEvent,
  type SimulationScenario,
} from "@/lib/events/simulator";
import { evaluateEvent } from "@/lib/events/rules";
import { toAnalysisSettings, getBrowserTimeZone } from "@/lib/events/summary-request";
import { readStoredValue, writeStoredValue } from "@/lib/storage/safe-storage";
import {
  analyzeResponseSchema,
  demoSeedResponseSchema,
  healthResponseSchema,
  insightsResponseSchema,
  parseSettings,
  searchPlanSchema,
  searchResponseSchema,
  settingsSchema,
  summaryResponseSchema,
} from "@/lib/validation/schemas";
import type {
  AiHealth,
  AiResponseMeta,
  ActivityInsight,
  DailySummary,
} from "@/types/ai";
import type { AiAnalysis, RingCareEvent, RuleEvaluation } from "@/types/events";
import type { AppSettings } from "@/types/settings";
import type { SearchExecutionResult, SearchInterpretation } from "@/types/search";

export type AiHealthStatus = "checking" | "ready" | "unreachable";
export type AnalyticsRange = "today" | "last_7_days" | "last_30_days";

export interface SimulatedEventResult {
  event: RingCareEvent;
  evaluation: RuleEvaluation;
}

export interface AnalyzeEventResult {
  analysis: AiAnalysis;
  meta: AiResponseMeta;
  evaluation: RuleEvaluation;
}

export interface SearchRunResult extends SearchInterpretation {
  result: SearchExecutionResult;
  warning?: string;
}

export interface DemoResetResult {
  events: RingCareEvent[];
  count: number;
  source: "server" | "local";
}

export interface SettingsUpdateResult {
  ok: boolean;
  message?: string;
}

export interface AppContextValue {
  ready: boolean;
  demoMode: true;
  events: RingCareEvent[];
  settings: AppSettings;
  evaluations: Map<string, RuleEvaluation>;
  aiHealth: AiHealth | null;
  aiHealthStatus: AiHealthStatus;
  analyzingIds: Set<string>;
  storageWarning: string | null;
  simulateEvent: (scenario: SimulationScenario) => SimulatedEventResult;
  analyzeEventById: (id: string) => Promise<AnalyzeEventResult | null>;
  updateSettings: (next: AppSettings) => SettingsUpdateResult;
  resetDemoData: () => Promise<DemoResetResult>;
  clearLocalData: () => { ok: boolean; message?: string };
  removeEvent: (id: string) => void;
  generateSummary: (
    range: AnalyticsRange,
    options?: { events?: RingCareEvent[] },
  ) => Promise<DailySummary>;
  generateInsights: (range: AnalyticsRange) => Promise<ActivityInsight>;
  searchEvents: (query: string) => Promise<SearchRunResult>;
  refreshAiHealth: () => Promise<void>;
  dismissStorageWarning: () => void;
}

const AppContext = React.createContext<AppContextValue | null>(null);

function localMeta(reason: FallbackReason | undefined, message?: string): AiResponseMeta {
  return {
    mode: "fallback",
    ...(reason ? { reason } : {}),
    ...(message ?? (reason ? SAFE_AI_MESSAGES[reason] : undefined)
      ? { message: message ?? SAFE_AI_MESSAGES[reason as FallbackReason] }
      : {}),
    cached: false,
    generatedAt: new Date().toISOString(),
  };
}

function reasonFromError(error: unknown): FallbackReason {
  if (error instanceof ApiClientError) {
    if (error.code === "timeout") return "timeout";
    if (error.code === "rate_limited" || error.status === 429) return "rate_limited";
    if (error.code === "network_error") return "network_error";
    if (error.code === "invalid_response") return "invalid_response";
    if (error.code === "unsafe_response") return "unsafe_response";
    if (error.status >= 500) return "provider_error";
    return "provider_error";
  }
  return "unknown";
}

function shouldStoreAnalysisError(reason: FallbackReason | undefined) {
  return Boolean(reason && reason !== "ai_disabled" && reason !== "missing_api_key");
}

function retryableReason(reason: FallbackReason | undefined) {
  return reason === "timeout" || reason === "provider_error" || reason === "network_error" || reason === "rate_limited";
}

function inRange(event: RingCareEvent, from: Date, to: Date) {
  return isWithinInclusive(event.occurredAt, from, to);
}

export function AppProvider({
  children,
  storage = browserEventStorage,
}: {
  children: React.ReactNode;
  /** Injectable storage seam for tests. */
  storage?: EventStorage;
}) {
  const [events, setEvents] = React.useState<RingCareEvent[]>([]);
  const [settings, setSettings] = React.useState<AppSettings>(() => parseSettings({}));
  const [ready, setReady] = React.useState(false);
  const [aiHealth, setAiHealth] = React.useState<AiHealth | null>(null);
  const [aiHealthStatus, setAiHealthStatus] = React.useState<AiHealthStatus>("checking");
  const [analyzingIds, setAnalyzingIds] = React.useState<Set<string>>(new Set());
  const [storageWarning, setStorageWarning] = React.useState<string | null>(null);

  const initialized = React.useRef(false);
  const settingsRef = React.useRef(settings);
  const eventsRef = React.useRef(events);
  const aiHealthRef = React.useRef(aiHealth);
  const analyzingRef = React.useRef(new Set<string>());
  const autoIndexRef = React.useRef(0);
  const warningSetRef = React.useRef(false);
  const healthLoadedRef = React.useRef(false);

  React.useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  React.useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  React.useEffect(() => {
    aiHealthRef.current = aiHealth;
  }, [aiHealth]);

  const warnOnce = React.useCallback((message: string) => {
    if (warningSetRef.current) return;
    warningSetRef.current = true;
    setStorageWarning(message);
  }, []);

  /* ------------------------------ Hydration ------------------------------ */

  React.useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const now = new Date();
    const warnings: string[] = [];

    const settingsRead = readStoredValue(SETTINGS_STORAGE_KEY, settingsSchema);
    const initialSettings = settingsRead.value ?? parseSettings({});
    if (settingsRead.corrupted) {
      warnings.push("Saved settings could not be read, so defaults were restored.");
    }
    if (!settingsRead.storageAvailable) {
      warnings.push(
        "Browser storage is unavailable here. Demo changes will only last for this tab.",
      );
    }

    let load;
    try {
      load = storage.load();
    } catch {
      load = {
        events: [],
        found: false,
        storageAvailable: false,
        droppedInvalid: 0,
        corrupted: false,
      };
    }

    let initialEvents = load.events;
    if (!load.found || load.corrupted) {
      initialEvents = buildSeedEvents({ settings: initialSettings, now });
      if (load.corrupted) {
        warnings.push("Saved demo records were unreadable, so a fresh demo dataset was created.");
      }
    } else if (load.droppedInvalid > 0) {
      warnings.push(
        `${load.droppedInvalid} saved demo record${load.droppedInvalid === 1 ? " was" : "s were"} invalid and skipped.`,
      );
    }
    if (!load.storageAvailable) {
      warnings.push("Browser storage is unavailable; records are kept in memory only.");
    }

    setSettings(initialSettings);
    setEvents(applyRetention(initialEvents, initialSettings.retentionLimit));
    setReady(true);
    if (warnings.length > 0) {
      warningSetRef.current = true;
      setStorageWarning(warnings.join(" "));
    }
  }, [storage, warnOnce]);

  /* ---------------------------- Persistence ------------------------------ */

  React.useEffect(() => {
    if (!ready) return;
    try {
      const result = storage.save(events);
      if (!result.ok) {
        warnOnce(result.message ?? "Demo records could not be saved to browser storage.");
      }
    } catch {
      warnOnce("Demo records could not be saved to browser storage.");
    }
  }, [events, ready, storage, warnOnce]);

  React.useEffect(() => {
    if (!ready) return;
    const result = writeStoredValue(SETTINGS_STORAGE_KEY, settings);
    if (!result.available) {
      warnOnce(result.message ?? "Settings could not be saved to browser storage.");
    }
  }, [settings, ready, warnOnce]);

  /* ------------------------------ AI health ------------------------------ */

  const refreshAiHealth = React.useCallback(async () => {
    setAiHealthStatus("checking");
    try {
      const raw = await getJson<unknown>("/api/health", { timeoutMs: 12_000 });
      const parsed = healthResponseSchema.safeParse(raw);
      if (!parsed.success) {
        setAiHealth(null);
        setAiHealthStatus("unreachable");
        return;
      }
      setAiHealth({
        configured: parsed.data.ai.configured,
        provider: parsed.data.ai.provider,
        model: parsed.data.ai.model,
        promptVersion: parsed.data.ai.promptVersion,
        checkedAt: parsed.data.checkedAt,
      });
      setAiHealthStatus("ready");
    } catch {
      setAiHealth(null);
      setAiHealthStatus("unreachable");
    }
  }, []);

  React.useEffect(() => {
    if (healthLoadedRef.current) return;
    healthLoadedRef.current = true;
    void refreshAiHealth();
  }, [refreshAiHealth]);

  /* --------------------------- Auto generation --------------------------- */

  React.useEffect(() => {
    if (!ready || !settings.autoGenerateEnabled) return;
    const intervalMs = Math.max(20, settings.autoGenerateIntervalSeconds) * 1000;
    const timer = setInterval(() => {
      const current = settingsRef.current;
      const event = buildAutoSimulatedEvent(current, autoIndexRef.current, new Date());
      autoIndexRef.current += 1;
      setEvents((previous) =>
        mergeEvents(previous, [event], current.retentionLimit),
      );
      // No AI request is made automatically; this keeps demo costs bounded.
    }, intervalMs);
    return () => clearInterval(timer);
  }, [ready, settings.autoGenerateEnabled, settings.autoGenerateIntervalSeconds]);

  /* ------------------------------- Actions ------------------------------- */

  const simulateEvent = React.useCallback((scenario: SimulationScenario): SimulatedEventResult => {
    const current = settingsRef.current;
    const event = buildSimulatedEvent({ scenario, settings: current, now: new Date() });
    const evaluation = evaluateEvent(event, current, [...eventsRef.current, event]);
    setEvents((previous) => mergeEvents(previous, [event], current.retentionLimit));
    return { event, evaluation };
  }, []);

  const applyAnalysis = React.useCallback(
    (id: string, analysis: AiAnalysis, meta: AiResponseMeta) => {
      setEvents((previous) =>
        previous.map((event) => {
          if (event.id !== id) return event;
          const next: RingCareEvent = {
            ...event,
            analysis,
            processingStatus: analysis.source === "gemini" ? "ai_complete" : "ai_fallback",
          };
          if (shouldStoreAnalysisError(meta.reason)) {
            next.analysisError = {
              code: meta.reason!,
              message:
                meta.message ??
                SAFE_AI_MESSAGES[meta.reason!] ??
                "The AI analysis was unavailable.",
              retryable: retryableReason(meta.reason),
            };
          } else {
            delete next.analysisError;
          }
          return next;
        }),
      );
    },
    [],
  );

  const analyzeEventById = React.useCallback(
    async (id: string): Promise<AnalyzeEventResult | null> => {
      const event = eventsRef.current.find((candidate) => candidate.id === id);
      if (!event) return null;
      if (analyzingRef.current.has(id)) return null;
      analyzingRef.current.add(id);
      setAnalyzingIds(new Set(analyzingRef.current));

      const currentSettings = settingsRef.current;
      const currentEvents = eventsRef.current;
      const evaluation = evaluateEvent(event, currentSettings, currentEvents);

      const localFallback = (reason: FallbackReason) => {
        const analysis = createFallbackAnalysis({
          event,
          evaluation,
          reason,
          notice: SAFE_AI_MESSAGES[reason],
        });
        const meta = localMeta(reason);
        applyAnalysis(id, analysis, meta);
        return { analysis, meta, evaluation } satisfies AnalyzeEventResult;
      };

      try {
        if (!currentSettings.aiEnabled) {
          return localFallback("ai_disabled");
        }
        if (aiHealthRef.current && !aiHealthRef.current.configured) {
          return localFallback("missing_api_key");
        }

        const contextEvents = selectAnalysisContext(event, currentEvents).map(toEventDigest);
        const raw = await postJson<unknown>(
          "/api/ai/analyze",
          {
            event,
            contextEvents,
            settings: toAnalysisSettings(currentSettings),
          },
          { timeoutMs: 28_000 },
        );
        const parsed = analyzeResponseSchema.safeParse(raw);
        if (!parsed.success) {
          throw new ApiClientError("The analysis response was invalid.", {
            code: "invalid_response",
          });
        }
        if (parsed.data.analysis.attentionLevel !== evaluation.attentionLevel) {
          throw new ApiClientError("The analysis disagreed with deterministic rules.", {
            code: "invalid_response",
          });
        }
        if (
          (parsed.data.meta.mode === "gemini" &&
            parsed.data.analysis.source !== "gemini") ||
          (parsed.data.meta.mode === "fallback" &&
            parsed.data.analysis.source !== "fallback")
        ) {
          throw new ApiClientError("The analysis source was inconsistent.", {
            code: "invalid_response",
          });
        }

        applyAnalysis(id, parsed.data.analysis, parsed.data.meta);
        return {
          analysis: parsed.data.analysis,
          meta: parsed.data.meta,
          evaluation,
        };
      } catch (error) {
        const reason = reasonFromError(error);
        return localFallback(reason);
      } finally {
        analyzingRef.current.delete(id);
        setAnalyzingIds(new Set(analyzingRef.current));
      }
    },
    [applyAnalysis],
  );

  const updateSettings = React.useCallback(
    (next: AppSettings): SettingsUpdateResult => {
      const parsed = settingsSchema.safeParse(next);
      if (!parsed.success) {
        return {
          ok: false,
          message:
            "Some settings were invalid. Check the highlighted values and try again.",
        };
      }
      setSettings(parsed.data);
      setEvents((previous) => applyRetention(previous, parsed.data.retentionLimit));
      const result = writeStoredValue(SETTINGS_STORAGE_KEY, parsed.data);
      if (!result.available) {
        return {
          ok: false,
          message: result.message ?? "Settings could not be saved.",
        };
      }
      return { ok: true };
    },
    [],
  );

  const resetDemoData = React.useCallback(async (): Promise<DemoResetResult> => {
    const current = settingsRef.current;
    let nextEvents: RingCareEvent[] = [];
    let source: "server" | "local" = "server";

    try {
      const raw = await postJson<unknown>(
        "/api/demo",
        { settings: toAnalysisSettings(current) },
        { timeoutMs: 15_000 },
      );
      const parsed = demoSeedResponseSchema.safeParse(raw);
      if (!parsed.success || parsed.data.events.length === 0) {
        throw new ApiClientError("The seeded dataset was invalid.", {
          code: "invalid_response",
        });
      }
      nextEvents = parsed.data.events;
    } catch {
      nextEvents = buildSeedEvents({ settings: current });
      source = "local";
    }

    const retained = applyRetention(nextEvents, current.retentionLimit);
    setEvents(retained);
    const save = storage.save(retained);
    if (!save.ok) {
      warnOnce(save.message ?? "The reset demo data could not be saved.");
    }
    return { events: retained, count: retained.length, source };
  }, [storage, warnOnce]);

  const clearLocalData = React.useCallback(() => {
    setEvents([]);
    const save = storage.save([]);
    if (!save.ok) {
      return { ok: false, message: save.message ?? "Demo records could not be cleared." };
    }
    return { ok: true };
  }, [storage]);

  const removeEvent = React.useCallback((id: string) => {
    setEvents((previous) => removeEventById(previous, id));
  }, []);

  const generateSummary = React.useCallback(
    async (
      range: AnalyticsRange,
      options?: { events?: RingCareEvent[] },
    ): Promise<DailySummary> => {
      const currentSettings = settingsRef.current;
      const timeZone = getBrowserTimeZone();
      const rangeInfo = getAnalyticsRange(range, new Date());
      const sourceEvents = options?.events ?? eventsRef.current;
      const inRangeEvents = sourceEvents
        .filter((event) => inRange(event, rangeInfo.from, rangeInfo.to))
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
        .slice(0, AI_LIMITS.maxEventsForSummary);

      const localFacts = computeSummaryFacts(
        inRangeEvents,
        currentSettings,
        {
          from: rangeInfo.from,
          to: rangeInfo.to,
          label: rangeInfo.label,
          timeZone,
        },
      );

      const fallback = (reason: FallbackReason) =>
        createFallbackSummary({
          facts: localFacts,
          reason,
          generatedAt: new Date(),
        });

      if (!currentSettings.aiEnabled) return fallback("ai_disabled");
      if (aiHealthRef.current && !aiHealthRef.current.configured) {
        return fallback("missing_api_key");
      }

      try {
        const raw = await postJson<unknown>(
          "/api/ai/summary",
          {
            from: rangeInfo.from.toISOString(),
            to: rangeInfo.to.toISOString(),
            label: rangeInfo.label,
            events: inRangeEvents.map(toEventDigest),
            settings: toAnalysisSettings(currentSettings),
            timeZone,
          },
          { timeoutMs: 30_000 },
        );
        const parsed = summaryResponseSchema.safeParse(raw);
        if (!parsed.success) {
          throw new ApiClientError("The summary response was invalid.", {
            code: "invalid_response",
          });
        }
        return parsed.data.summary;
      } catch (error) {
        return fallback(reasonFromError(error));
      }
    },
    [],
  );

  const generateInsights = React.useCallback(
    async (range: AnalyticsRange): Promise<ActivityInsight> => {
      const currentSettings = settingsRef.current;
      const timeZone = getBrowserTimeZone();
      const now = new Date();
      const rangeInfo = getAnalyticsRange(range, now);
      const snapshot = eventsRef.current;

      const currentEvents = snapshot
        .filter((event) => inRange(event, rangeInfo.from, rangeInfo.to))
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
      const previousEvents = snapshot
        .filter((event) =>
          inRange(event, rangeInfo.previousFrom, rangeInfo.previousTo),
        )
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

      // Keep the bounded payload balanced between both comparison windows.
      const half = Math.floor(AI_LIMITS.maxEventsForInsights / 2);
      const selected = [
        ...currentEvents.slice(0, half),
        ...previousEvents.slice(0, half),
      ]
        .filter(
          (event, index, list) =>
            list.findIndex((candidate) => candidate.id === event.id) === index,
        )
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

      const localFacts = computeInsightFacts(snapshot, currentSettings, {
        rangeLabel: range,
        from: rangeInfo.from,
        to: rangeInfo.to,
        previousFrom: rangeInfo.previousFrom,
        previousTo: rangeInfo.previousTo,
        timeZone,
      });

      const fallback = (reason: FallbackReason | undefined) => {
        const result = createFallbackInsight({
          facts: localFacts,
          reason,
          generatedAt: new Date(),
        });
        return {
          facts: localFacts,
          narrative: result.narrative,
          meta: result.meta,
          generatedAt: result.generatedAt,
        } satisfies ActivityInsight;
      };

      if (!currentSettings.aiEnabled) return fallback("ai_disabled");
      if (aiHealthRef.current && !aiHealthRef.current.configured) {
        return fallback("missing_api_key");
      }

      try {
        const raw = await postJson<unknown>(
          "/api/ai/insights",
          {
            rangeLabel: range,
            from: rangeInfo.from.toISOString(),
            to: rangeInfo.to.toISOString(),
            previousFrom: rangeInfo.previousFrom.toISOString(),
            previousTo: rangeInfo.previousTo.toISOString(),
            events: selected.map(toEventDigest),
            settings: toAnalysisSettings(currentSettings),
            timeZone,
          },
          { timeoutMs: 30_000 },
        );
        const parsed = insightsResponseSchema.safeParse(raw);
        if (!parsed.success) {
          throw new ApiClientError("The insight response was invalid.", {
            code: "invalid_response",
          });
        }
        return parsed.data.insight;
      } catch (error) {
        return fallback(reasonFromError(error));
      }
    },
    [],
  );

  const runLocalSearch = React.useCallback(
    (query: string, reason: FallbackReason | undefined): SearchRunResult => {
      const now = new Date();
      const plan = parseSearchQueryLocally(query, now);
      const meta = localMeta(reason);
      const interpretation: SearchInterpretation = {
        plan,
        interpretedBy: "rules",
        meta,
      };
      const result = executeSearchPlan(
        eventsRef.current,
        plan,
        settingsRef.current,
        now,
      );
      return {
        ...interpretation,
        result,
        warning: reason
          ? `${SAFE_AI_MESSAGES[reason]} Search was interpreted locally.`
          : undefined,
      };
    },
    [],
  );

  const searchEvents = React.useCallback(
    async (query: string): Promise<SearchRunResult> => {
      const currentSettings = settingsRef.current;
      if (!currentSettings.aiEnabled) {
        return runLocalSearch(query, "ai_disabled");
      }
      if (aiHealthRef.current && !aiHealthRef.current.configured) {
        return runLocalSearch(query, "missing_api_key");
      }

      const now = new Date();
      try {
        const raw = await postJson<unknown>(
          "/api/ai/search",
          {
            query,
            clientNow: now.toISOString(),
            aiEnabled: currentSettings.aiEnabled,
          },
          { timeoutMs: 22_000 },
        );
        const parsed = searchResponseSchema.safeParse(raw);
        const planCheck = parsed.success
          ? searchPlanSchema.safeParse(parsed.data.plan)
          : null;
        if (!parsed.success || !planCheck?.success) {
          throw new ApiClientError("The search interpretation was invalid.", {
            code: "invalid_response",
          });
        }
        const interpretation: SearchInterpretation = {
          plan: parsed.data.plan,
          interpretedBy: parsed.data.interpretedBy,
          meta: parsed.data.meta,
        };
        const result = executeSearchPlan(
          eventsRef.current,
          parsed.data.plan,
          currentSettings,
          new Date(),
        );
        return {
          ...interpretation,
          result,
          warning:
            parsed.data.meta.mode === "fallback"
              ? parsed.data.meta.message
              : undefined,
        };
      } catch (error) {
        return runLocalSearch(query, reasonFromError(error));
      }
    },
    [runLocalSearch],
  );

  const evaluations = React.useMemo(
    () => buildEvaluationMap(events, settings),
    [events, settings],
  );

  const dismissStorageWarning = React.useCallback(() => {
    setStorageWarning(null);
  }, []);

  const value = React.useMemo<AppContextValue>(
    () => ({
      ready,
      demoMode: true,
      events,
      settings,
      evaluations,
      aiHealth,
      aiHealthStatus,
      analyzingIds,
      storageWarning,
      simulateEvent,
      analyzeEventById,
      updateSettings,
      resetDemoData,
      clearLocalData,
      removeEvent,
      generateSummary,
      generateInsights,
      searchEvents,
      refreshAiHealth,
      dismissStorageWarning,
    }),
    [
      ready,
      events,
      settings,
      evaluations,
      aiHealth,
      aiHealthStatus,
      analyzingIds,
      storageWarning,
      simulateEvent,
      analyzeEventById,
      updateSettings,
      resetDemoData,
      clearLocalData,
      removeEvent,
      generateSummary,
      generateInsights,
      searchEvents,
      refreshAiHealth,
      dismissStorageWarning,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = React.useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
