"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Info,
  Loader2,
  Minus,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/dashboard-loading";
import { DemoDialog } from "@/components/layout/demo-dialog";
import { useApp, type AnalyticsRange } from "@/components/providers/app-provider";
import { AiSourceNotice } from "@/components/ai/source-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { computeInsightFacts, INSIGHT_RANGE_LABELS } from "@/lib/analytics/facts";
import { getAnalyticsRange } from "@/lib/utils/date";
import { getBrowserTimeZone } from "@/lib/events/summary-request";
import { formatCount, signedNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { ActivityInsight } from "@/types/ai";

const RANGES: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "7 days" },
  { value: "last_30_days", label: "30 days" },
];

function DirectionIcon({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <ArrowUpRight aria-hidden="true" className="size-3.5" />;
  if (direction === "down") return <ArrowDownRight aria-hidden="true" className="size-3.5" />;
  return <Minus aria-hidden="true" className="size-3.5" />;
}

export default function InsightsPage() {
  const { ready, events, settings, generateInsights, aiHealthStatus } = useApp();
  const now = useNow(60_000);
  const [range, setRange] = React.useState<AnalyticsRange>("last_7_days");
  const [results, setResults] = React.useState<
    Partial<Record<AnalyticsRange, ActivityInsight>>
  >({});
  const [loadingRange, setLoadingRange] = React.useState<AnalyticsRange | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const requestedRef = React.useRef(new Set<AnalyticsRange>());

  const rangeInfo = React.useMemo(() => getAnalyticsRange(range, now), [range, now]);
  const localFacts = React.useMemo(
    () =>
      computeInsightFacts(events, settings, {
        rangeLabel: range,
        from: rangeInfo.from,
        to: rangeInfo.to,
        previousFrom: rangeInfo.previousFrom,
        previousTo: rangeInfo.previousTo,
        timeZone: getBrowserTimeZone(),
      }),
    [events, settings, range, rangeInfo],
  );

  const insight = results[range] ?? null;
  const busy = loadingRange !== null;

  const generate = React.useCallback(
    async (target: AnalyticsRange) => {
      if (loadingRange === target) return;
      requestedRef.current.add(target);
      setLoadingRange(target);
      setError(null);
      try {
        const result = await generateInsights(target);
        setResults((current) => ({ ...current, [target]: result }));
      } catch {
        setError("The insight could not be generated. Your recorded events are unchanged.");
      } finally {
        setLoadingRange(null);
      }
    },
    [generateInsights, loadingRange],
  );

  React.useEffect(() => {
    if (!ready) return;
    if (aiHealthStatus !== "ready") return;
    if (results[range] || loadingRange !== null) return;
    if (requestedRef.current.has(range)) return;
    void generate(range);
  }, [ready, aiHealthStatus, range, results, loadingRange, generate]);

  if (!ready) return <DashboardLoading />;

  const meta = insight?.meta;
  const narrative = insight?.narrative;

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        eyebrow="Demo workspace"
        title="AI insights"
        description="Grounded comparisons of recorded demo events across two periods. Gemini may narrate the computed facts; it cannot invent counts or predict what will happen."
        actions={
          <>
            <div
              role="group"
              aria-label="Insight period"
              className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5"
            >
              {RANGES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRange(option.value)}
                  aria-pressed={range === option.value}
                  className={cn(
                    "rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                    range === option.value
                      ? "bg-surface text-ink shadow-sm"
                      : "text-muted hover:text-ink",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() => void generate(range)}
              disabled={loadingRange === range}
            >
              {loadingRange === range ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <RefreshCw aria-hidden="true" className="size-3.5" />
              )}
              {loadingRange === range ? "Generating…" : "Regenerate"}
            </Button>
            <DemoDialog />
          </>
        }
      />

      <Callout tone="info" icon={Info} title="What these insights are">
        Counts are computed locally from the events in your browser. The comparison is
        against the immediately preceding period of equal length. A difference in counts is
        not a trend prediction, and it is not a judgement about any person.
      </Callout>

      {error ? (
        <Callout tone="danger" title="Insight generation failed">
          {error}
        </Callout>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{INSIGHT_RANGE_LABELS[range]} in context</CardTitle>
                  <Badge tone="neutral">{localFacts.current.total} current events</Badge>
                </div>
                <CardDescription>
                  Generated from {localFacts.current.total + localFacts.previous.total}{" "}
                  recorded events across both comparison windows.
                </CardDescription>
              </div>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
                <Sparkles aria-hidden="true" className="size-4" />
              </span>
            </CardHeader>
            <CardContent className="flex-1">
              {loadingRange === range && !insight ? (
                <div className="space-y-3" aria-busy="true">
                  <span className="sr-only">Generating insights…</span>
                  <Skeleton className="h-6 w-4/5" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ) : narrative && meta ? (
                <div className="space-y-4">
                  <h2 className="text-[18px] font-semibold leading-6 tracking-[-0.02em] text-ink">
                    {narrative.headline}
                  </h2>
                  {narrative.observations.length > 0 ? (
                    <ul className="space-y-2">
                      {narrative.observations.map((observation, index) => (
                        <li
                          key={`${observation}-${index}`}
                          className="flex gap-2.5 text-[12.5px] leading-6 text-ink-2"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-2 size-1.5 shrink-0 rounded-full bg-brand/70"
                          />
                          {observation}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12.5px] leading-6 text-muted">
                      No notable observations were generated for this period.
                    </p>
                  )}

                  {meta.mode === "fallback" ? (
                    <Callout tone="warning" title="Generated without Gemini">
                      {meta.message ??
                        "AI was unavailable, so these observations were assembled deterministically from the same facts."}
                    </Callout>
                  ) : null}

                  <AiSourceNotice meta={meta} />

                  <div className="border-t border-line pt-3">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Limits of this insight
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {(narrative.limitations.length > 0
                        ? narrative.limitations
                        : localFacts.limitations
                      ).map((limitation, index) => (
                        <li
                          key={`${limitation}-${index}`}
                          className="text-[11px] leading-5 text-muted"
                        >
                          {limitation}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={Sparkles}
                  title="No insight generated yet"
                  description="Generate an insight for this period. If Gemini is unavailable, a clearly labelled deterministic version is produced."
                  action={
                    <Button onClick={() => void generate(range)} disabled={busy}>
                      {busy ? (
                        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles aria-hidden="true" className="size-3.5" />
                      )}
                      Generate insight
                    </Button>
                  }
                  className="border-line bg-surface-2/40 py-10"
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-5">
          <Card className="h-full">
            <CardHeader>
              <div>
                <CardTitle>What the numbers show</CardTitle>
                <CardDescription>
                  Deterministic counts, calculated locally before any AI request.
                </CardDescription>
              </div>
              <BarChart3 aria-hidden="true" className="size-4 shrink-0 text-muted" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Recorded events", value: localFacts.current.total },
                  { label: "Suggested review", value: localFacts.current.review + localFacts.current.highAttention },
                  { label: "Delivery-related", value: localFacts.current.deliveries },
                  { label: "Caregiver arrivals", value: localFacts.current.caregiverArrivals },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
                    <p className="text-[10.5px] text-muted">{metric.label}</p>
                    <p className="mt-0.5 text-[19px] font-semibold tabular-nums text-ink">
                      {formatCount(metric.value)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left">
                  <caption className="mb-1.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Compared with the previous period
                  </caption>
                  <thead>
                    <tr className="border-b border-line text-[10.5px] text-muted">
                      <th scope="col" className="py-1.5 pr-2 font-medium">
                        Measure
                      </th>
                      <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                        Current
                      </th>
                      <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                        Previous
                      </th>
                      <th scope="col" className="py-1.5 text-right font-medium">
                        Change
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {localFacts.comparisons.map((comparison) => (
                      <tr key={comparison.id} className="border-b border-line/70 last:border-0">
                        <th scope="row" className="py-2 pr-2 text-[11.5px] font-normal text-ink-2">
                          {comparison.label}
                        </th>
                        <td className="py-2 pr-2 text-right text-[11.5px] tabular-nums text-ink">
                          {comparison.current}
                        </td>
                        <td className="py-2 pr-2 text-right text-[11.5px] tabular-nums text-muted">
                          {comparison.previous}
                        </td>
                        <td className="py-2 text-right">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium",
                              comparison.direction === "up"
                                ? "bg-brand-soft text-brand"
                                : comparison.direction === "down"
                                  ? "bg-amber-soft text-amber"
                                  : "bg-surface-3 text-muted",
                            )}
                          >
                            <DirectionIcon direction={comparison.direction} />
                            {signedNumber(comparison.delta)}
                            <span className="sr-only">
                              {comparison.direction === "up"
                                ? "increase"
                                : comparison.direction === "down"
                                  ? "decrease"
                                  : "no change"}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <dl className="mt-4 space-y-2 border-t border-line pt-3 text-[11.5px]">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted">Most active location</dt>
                  <dd className="text-right text-ink-2">
                    {localFacts.current.topLocation
                      ? `${localFacts.current.topLocation.label} (${localFacts.current.topLocation.count})`
                      : "No events"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted">Busiest hour</dt>
                  <dd className="text-right text-ink-2">
                    {localFacts.current.busiestHour
                      ? `${localFacts.current.busiestHour.label} (${localFacts.current.busiestHour.count})`
                      : "No events"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted">Uncertain events</dt>
                  <dd className="text-right text-ink-2">
                    {localFacts.current.uncertain}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      {localFacts.current.total === 0 ? (
        <Callout tone="warning" icon={TriangleAlert} title="No events in this period">
          The selected window contains no recorded demo events, so the comparison is empty.
          Widen the period or add simulated events from the overview. RingCare AI will not
          estimate activity that was never recorded.
        </Callout>
      ) : null}

      <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[11px] leading-5 text-muted">
        <ArrowRight aria-hidden="true" className="mt-1 size-3.5 shrink-0" />
        <p>
          Insights describe this demo dataset only. They do not model real household
          routines, cannot identify anyone, and must not be used as a security decision
          system. Changes in retention settings can alter historical comparisons.
        </p>
      </div>
    </div>
  );
}
