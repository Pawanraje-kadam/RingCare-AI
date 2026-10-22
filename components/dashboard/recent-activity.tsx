"use client";

import Link from "next/link";
import { ArrowRight, History } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EventRow } from "@/components/events/event-row";
import type { RingCareEvent, RuleEvaluation } from "@/types/events";

export function RecentActivity({
  events,
  evaluations,
  now,
  onSelect,
  limit = 6,
}: {
  events: RingCareEvent[];
  evaluations: Map<string, RuleEvaluation>;
  now: Date;
  onSelect: (id: string) => void;
  limit?: number;
}) {
  const recent = [...events]
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            The latest simulated events. Select one to inspect evidence, rules, and the
            explanation.
          </CardDescription>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
          <History aria-hidden="true" className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <EmptyState
            icon={History}
            title="No recorded events"
            description="The local demo store is empty. Add a simulated event or reset the demo dataset."
            className="border-line bg-surface-2/40 py-8"
          />
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((event) => {
              const evaluation = evaluations.get(event.id);
              if (!evaluation) return null;
              return (
                <li key={event.id}>
                  <EventRow
                    event={event}
                    evaluation={evaluation}
                    onSelect={onSelect}
                    now={now}
                    compact
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <CardFooter>
        <Link
          href="/dashboard/timeline"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand transition-colors hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          View the full timeline
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </CardFooter>
    </Card>
  );
}
