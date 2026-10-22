"use client";

import { ChevronRight } from "lucide-react";
import { AttentionBadge, AiSourceBadge, EventTypeIcon, SimulatedBadge } from "./event-visuals";
import { getEventSummary } from "@/lib/events/classifier";
import {
  ATTENTION_META,
  EVENT_LOCATION_META,
  PROCESSING_STATUS_META,
} from "@/lib/constants/events";
import { formatClockTime, formatDayHeading } from "@/lib/utils/date";
import type { RingCareEvent, RuleEvaluation } from "@/types/events";
import { cn } from "@/lib/utils/cn";

export function EventRow({
  event,
  evaluation,
  onSelect,
  now,
  showDayHeading = false,
  compact = false,
}: {
  event: RingCareEvent;
  evaluation: RuleEvaluation;
  onSelect: (id: string) => void;
  now: Date;
  showDayHeading?: boolean;
  compact?: boolean;
}) {
  const summary = event.analysis?.summary ?? getEventSummary(event, evaluation);
  const time = formatClockTime(event.occurredAt);
  const dayLabel = formatDayHeading(event.occurredAt, now);

  return (
    <div className="group relative">
      {showDayHeading ? (
        <p className="mb-1.5 mt-4 px-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted first:mt-0">
          {dayLabel}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => onSelect(event.id)}
        aria-label={`Open details for ${summary} at ${time}, ${EVENT_LOCATION_META[event.location]}${event.simulated ? ", simulated" : ""}, attention: ${ATTENTION_META[evaluation.attentionLevel].label}`}
        className={cn(
          "flex w-full items-start gap-3 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition-colors hover:border-line hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          compact ? "sm:gap-2.5" : "sm:gap-3.5 sm:px-3",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-2",
            compact ? "size-8" : "size-9",
          )}
        >
          <EventTypeIcon type={event.eventType} className={compact ? "size-3.5" : "size-4"} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-medium leading-5 text-ink">
              {summary}
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
            <span className="tabular-nums text-ink-2">{time}</span>
            <span aria-hidden="true">·</span>
            <span>{EVENT_LOCATION_META[event.location]}</span>
            {event.simulated ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-amber">
                  <SimulatedBadge className="border-0 bg-transparent px-0 text-[11px] font-normal" />
                </span>
              </>
            ) : null}
            {event.analysis?.source === "groq" ? (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {event.analysis.model
                    ? `Explained by ${event.analysis.model}`
                    : "Explained by Llama 3.3 70B"}
                </span>
              </>
            ) : event.processingStatus === "received" ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{PROCESSING_STATUS_META[event.processingStatus].label}</span>
              </>
            ) : null}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <AttentionBadge level={evaluation.attentionLevel} />
            <AiSourceBadge source={event.analysis?.source ?? null} cached={event.analysis?.cached} />
          </span>
        </span>

        <ChevronRight
          aria-hidden="true"
          className="mt-2 size-4 shrink-0 text-line-strong transition-colors group-hover:text-muted"
        />
      </button>
    </div>
  );
}
