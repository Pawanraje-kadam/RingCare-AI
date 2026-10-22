"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  CircleHelp,
  HeartHandshake,
  Package,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { AttentionQueue } from "@/components/dashboard/attention-queue";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { DailySummaryCard } from "@/components/ai/daily-summary-card";
import { MethodCard } from "@/components/dashboard/method-card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { SimulatorPanel } from "@/components/events/simulator-panel";
import { DemoDialog } from "@/components/layout/demo-dialog";
import { DashboardLoading } from "@/components/layout/dashboard-loading";
import { EventDetailDialog } from "@/components/events/event-detail-dialog";
import { useApp } from "@/components/providers/app-provider";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import { useNow } from "@/hooks/use-now";
import { getAttentionQueue, computeOverviewStats } from "@/lib/analytics/facts";
import { formatCount } from "@/lib/utils/format";

export default function OverviewPage() {
  const { ready, events, settings, evaluations, aiHealth, aiHealthStatus } = useApp();
  const now = useNow(60_000);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const stats = React.useMemo(
    () => computeOverviewStats(events, settings, now),
    [events, settings, now],
  );
  const attention = React.useMemo(
    () => getAttentionQueue(events, settings, 4),
    [events, settings],
  );

  if (!ready) return <DashboardLoading />;

  const matchedCaregivers = Math.max(
    0,
    stats.caregiverArrivals7d - stats.unmatchedCaregiverArrivals,
  );
  const aiConfigured = Boolean(aiHealth?.configured);
  const aiOff = !settings.aiEnabled;

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        eyebrow="Demo workspace"
        title="Your front door, understood."
        description="A calm read on what the simulator recorded, why the rules flagged it, and what — if anything — may be worth a look. Every event here is synthetic."
        actions={
          <>
            <Link
              href="/dashboard/timeline"
              className="inline-flex h-9.5 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Event timeline
            </Link>
            <DemoDialog />
          </>
        }
      />

      <Callout tone="warning" title="This is a simulation, not a security system">
        RingCare AI is not connected to a Ring account, camera, or real doorbell. All events
        are generated locally and marked simulated. AI explanations may occasionally be
        produced by deterministic rules when Gemini is unavailable — the source is always
        labelled.{" "}
        <Link
          href="/dashboard/timeline"
          className="font-medium text-brand underline underline-offset-2"
        >
          Inspect the records
        </Link>
        .
      </Callout>

      {!aiOff && aiHealthStatus === "ready" && !aiConfigured ? (
        <Callout
          tone="info"
          title="Rules-only mode"
          icon={TriangleAlert}
        >
          No server-side <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[11px]">GEMINI_API_KEY</code>{" "}
          is configured, so every explanation, summary, and search falls back to
          deterministic logic. The app remains fully usable.{" "}
          <Link href="/dashboard/settings" className="font-medium text-brand underline underline-offset-2">
            Review AI settings
          </Link>
          .
        </Callout>
      ) : null}

      {aiOff ? (
        <Callout tone="info" title="AI analysis is turned off">
          Explanations and summaries are generated locally from deterministic rules.{" "}
          <Link href="/dashboard/settings" className="font-medium text-brand underline underline-offset-2">
            Turn it back on in Settings
          </Link>
          .
        </Callout>
      ) : null}

      <section aria-labelledby="overview-metrics">
        <h2 id="overview-metrics" className="sr-only">
          Overview metrics
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            label="Events recorded"
            value={formatCount(stats.total)}
            hint={`${stats.deliveriesToday} delivery-related today`}
            icon={CalendarClock}
            footnote={`Retained locally · limit ${settings.retentionLimit}`}
          />
          <MetricCard
            label="Suggested review"
            value={formatCount(stats.needsReview)}
            hint={`${stats.highAttention} needing attention · ${stats.review} review`}
            icon={ShieldAlert}
            emphasis={stats.highAttention > 0 ? "attention" : stats.needsReview > 0 ? "review" : "default"}
            footnote="Any attention level — not a threat score"
          />
          <MetricCard
            label="Delivery-related"
            value={formatCount(stats.deliveries7d)}
            hint="Recorded in the last 7 days"
            icon={Package}
            footnote="Source metadata, not delivery confirmation"
          />
          <MetricCard
            label="Caregiver arrivals"
            value={formatCount(stats.caregiverArrivals7d)}
            hint={`${matchedCaregivers} matched your rule`}
            icon={HeartHandshake}
            footnote="Metadata rule match — not verified identity"
          />
          <MetricCard
            label="Uncertain"
            value={formatCount(stats.uncertain)}
            hint="Insufficient information to classify"
            icon={CircleHelp}
            emphasis={stats.uncertain > 0 ? "review" : "default"}
            footnote="Shown as uncertain, never guessed"
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <DailySummaryCard />
        </div>
        <div className="xl:col-span-5">
          <AttentionQueue items={attention} now={now} onSelect={setSelectedId} />
        </div>

        <div className="xl:col-span-7">
          <ActivityChart />
        </div>
        <div className="xl:col-span-5">
          <SimulatorPanel />
        </div>

        <div className="xl:col-span-7">
          <RecentActivity
            events={events}
            evaluations={evaluations}
            now={now}
            onSelect={setSelectedId}
          />
        </div>
        <div className="xl:col-span-5">
          <MethodCard />
        </div>
      </div>

      <Callout tone="neutral" title="Demo boundaries">
        <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
          <li>No Ring credentials, endpoints, or live device connection.</li>
          <li>No facial recognition, identity inference, or appearance judgments.</li>
          <li>Retention and settings are stored in this browser only.</li>
          <li>In-memory rate limits apply per server instance, not globally.</li>
        </ul>
      </Callout>

      <EventDetailDialog eventId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
