"use client";

import * as React from "react";
import {
  ArrowUpRight,
  Clock3,
  Info,
  Loader2,
  RefreshCw,
  ShieldQuestion,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useNow } from "@/hooks/use-now";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import {
  ATTENTION_META,
  EVENT_LOCATION_META,
  EVENT_TYPE_META,
  PROCESSING_STATUS_META,
} from "@/lib/constants/events";
import {
  getDeterministicRecommendation,
  getEventFacts,
  getEventSummary,
} from "@/lib/events/classifier";
import { formatDateTime, formatRelativeTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import {
  AiSourceBadge,
  AttentionBadge,
  EventTypeIcon,
  SimulatedBadge,
} from "./event-visuals";

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="border-t border-line pt-4">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EventDetailDialog({
  eventId,
  onClose,
}: {
  eventId: string | null;
  onClose: () => void;
}) {
  const { ready, events, evaluations, analyzeEventById, analyzingIds, removeEvent, settings } =
    useApp();
  const { toast } = useToast();
  const now = useNow(30_000);
  const [confirmRemove, setConfirmRemove] = React.useState(false);

  const event = eventId ? events.find((candidate) => candidate.id === eventId) : undefined;
  const evaluation = event ? evaluations.get(event.id) : undefined;
  const analyzing = event ? analyzingIds.has(event.id) : false;

  React.useEffect(() => {
    if (eventId && ready && !event) onClose();
  }, [eventId, event, ready, onClose]);

  const handleAnalyze = async () => {
    if (!event) return;
    const result = await analyzeEventById(event.id);
    if (!result) {
      toast({
        title: "Analysis did not start",
        description:
          "This event may have been removed, or an analysis is already in progress.",
        tone: "warning",
      });
      return;
    }
    toast({
      title:
        result.meta.mode === "groq"
          ? `${result.meta.model ?? "GPT-OSS 120B"} explanation ready`
          : "Rules-based explanation ready",
      description:
        result.meta.mode === "groq"
          ? "The response was validated before it was attached to the event."
          : result.meta.message,
      tone: result.meta.mode === "groq" ? "success" : "info",
    });
  };

  const handleRemove = () => {
    if (!event) return;
    removeEvent(event.id);
    setConfirmRemove(false);
    onClose();
    toast({ title: "Event removed", description: "The demo record was removed from this browser.", tone: "info" });
  };

  const recommendation = event && evaluation ? getDeterministicRecommendation(evaluation, event) : null;
  const facts = event ? getEventFacts(event) : [];
  const analysis = event?.analysis;

  return (
    <>
      <Dialog open={Boolean(eventId)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
        <DialogContent className="w-[min(calc(100vw-2rem),42rem)] p-0">
          {!event || !evaluation ? (
            <div className="p-6">
              <DialogTitle>Event not found</DialogTitle>
              <DialogDescription className="mt-2">
                This event is no longer in the local demo store.
              </DialogDescription>
            </div>
          ) : (
            <>
              <div className="border-b border-line bg-surface-2/60 px-6 pb-4 pt-6">
                <DialogHeader>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AttentionBadge level={evaluation.attentionLevel} />
                    <SimulatedBadge />
                    <AiSourceBadge source={analysis?.source ?? null} cached={analysis?.cached} />
                  </div>
                  <div className="mt-3 flex items-start gap-3">
                    <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink-2">
                      <EventTypeIcon type={event.eventType} className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <DialogTitle>{EVENT_TYPE_META[event.eventType].label}</DialogTitle>
                      <DialogDescription>
                        {formatDateTime(event.occurredAt)} ·{" "}
                        {formatRelativeTime(event.occurredAt, now)} ·{" "}
                        {EVENT_LOCATION_META[event.location]}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <p className="mt-3 text-[13px] leading-6 text-ink-2">
                  {getEventSummary(event, evaluation)}
                </p>
              </div>

              <div className="max-h-[calc(86svh-13rem)] space-y-4 overflow-y-auto px-6 py-4">
                <Callout tone="neutral" title="What this event is">
                  {event.simulated
                    ? "A synthetic demo event created by the simulator. It is not a real camera observation or a Ring event."
                    : "A validated event from the integration boundary."}{" "}
                  Status: {PROCESSING_STATUS_META[event.processingStatus].label}.
                </Callout>

                <Section title="Recommendation">
                  <div className="rounded-xl border border-line bg-surface-2 p-3.5">
                    <p className="text-[13px] font-medium text-ink">
                      {recommendation?.title ?? "No recommendation available"}
                    </p>
                    <p className="mt-1 text-[12px] leading-5 text-muted">
                      {recommendation?.description}
                    </p>
                    <p className="mt-2 text-[10.5px] uppercase tracking-[0.1em] text-muted">
                      Category: {recommendation?.category.replace(/_/g, " ") ?? "unknown"}
                    </p>
                  </div>
                </Section>

                <Section
                  title="AI explanation"
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAnalyze}
                      disabled={analyzing}
                    >
                      {analyzing ? (
                        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                      ) : analysis ? (
                        <RefreshCw aria-hidden="true" className="size-3.5" />
                      ) : (
                        <Sparkles aria-hidden="true" className="size-3.5" />
                      )}
                      {analyzing ? "Analyzing…" : analysis ? "Re-analyze" : "Generate explanation"}
                    </Button>
                  }
                >
                  {analysis ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[13px] font-medium leading-6 text-ink">
                          {analysis.summary}
                        </p>
                        <p className="mt-1.5 text-[12px] leading-5 text-muted">
                          {analysis.eventInterpretation}
                        </p>
                      </div>
                      {analysis.evidence.length > 0 ? (
                        <div>
                          <p className="text-[11px] font-medium text-ink-2">Evidence used</p>
                          <ul className="mt-1 space-y-1">
                            {analysis.evidence.map((item, index) => (
                              <li
                                key={`${item}-${index}`}
                                className="flex gap-2 text-[11.5px] leading-5 text-muted"
                              >
                                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-line-strong" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {analysis.uncertainty.length > 0 ? (
                        <div>
                          <p className="text-[11px] font-medium text-ink-2">
                            Uncertainties
                          </p>
                          <ul className="mt-1 space-y-1">
                            {analysis.uncertainty.map((item, index) => (
                              <li
                                key={`${item}-${index}`}
                                className="flex gap-2 text-[11.5px] leading-5 text-muted"
                              >
                                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-amber" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                          Suggested action
                        </p>
                        <p className="mt-1 text-[12px] leading-5 text-ink-2">
                          {analysis.recommendedAction}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-muted">
                        <span>
                          {analysis.source === "groq"
                            ? `Groq · ${analysis.model ?? "configured model"}`
                            : "Deterministic rules-based fallback"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Confidence: {analysis.confidence}</span>
                        {analysis.cached ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>cached</span>
                          </>
                        ) : null}
                        <span aria-hidden="true">·</span>
                        <span>{formatDateTime(analysis.generatedAt)}</span>
                      </div>
                      {analysis.source === "fallback" ? (
                        <Callout tone="warning" title="AI was not used for this explanation">
                          {analysis.notice ??
                            analysis.fallbackReason ??
                            "Groq was unavailable, so a deterministic explanation was generated."}
                        </Callout>
                      ) : null}
                      {analysis.limitations.length > 0 ? (
                        <div className="text-[10.5px] leading-5 text-muted">
                          <span className="font-medium text-ink-2">Limitations: </span>
                          {analysis.limitations.join(" ")}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-line-strong bg-surface-2/60 px-3.5 py-3">
                      <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                      <p className="text-[12px] leading-5 text-muted">
                        No explanation has been generated for this event yet. The
                        deterministic summary and rule evaluation below are always
                        available without AI.
                      </p>
                    </div>
                  )}
                </Section>

                <Section title="Deterministic rule evaluation">
                  <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <AttentionBadge level={evaluation.attentionLevel} />
                      <span className="text-[11.5px] text-muted">
                        {ATTENTION_META[evaluation.attentionLevel].description}
                      </span>
                    </div>
                    <ul className="mt-2.5 space-y-1.5">
                      {evaluation.reasons.map((reason) => (
                        <li key={reason} className="flex gap-2 text-[12px] leading-5 text-ink-2">
                          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 space-y-1">
                      {evaluation.matchedRules.length > 0 ? (
                        evaluation.matchedRules.map((rule) => (
                          <div key={`${rule.id}-${rule.label}`} className="flex items-start gap-2 text-[11.5px] leading-5">
                            <span className="mt-0.5 rounded bg-brand-soft px-1.5 text-[10px] font-medium text-brand">
                              matched
                            </span>
                            <span className="text-muted">
                              <span className="text-ink-2">{rule.label}:</span> {rule.explanation}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[11.5px] text-muted">No review rules matched.</p>
                      )}
                    </div>
                  </div>
                </Section>

                <Section title="Rules checked">
                  <ul className="space-y-1">
                    {evaluation.evaluatedRules.map((rule) => (
                      <li
                        key={`${rule.id}-${rule.label}`}
                        className="flex items-start justify-between gap-3 rounded-lg px-1 py-1 text-[11.5px] leading-5"
                      >
                        <span className="min-w-0">
                          <span className="text-ink-2">{rule.label}</span>
                          <span className="block text-[10.5px] text-muted">{rule.detail}</span>
                        </span>
                        <Badge tone={rule.passed ? "routine" : "neutral"} className="shrink-0">
                          {rule.passed ? "Condition met" : "Not met"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </Section>

                <Section title="Event facts">
                  <dl className="divide-y divide-line rounded-xl border border-line">
                    {facts.map((fact) => (
                      <div key={fact.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-3 px-3.5 py-2.5">
                        <dt className="text-[11.5px] text-muted">{fact.label}</dt>
                        <dd
                          className={cn(
                            "text-right text-[11.5px] leading-5",
                            fact.missing ? "italic text-muted" : "text-ink-2",
                          )}
                        >
                          {fact.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Section>

                <Section title="Uncertainty">
                  <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3">
                    <ShieldQuestion aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                    <div className="text-[11.5px] leading-5 text-muted">
                      {evaluation.missingInformation.length > 0 ? (
                        <ul className="space-y-1">
                          {evaluation.missingInformation.map((item, index) => (
                            <li key={`${item}-${index}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>
                          No missing information was flagged, but this event still does not
                          establish identity, intent, or danger.
                        </p>
                      )}
                    </div>
                  </div>
                </Section>

                <Section title="Notification decision">
                  <p className="text-[11.5px] leading-5 text-muted">
                    {evaluation.notify
                      ? `The rules selected this event for your in-app notification preference. ${
                          settings.notificationPreferences[event.eventType]
                            ? ""
                            : "The preference for this event type is currently off."
                        }`
                      : "The rules did not select this event for notification. You can still review it at any time."}{" "}
                    RingCare AI does not send push notifications.
                  </p>
                </Section>
              </div>

              <DialogFooter className="justify-between border-t border-line px-6 py-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted hover:text-danger"
                  onClick={() => setConfirmRemove(true)}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Remove event
                </Button>
                <div className="flex items-center gap-2">
                  <span className="hidden items-center gap-1 text-[10.5px] text-muted sm:flex">
                    <Clock3 aria-hidden="true" className="size-3" />
                    Stored in this browser
                  </span>
                  <Button variant="secondary" onClick={onClose}>
                    Close
                    <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove this demo event?"
        description="This removes the event and its explanation from this browser. It does not affect any real device or Ring account."
        confirmLabel="Remove event"
        onConfirm={handleRemove}
      />
    </>
  );
}
