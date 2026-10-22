"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  FlaskConical,
  Loader2,
  MinusCircle,
  Play,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ATTENTION_META } from "@/lib/constants/events";
import { GROQ_MODEL_LABEL } from "@/lib/constants/ai";
import { getDeterministicRecommendation } from "@/lib/events/classifier";
import { truncate } from "@/lib/utils/format";
import type { DailySummary } from "@/types/ai";
import { cn } from "@/lib/utils/cn";

const DEMO_STEPS = [
  {
    title: "A simulated delivery-related event arrives",
    description: "Added to the local event store with source metadata.",
  },
  {
    title: "Deterministic rules evaluate it",
    description: "The delivery rule runs without any AI involvement.",
  },
  {
    title: "An explanation is generated",
    description:
      "llama-3.3-70b-versatile via Groq if configured, otherwise a transparent rules-based fallback.",
  },
  {
    title: "A proportionate recommendation is attached",
    description: "Shown with the event and in the detail view.",
  },
  {
    title: "A simulated caregiver arrival is created",
    description: "Carries the caregiver label you configured in Settings.",
  },
  {
    title: "Your caregiver rule records the arrival",
    description: "A metadata rule match — not verified identity.",
  },
  {
    title: "A prolonged-presence event is created",
    description: "Its reported duration exceeds your configured threshold.",
  },
  {
    title: "Rules highlight the presence event",
    description:
      "The rule engine raises it for review with a plain-language reason.",
  },
  {
    title: "The highlighted event is ready to inspect",
    description:
      "Open the timeline to review evidence, rules, and uncertainty.",
  },
  {
    title: "A daily summary is generated",
    description: "Grounded in the recorded demo events and available facts.",
  },
] as const;

type StepStatus =
  "pending" | "running" | "done" | "fallback" | "error" | "skipped";

class DemoCancelledError extends Error {
  constructor() {
    super("Demo cancelled");
    this.name = "DemoCancelledError";
  }
}

function statusIcon(status: StepStatus) {
  switch (status) {
    case "running":
      return (
        <Loader2
          aria-hidden="true"
          className="size-4 animate-spin text-brand"
        />
      );
    case "done":
      return <CheckCircle2 aria-hidden="true" className="size-4 text-brand" />;
    case "fallback":
      return <AlertTriangle aria-hidden="true" className="size-4 text-amber" />;
    case "error":
      return <XCircle aria-hidden="true" className="size-4 text-danger" />;
    case "skipped":
      return <MinusCircle aria-hidden="true" className="size-4 text-muted" />;
    default:
      return <Circle aria-hidden="true" className="size-4 text-line-strong" />;
  }
}

function statusLabel(status: StepStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "done":
      return "Complete";
    case "fallback":
      return "Fallback used";
    case "error":
      return "Failed";
    case "skipped":
      return "Skipped";
    default:
      return "Pending";
  }
}

