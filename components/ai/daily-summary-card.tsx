"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Loader2,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import type { DailySummary } from "@/types/ai";
import { AiSourceNotice } from "./source-notice";

export function DailySummaryCard() {
  const { ready, generateSummary, aiHealthStatus } = useApp();
  const [summary, setSummary] = React.useState<DailySummary | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestedRef = React.useRef(false);

  const generate = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateSummary("today");
      setSummary(result);
    } catch {
      setError("The summary could not be generated. Your recorded events are unchanged.");
    } finally {
      setLoading(false);
    }
  }, [generateSummary]);

  React.useEffect(() => {
    if (!ready || requestedRef.current) return;
    if (aiHealthStatus !== "ready") return;
    requestedRef.current = true;
    void generate();
  }, [ready, aiHealthStatus, generate]);

  const eventCount = summary?.facts.consideredEvents ?? 0;

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-brand via-brand/60 to-transparent" aria-hidden="true" />
      <CardHeader>
        <div>
          <div className="flex items-center gap-2">
            <CardTitle>Today, in plain language</CardTitle>
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
              <Sparkles aria-hidden="true" className="size-2.5" />
              AI summary
            </span>
          </div>
          <CardDescription>
            Grounded in today’s recorded demo events. Generated from the same facts shown
            below — never from live camera interpretation.
          </CardDescription>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
          <CalendarDays aria-hidden="true" className="size-4" />
        </span>
      </CardHeader>

      <CardContent className="flex-1">
        {loading && !summary ? (
          <div className="space-y-3" aria-busy="true">
            <span className="sr-only">Generating today’s summary…</span>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft/60 p-4">
            <p className="flex items-center gap-2 text-[12.5px] font-medium text-danger">
              <TriangleAlert aria-hidden="true" className="size-4" />
              {error}
            </p>
          </div>
        ) : summary ? (
          <div className="space-y-3">
            <h3 className="text-[17px] font-semibold leading-6 tracking-[-0.02em] text-ink">
              {summary.narrative.headline}
            </h3>
            <p className="text-[12.5px] leading-6 text-ink-2">
              {summary.narrative.mainActivity}
            </p>

            {summary.narrative.patterns.length > 0 ? (
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Patterns
                </p>
                <ul className="mt-1.5 space-y-1">
                  {summary.narrative.patterns.slice(0, 3).map((pattern, index) => (
                    <li
                      key={`${pattern}-${index}`}
                      className="flex gap-2 text-[11.5px] leading-5 text-muted"
                    >
                      <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-brand/60" />
                      {pattern}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {summary.narrative.reviewItems.length > 0 ? (
              <div className="rounded-lg border border-amber/20 bg-amber-soft/50 px-3 py-2.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-amber">
                  Worth reviewing
                </p>
                <ul className="mt-1 space-y-1">
                  {summary.narrative.reviewItems.slice(0, 3).map((item, index) => (
                    <li
                      key={`${item}-${index}`}
                      className="text-[11.5px] leading-5 text-ink-2"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {summary.meta.mode === "fallback" && summary.meta.reason === "missing_api_key" ? (
              <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11px] leading-5 text-muted">
                No server-side Groq key is configured, so this summary was produced by
                deterministic rules.{" "}
                <Link href="/dashboard/settings" className="font-medium text-brand underline underline-offset-2">
                  View AI settings
                </Link>
              </p>
            ) : null}

            <AiSourceNotice meta={summary.meta} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface-2/50 p-4">
            <p className="text-[12.5px] font-medium text-ink">No summary generated yet</p>
            <p className="mt-1 text-[11.5px] leading-5 text-muted">
              The AI service status is still being checked. You can request a summary now;
              if Groq is unavailable, a deterministic summary will be produced and
              clearly labelled.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={generate}
              disabled={loading || !ready}
            >
              {loading ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" className="size-3.5" />
              )}
              {loading ? "Generating…" : "Generate summary"}
            </Button>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between">
        <p className="text-[10.5px] text-muted">
          {summary
            ? `${eventCount} event${eventCount === 1 ? "" : "s"} considered · summary, not continuous monitoring`
            : "Based only on recorded demo events"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={generate}
            disabled={loading || !ready}
            aria-label="Refresh today’s summary"
          >
            {loading ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-3.5" />
            )}
            <span className={cn("hidden sm:inline")}>Refresh</span>
          </Button>
          <Link
            href="/dashboard/insights"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-brand transition-colors hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Insights
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
