"use client";

import Link from "next/link";
import { ArrowRight, ScanSearch, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AttentionBadge, EventTypeIcon } from "@/components/events/event-visuals";
import { EVENT_LOCATION_META, EVENT_TYPE_META } from "@/lib/constants/events";
import { formatRelativeTime } from "@/lib/utils/date";
import type { AttentionItem } from "@/lib/analytics/facts";

export function AttentionQueue({
  items,
  now,
  onSelect,
}: {
  items: AttentionItem[];
  now: Date;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div>
          <CardTitle>Worth a look</CardTitle>
          <CardDescription>
            Rule-suggested review items, highest priority first. Not a threat assessment.
          </CardDescription>
        </div>
        <ScanSearch aria-hidden="true" className="size-4 shrink-0 text-muted" />
      </CardHeader>
      <CardContent className="flex-1">
        {items.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nothing flagged for review"
            description="No recorded event met your review thresholds or contained insufficient information. This does not guarantee nothing happened."
            className="border-line bg-surface-2/40 py-8"
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.event.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.event.id)}
                  className="flex w-full items-start gap-3 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-2">
                    <EventTypeIcon type={item.event.eventType} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12.5px] font-medium text-ink">
                        {EVENT_TYPE_META[item.event.eventType].label}
                      </span>
                      <AttentionBadge level={item.evaluation.attentionLevel} short />
                    </span>
                    <span className="mt-1 block truncate text-[11.5px] leading-5 text-muted">
                      {item.evaluation.reasons[0] ?? "Review the available details."}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] text-muted">
                      {EVENT_LOCATION_META[item.event.location]} ·{" "}
                      {formatRelativeTime(item.event.occurredAt, now)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter>
        <Link
          href="/dashboard/timeline?attention=review"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand transition-colors hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Open filtered timeline
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </CardFooter>
    </Card>
  );
}
