"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  HeartHandshake,
  Info,
  Settings2,
  ShieldOff,
  UserRoundPlus,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/dashboard-loading";
import { DemoDialog } from "@/components/layout/demo-dialog";
import { EventDetailDialog } from "@/components/events/event-detail-dialog";
import { AttentionBadge, SimulatedBadge } from "@/components/events/event-visuals";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast-provider";
import { useNow } from "@/hooks/use-now";
import { getCaregiverActivity } from "@/lib/analytics/facts";
import { getEventSummary } from "@/lib/events/classifier";
import { EVENT_LOCATION_META } from "@/lib/constants/events";
import { formatClockTime, formatDayHeading, formatRelativeTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

type MatchFilter = "all" | "matched" | "unmatched";

const MATCH_FILTERS: Array<{ value: MatchFilter; label: string }> = [
  { value: "all", label: "All arrivals" },
  { value: "matched", label: "Rule matched" },
  { value: "unmatched", label: "Not matched" },
];

export default function CaregiverPage() {
  const { ready, events, settings, simulateEvent } = useApp();
  const { toast } = useToast();
  const now = useNow(60_000);
  const [filter, setFilter] = React.useState<MatchFilter>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const arrivals = React.useMemo(
    () => getCaregiverActivity(events, settings),
    [events, settings],
  );

  const matched = arrivals.filter((arrival) => arrival.matched).length;
  const unmatched = arrivals.length - matched;
  const visible = arrivals.filter((arrival) =>
    filter === "all"
      ? true
      : filter === "matched"
        ? arrival.matched
        : !arrival.matched,
  );

  if (!ready) return <DashboardLoading />;

  const criteriaLabel =
    settings.caregiverCriteria === "event_type_and_label"
      ? `event type + label “${settings.caregiverLabel}”`
      : "event type only";

  const handleSimulate = () => {
    const result = simulateEvent("caregiver");
    toast({
      title: "Caregiver arrival simulated",
      description: `Label “${settings.caregiverLabel}” was supplied by the simulator. This is metadata, not verified identity.`,
      tone: result.evaluation.matchedRules.some((rule) => rule.id === "caregiver_arrival_match")
        ? "success"
        : "warning",
    });
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        eyebrow="Demo workspace"
        title="Caregiver activity"
        description="Arrivals labelled by the simulator as caregiver events, and whether they matched your configured metadata rule. No camera imagery is analyzed and no person is identified."
        actions={
          <>
            <Button variant="outline" onClick={handleSimulate}>
              <UserRoundPlus aria-hidden="true" className="size-4" />
              Simulate arrival
            </Button>
            <DemoDialog />
          </>
        }
      />

      <Callout tone="warning" icon={ShieldOff} title="No facial recognition or identity verification">
        RingCare AI does not process faces, biometrics, appearance, or gait. A “matched”
        arrival only means the event metadata matched your configured rule. The caregiver
        label comes from the simulator and is not proof that a specific person arrived.
      </Callout>

      {!settings.caregiverAlertsEnabled ? (
        <Callout tone="info" title="Caregiver alerts are currently off">
          Arrivals are still recorded and matched against your rule, but the rule engine does
          not mark them for notification.{" "}
          <Link href="/dashboard/settings" className="font-medium text-brand underline underline-offset-2">
            Turn alerts back on
          </Link>
          .
        </Callout>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-[11px] text-muted">Caregiver events</p>
              <p className="mt-2 text-[26px] font-semibold leading-none tabular-nums text-ink">
                {arrivals.length}
              </p>
              <p className="mt-1.5 text-[10.5px] text-muted">All recorded arrivals</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] text-muted">Matched your rule</p>
              <p className="mt-2 text-[26px] font-semibold leading-none tabular-nums text-brand">
                {matched}
              </p>
              <p className="mt-1.5 text-[10.5px] text-muted">Metadata match only</p>
            </Card>
            <Card className="col-span-2 p-4 sm:col-span-1">
              <p className="text-[11px] text-muted">Not matched</p>
              <p className="mt-2 text-[26px] font-semibold leading-none tabular-nums text-ink">
                {unmatched}
              </p>
              <p className="mt-1.5 text-[10.5px] text-muted">Kept as uncertain arrivals</p>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start">
              <div>
                <CardTitle>Recorded arrivals</CardTitle>
                <CardDescription>
                  Newest first. Select an arrival to see the metadata, rule checks, and any
                  explanation.
                </CardDescription>
              </div>
              <div
                role="group"
                aria-label="Filter caregiver arrivals"
                className="inline-flex shrink-0 rounded-lg border border-line bg-surface-2 p-0.5"
              >
                {MATCH_FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFilter(option.value)}
                    aria-pressed={filter === option.value}
                    className={cn(
                      "rounded-[7px] px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                      filter === option.value
                        ? "bg-surface text-ink shadow-sm"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {visible.length === 0 ? (
                <EmptyState
                  icon={HeartHandshake}
                  title={
                    arrivals.length === 0
                      ? "No caregiver arrivals recorded"
                      : "No arrivals match this filter"
                  }
                  description={
                    arrivals.length === 0
                      ? "Use “Simulate arrival” to add a clearly labelled caregiver event, or reset the demo dataset."
                      : "Switch to “All arrivals” to see the recorded caregiver events."
                  }
                  className="border-line bg-surface-2/40 py-9"
                />
              ) : (
                <ul className="divide-y divide-line">
                  {visible.map((arrival, index) => {
                    const previous = visible[index - 1];
                    const showHeading =
                      !previous ||
                      formatDayHeading(previous.event.occurredAt, now) !==
                        formatDayHeading(arrival.event.occurredAt, now);
                    return (
                      <li key={arrival.event.id}>
                        {showHeading ? (
                          <p className="mb-1 mt-3 px-1 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted first:mt-0">
                            {formatDayHeading(arrival.event.occurredAt, now)}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setSelectedId(arrival.event.id)}
                          className="group flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-brand">
                            <HeartHandshake aria-hidden="true" className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[12.5px] font-medium text-ink">
                                {arrival.matched ? "Rule-matched arrival" : "Arrival not matched"}
                              </span>
                              <Badge tone={arrival.matched ? "routine" : "unknown"}>
                                {arrival.matched ? (
                                  <CheckCircle2 aria-hidden="true" className="size-3" />
                                ) : (
                                  <CircleDashed aria-hidden="true" className="size-3" />
                                )}
                                {arrival.matched ? "Matched" : "Not matched"}
                              </Badge>
                              <SimulatedBadge />
                            </span>
                            <span className="mt-1 block text-[11.5px] leading-5 text-muted">
                              {getEventSummary(arrival.event, arrival.evaluation)}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted">
                              <span className="tabular-nums text-ink-2">
                                {formatClockTime(arrival.event.occurredAt)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{formatRelativeTime(arrival.event.occurredAt, now)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{EVENT_LOCATION_META[arrival.event.location]}</span>
                              {arrival.suppliedLabel ? (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Label: “{arrival.suppliedLabel}”</span>
                                </>
                              ) : (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>No caregiver label supplied</span>
                                </>
                              )}
                            </span>
                          </span>
                          <AttentionBadge level={arrival.evaluation.attentionLevel} short />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Your caregiver rule</CardTitle>
                <CardDescription>Applied to every arrival event.</CardDescription>
              </div>
              <Settings2 aria-hidden="true" className="size-4 shrink-0 text-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
              <dl className="space-y-2 text-[12px]">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted">Caregiver label</dt>
                  <dd className="text-right font-medium text-ink">“{settings.caregiverLabel}”</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted">Match criteria</dt>
                  <dd className="text-right text-ink-2">{criteriaLabel}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted">Alerts</dt>
                  <dd className="text-right text-ink-2">
                    {settings.caregiverAlertsEnabled ? "Enabled" : "Off"}
                  </dd>
                </div>
              </dl>
              <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[11px] leading-5 text-muted">
                <p className="flex items-start gap-1.5">
                  <Info aria-hidden="true" className="mt-1 size-3 shrink-0" />
                  Changing the label or criteria immediately re-evaluates recorded events.
                  Past records are never altered, only re-interpreted.
                </p>
              </div>
              <Link
                href="/dashboard/settings"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand transition-colors hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Edit caregiver settings
                <Settings2 aria-hidden="true" className="size-3.5" />
              </Link>
            </CardContent>
          </Card>

          <Callout tone="neutral" title="What a match means">
            <ul className="mt-1 space-y-1.5">
              <li>
                <span className="font-medium text-ink-2">Matched:</span> the event type and
                supplied label satisfied your rule.
              </li>
              <li>
                <span className="font-medium text-ink-2">Not matched:</span> the metadata did
                not satisfy the rule. This is not suspicious by itself.
              </li>
              <li>No match ever confirms a person’s identity.</li>
            </ul>
          </Callout>
        </div>
      </div>

      <EventDetailDialog eventId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