export function DemoDialog() {
  const router = useRouter();
  const {
    ready,
    events,
    settings,
    updateSettings,
    resetDemoData,
    simulateEvent,
    analyzeEventById,
    generateSummary,
  } = useApp();

  const [open, setOpen] = React.useState(false);
  const [resetFirst, setResetFirst] = React.useState(true);
  const [includeExplanation, setIncludeExplanation] = React.useState(true);
  const stepListRef = React.useRef<HTMLOListElement | null>(null);
  const [running, setRunning] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);
  const [statuses, setStatuses] = React.useState<StepStatus[]>(() =>
    DEMO_STEPS.map(() => "pending"),
  );
  const [notes, setNotes] = React.useState<string[]>(() =>
    DEMO_STEPS.map(() => ""),
  );
  const [currentStep, setCurrentStep] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [preflightNote, setPreflightNote] = React.useState<string | null>(null);
  const [summaryResult, setSummaryResult] = React.useState<DailySummary | null>(
    null,
  );
  const [prolongedEventId, setProlongedEventId] = React.useState<string | null>(
    null,
  );

  const runIdRef = React.useRef(0);

  React.useEffect(() => {
    return () => {
      runIdRef.current += 1;
    };
  }, []);

  React.useEffect(() => {
    if (currentStep === null) return;
    const node = stepListRef.current?.querySelector<HTMLElement>(
      `[data-step-index="${currentStep}"]`,
    );
    node?.scrollIntoView?.({ block: "nearest" });
  }, [currentStep]);

  const setStep = (index: number, status: StepStatus, note?: string) => {
    setStatuses((previous) => {
      const next = [...previous];
      next[index] = status;
      return next;
    });
    if (note !== undefined) {
      setNotes((previous) => {
        const next = [...previous];
        next[index] = note;
        return next;
      });
    }
  };

  const ensureActive = (runId: number) => {
    if (runIdRef.current !== runId) throw new DemoCancelledError();
  };

  const pause = async (runId: number, ms: number) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    ensureActive(runId);
  };

  const resetRun = () => {
    setStatuses(DEMO_STEPS.map(() => "pending"));
    setNotes(DEMO_STEPS.map(() => ""));
    setCurrentStep(null);
    setError(null);
    setCompleted(false);
    setSummaryResult(null);
    setProlongedEventId(null);
    setPreflightNote(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      runIdRef.current += 1;
      if (running) {
        setRunning(false);
        setStatuses((previous) =>
          previous.map((status) => (status === "running" ? "pending" : status)),
        );
      }
    }
    setOpen(next);
  };

  const startDemo = async () => {
    if (running) return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    resetRun();
    setRunning(true);

    const autoWasEnabled = settings.autoGenerateEnabled;
    let localEvents = events;

    try {
      if (resetFirst) {
        setPreflightNote(
          "Resetting demo records to a reproducible starting state…",
        );
        const reset = await resetDemoData();
        ensureActive(runId);
        localEvents = reset.events;
        setPreflightNote(
          `Demo data reset (${reset.count} seeded records, ${reset.source === "server" ? "server-generated" : "generated locally"}).`,
        );
        await pause(runId, 450);
      }

      if (autoWasEnabled) {
        updateSettings({ ...settings, autoGenerateEnabled: false });
        setPreflightNote(
          (note) =>
            `${note ? `${note} ` : ""}Automatic generation paused for this run.`,
        );
      }

      // Step 1 — delivery arrives.
      setCurrentStep(0);
      setStep(0, "running");
      await pause(runId, 300);
      const delivery = simulateEvent("delivery");
      localEvents = [delivery.event, ...localEvents].sort(
        (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
      );
      setStep(
        0,
        "done",
        "Simulated delivery-related event added at the front door.",
      );
      await pause(runId, 500);

      // Step 2 — deterministic rules.
      setCurrentStep(1);
      setStep(1, "running");
      await pause(runId, 400);
      const deliveryAttention =
        ATTENTION_META[delivery.evaluation.attentionLevel].label;
      setStep(
        1,
        "done",
        `${deliveryAttention} · ${truncate(delivery.evaluation.reasons[0] ?? "Rules evaluated.", 140)}`,
      );
      await pause(runId, 450);

      // Step 3 — AI explanation or fallback (or skipped by choice).
      setCurrentStep(2);
      setStep(2, "running", "Requesting an explanation…");
      await pause(runId, 350);
      let analysisResult: Awaited<ReturnType<typeof analyzeEventById>> = null;
      if (includeExplanation) {
        analysisResult = await analyzeEventById(delivery.event.id);
        if (!analysisResult) {
          await pause(runId, 600);
          analysisResult = await analyzeEventById(delivery.event.id);
        }
        ensureActive(runId);
        if (!analysisResult) {
          throw new Error("The delivery event could not be analyzed.");
        }
        const usedGroq = analysisResult.analysis.source === "groq";
        setStep(
          2,
          usedGroq ? "done" : "fallback",
          usedGroq
            ? `${GROQ_MODEL_LABEL} (${analysisResult.meta.model ?? "llama-3.3-70b-versatile"}) returned a validated explanation.`
            : `Deterministic fallback used. ${analysisResult.meta.message ?? ""}`,
        );
      } else {
        setStep(
          2,
          "skipped",
          "AI step turned off for this run, so no explanation request was sent.",
        );
      }
      await pause(runId, 450);

      // Step 4 — recommendation.
      setCurrentStep(3);
      setStep(3, "running");
      await pause(runId, 300);
      if (analysisResult) {
        setStep(
          3,
          "done",
          truncate(analysisResult.analysis.recommendedAction, 160),
        );
      } else {
        const recommendation = getDeterministicRecommendation(
          delivery.evaluation,
          delivery.event,
        );
        setStep(
          3,
          "done",
          truncate(
            `${recommendation.title}. ${recommendation.description}`,
            160,
          ),
        );
      }
      await pause(runId, 450);

      // Step 5 — caregiver arrival.
      setCurrentStep(4);
      setStep(4, "running");
      await pause(runId, 300);
      const caregiver = simulateEvent("caregiver");
      localEvents = [caregiver.event, ...localEvents].sort(
        (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
      );
      setStep(
        4,
        "done",
        `Simulated arrival with the label “${settings.caregiverLabel}”.`,
      );
      await pause(runId, 450);

      // Step 6 — caregiver rule.
      setCurrentStep(5);
      setStep(5, "running");
      await pause(runId, 300);
      const caregiverMatched = caregiver.evaluation.matchedRules.some(
        (rule) => rule.id === "caregiver_arrival_match",
      );
      if (!caregiverMatched) {
        throw new Error(
          "The caregiver rule did not match the simulated arrival.",
        );
      }
      setStep(
        5,
        "done",
        "Matched your caregiver-arrival rule. This is a metadata match, not verified identity.",
      );
      await pause(runId, 450);

      // Step 7 — prolonged presence.
      setCurrentStep(6);
      setStep(6, "running");
      await pause(runId, 300);
      const prolonged = simulateEvent("prolonged");
      localEvents = [prolonged.event, ...localEvents].sort(
        (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
      );
      setProlongedEventId(prolonged.event.id);
      setStep(
        6,
        "done",
        `Reported duration ${prolonged.event.durationSeconds ?? "unknown"}s; configured threshold ${settings.prolongedPresenceThresholdSeconds}s.`,
      );
      await pause(runId, 450);

      // Step 8 — threshold rule.
      setCurrentStep(7);
      setStep(7, "running");
      await pause(runId, 350);
      const attention =
        ATTENTION_META[prolonged.evaluation.attentionLevel].label;
      const thresholdMatched = prolonged.evaluation.matchedRules.some((rule) =>
        ["prolonged_presence_threshold", "high_attention_combination"].includes(
          rule.id,
        ),
      );
      setStep(
        7,
        thresholdMatched ? "done" : "fallback",
        `${attention} · ${truncate(prolonged.evaluation.reasons[0] ?? "", 140)}`,
      );
      await pause(runId, 450);

      // Step 9 — ready for inspection.
      setCurrentStep(8);
      setStep(8, "running");
      await pause(runId, 300);
      setStep(
        8,
        "done",
        "Use “Review highlighted event” below to open the full detail panel.",
      );
      await pause(runId, 450);

      // Step 10 — daily summary.
      setCurrentStep(9);
      setStep(9, "running", "Generating a summary from the recorded events…");
      const summary = await generateSummary("today", { events: localEvents });
      ensureActive(runId);
      setSummaryResult(summary);
      setStep(
        9,
        summary.meta.mode === "groq" ? "done" : "fallback",
        summary.meta.mode === "groq"
          ? `${GROQ_MODEL_LABEL} summary created from ${summary.facts.consideredEvents} recorded events.`
          : `Deterministic summary created from ${summary.facts.consideredEvents} events. ${summary.meta.message ?? ""}`,
      );
      setCurrentStep(null);
      setCompleted(true);
    } catch (caught) {
      if (caught instanceof DemoCancelledError) return;
      const message =
        caught instanceof Error
          ? caught.message
          : "The demo could not be completed.";
      setError(message);
      setStatuses((previous) => {
        const next = [...previous];
        const runningIndex = next.findIndex((status) => status === "running");
        if (runningIndex >= 0) next[runningIndex] = "error";
        return next;
      });
    } finally {
      if (autoWasEnabled) {
        updateSettings({ ...settings, autoGenerateEnabled: true });
      }
      setRunning(false);
      setCurrentStep(null);
    }
  };

  const doneCount = statuses.filter(
    (status) =>
      status === "done" || status === "fallback" || status === "skipped",
  ).length;
  const progress = Math.round((doneCount / DEMO_STEPS.length) * 100);

  const reviewHighlighted = () => {
    if (!prolongedEventId) return;
    setOpen(false);
    router.push(
      `/dashboard/timeline?event=${encodeURIComponent(prolongedEventId)}`,
    );
  };

  const openInsights = () => {
    setOpen(false);
    router.push("/dashboard/insights");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="md" className="gap-1.5">
          <Play aria-hidden="true" className="size-3.5" />
          <span>Run demo</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(94svh,54rem)] w-[min(calc(100vw-2rem),46rem)] flex-col overflow-hidden p-0">
        <div
          data-demo-scroll
          className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-6"
        >
          <DialogHeader>
            <div className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-amber/25 bg-amber-soft px-2.5 py-1 text-[11px] font-medium text-amber">
              <FlaskConical aria-hidden="true" className="size-3" />
              Simulated demo
            </div>
            <DialogTitle>Guided demo</DialogTitle>
            <DialogDescription>
              A reproducible walkthrough of event ingestion, deterministic
              rules, optional Groq/Llama&nbsp;3.3&nbsp;70B explanation, and a
              grounded daily summary. No Ring account or camera is used.
            </DialogDescription>
          </DialogHeader>

          <fieldset
            className="mt-4 space-y-2.5 rounded-lg border border-line bg-surface-2 px-3.5 py-3"
            disabled={running}
          >
            <legend className="sr-only">Demo options</legend>
            <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-5 text-ink-2">
              <input
                type="checkbox"
                checked={resetFirst}
                onChange={(event) => setResetFirst(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--brand)]"
              />
              <span>
                Reset demo data first for a reproducible run
                <span className="block text-[11px] text-muted">
                  Restores the simulated seed dataset before the run.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-5 text-ink-2">
              <input
                type="checkbox"
                checked={includeExplanation}
                onChange={(event) =>
                  setIncludeExplanation(event.target.checked)
                }
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--brand)]"
              />
              <span>
                Ask Groq ({GROQ_MODEL_LABEL}) for the explanation in step 3
                <span className="block text-[11px] text-muted">
                  Uncheck to see the deterministic explanation without sending a
                  request.
                </span>
              </span>
            </label>
          </fieldset>

          <p className="mt-2 text-[11px] leading-5 text-muted">
            The run adds 3 new simulated events and never contacts Ring or a
            camera.
          </p>

          {preflightNote ? (
            <p className="mt-2.5 text-[11.5px] leading-5 text-muted">
              {preflightNote}
            </p>
          ) : null}

          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span aria-live="polite">
                {running && currentStep !== null
                  ? `Step ${currentStep + 1} of ${DEMO_STEPS.length}: ${DEMO_STEPS[currentStep]?.title}`
                  : completed
                    ? "Demo complete"
                    : error
                      ? "Demo stopped"
                      : "Ready to start"}
              </span>
              <span>
                {doneCount}/{DEMO_STEPS.length}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Demo progress"
              aria-valuemin={0}
              aria-valuemax={DEMO_STEPS.length}
              aria-valuenow={doneCount}
              aria-valuetext={`${doneCount} of ${DEMO_STEPS.length} steps complete`}
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <ol
            ref={stepListRef}
            className="mt-4 space-y-1 pr-1"
            aria-label="Demo steps"
          >
            {DEMO_STEPS.map((step, index) => {
              const status = statuses[index] ?? "pending";
              return (
                <li
                  key={step.title}
                  data-step-index={index}
                  className={cn(
                    "flex gap-3 rounded-lg px-2.5 py-2 transition-colors",
                    status === "running" && "bg-brand-soft/60",
                    status === "error" && "bg-danger-soft/60",
                    status === "fallback" && "bg-amber-soft/50",
                  )}
                >
                  <span className="mt-0.5 shrink-0">{statusIcon(status)}</span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-[12.5px] font-medium leading-5",
                        status === "pending" ? "text-muted" : "text-ink",
                      )}
                    >
                      <span className="mr-1.5 text-[10px] tabular-nums text-muted">
                        {index + 1}.
                      </span>
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-5 text-muted">
                      {notes[index] || step.description}
                    </p>
                    <span className="sr-only">{statusLabel(status)}</span>
                    {status === "fallback" || status === "error" ? (
                      <span
                        className={cn(
                          "mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          status === "error"
                            ? "bg-danger-soft text-danger"
                            : "bg-amber-soft text-amber",
                        )}
                      >
                        {statusLabel(status)}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>

          {error ? (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-[12px] leading-5 text-danger"
            >
              <div className="flex items-start gap-2">
                <XCircle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                <p>{error}</p>
              </div>
            </div>
          ) : null}

          {summaryResult ? (
            <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Generated summary
                </p>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                    summaryResult.meta.mode === "groq"
                      ? "bg-brand-soft text-brand"
                      : "bg-amber-soft text-amber",
                  )}
                >
                  <Sparkles aria-hidden="true" className="size-3" />
                  {summaryResult.meta.mode === "groq"
                    ? `Groq · ${summaryResult.meta.model ?? "llama-3.3-70b-versatile"}`
                    : "Rules-based fallback"}
                </span>
              </div>
              <p className="mt-2 text-[13px] font-semibold text-ink">
                {summaryResult.narrative.headline}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-muted">
                {summaryResult.narrative.mainActivity}
              </p>
              <p className="mt-2 text-[10.5px] text-muted">
                Based on {summaryResult.facts.consideredEvents} recorded
                simulated events. Not continuous monitoring.
              </p>
            </div>
          ) : null}
        </div>

        <div
          data-demo-footer
          className="shrink-0 border-t border-line bg-surface px-6 py-4"
        >
          <DialogFooter>
            {running ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel demo
                </Button>
                <Button disabled>
                  <Loader2
                    aria-hidden="true"
                    className="size-3.5 animate-spin"
                  />
                  Running demo…
                </Button>
              </>
            ) : completed ? (
              <>
                <Button variant="outline" onClick={openInsights}>
                  Open insights
                </Button>
                <Button
                  variant="secondary"
                  onClick={reviewHighlighted}
                  disabled={!prolongedEventId}
                >
                  Review highlighted event
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Button>
                <Button onClick={startDemo}>
                  <Play aria-hidden="true" className="size-3.5" />
                  Run again
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button onClick={startDemo} disabled={!ready}>
                  <Play aria-hidden="true" className="size-3.5" />
                  {error ? "Try again" : "Start guided demo"}
                </Button>
              </>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
