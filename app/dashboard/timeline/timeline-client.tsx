"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  FilterX,
  Loader2,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/dashboard-loading";
import { DemoDialog } from "@/components/layout/demo-dialog";
import { EventDetailDialog } from "@/components/events/event-detail-dialog";
import { EventRow } from "@/components/events/event-row";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-provider";
import { useNow } from "@/hooks/use-now";
import {
  ATTENTION_LEVELS,
  ATTENTION_META,
  EVENT_LOCATION_META,
  EVENT_LOCATIONS,
  EVENT_TYPE_META,
  EVENT_TYPES,
} from "@/lib/constants/events";
import {
  SEARCH_DATE_PRESET_LABELS,
  SEARCH_DATE_PRESETS,
  SEARCH_SORTS,
  SEARCH_SUGGESTIONS,
  TIME_OF_DAY,
  TIME_OF_DAY_LABELS,
} from "@/lib/constants/search";
import { executeSearchPlan } from "@/lib/events/search";
import type { SearchInterpretation, SearchPlan } from "@/types/search";
import { getLocalDayKey } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

const PAGE_SIZE = 10;

const SORT_LABELS: Record<(typeof SEARCH_SORTS)[number], string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  longest: "Longest duration first",
};

function defaultPlan(attention: string | null): SearchPlan {
  const attentionLevels =
    attention === "high_attention"
      ? (["high_attention"] as const)
      : attention === "review"
        ? (["review", "high_attention", "unknown"] as const)
        : [];
  return {
    intent: "filter",
    eventTypes: [],
    locations: [],
    datePreset: "all_time",
    timeOfDay: null,
    minDurationSeconds: null,
    attentionLevels: [...attentionLevels],
    caregiverMatchedOnly: false,
    keyword: null,
    sort: "newest",
    clarifyingQuestion: null,
  };
}

function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="mb-1.5 text-[11px] font-medium text-muted">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function TimelineClient() {
  const searchParams = useSearchParams();
  const { ready, events, settings, searchEvents } = useApp();
  const { toast } = useToast();
  const now = useNow(60_000);

  const [plan, setPlan] = React.useState<SearchPlan>(() =>
    defaultPlan(searchParams.get("attention")),
  );
  const [interpretation, setInterpretation] = React.useState<SearchInterpretation | null>(
    null,
  );
  const [warning, setWarning] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    searchParams.get("event"),
  );

  const result = React.useMemo(
    () => executeSearchPlan(events, plan, settings, now),
    [events, plan, settings, now],
  );

  const pageCount = Math.max(1, Math.ceil(result.matches.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageMatches = result.matches.slice(pageStart, pageStart + PAGE_SIZE);

  const typeValue =
    plan.eventTypes.length === 0
      ? "all"
      : plan.eventTypes.length === 1
        ? plan.eventTypes[0]
        : "multiple";
  const attentionValue =
    plan.attentionLevels.length === 0
      ? "all"
      : plan.attentionLevels.length === 1
        ? plan.attentionLevels[0]
        : "multiple";
  const locationValue =
    plan.locations.length === 0
      ? "all"
      : plan.locations.length === 1
        ? plan.locations[0]
        : "multiple";

  const updatePlan = (patch: Partial<SearchPlan>) => {
    setPlan((current) => ({
      ...current,
      ...patch,
      intent: "filter",
      clarifyingQuestion: null,
    }));
    setInterpretation(null);
    setWarning(null);
    setPage(1);
  };

  const resetAll = () => {
    setPlan(defaultPlan(null));
    setInterpretation(null);
    setWarning(null);
    setQuery("");
    setPage(1);
  };

  const runSearch = async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      toast({
        title: "Enter a search request",
        description: "Try “delivery events from today” or “events lasting over a minute”.",
        tone: "info",
      });
      return;
    }
    setSearching(true);
    try {
      const response = await searchEvents(trimmed);
      setPlan(response.plan);
      setInterpretation({
        plan: response.plan,
        interpretedBy: response.interpretedBy,
        meta: response.meta,
      });
      setWarning(response.warning ?? null);
      setQuery(trimmed);
      setPage(1);
      toast({
        title:
          response.interpretedBy === "gemini"
            ? "Search interpreted by Gemini"
            : "Search interpreted locally",
        description: `${response.result.matches.length} matching event${
          response.result.matches.length === 1 ? "" : "s"
        } in the local demo store.`,
        tone: "info",
      });
    } catch {
      toast({
        title: "Search could not run",
        description: "The query could not be interpreted. Try a shorter request.",
        tone: "error",
      });
    } finally {
      setSearching(false);
    }
  };

  if (!ready) return <DashboardLoading />;

  const rangeStart = result.matches.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, result.matches.length);
  const clarifying =
    Boolean(plan.clarifyingQuestion) ||
    result.matches.length === 0 && /clarif/i.test(result.summary);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        eyebrow="Demo workspace"
        title="Event timeline"
        description="Every recorded simulated event, the deterministic rules applied to it, and any explanation generated. Search requests are interpreted into a constrained plan and executed only against your local records."
        actions={<DemoDialog />}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Ask or filter</CardTitle>
            <CardDescription>
              Natural-language requests are parsed into an allow-listed filter plan. Event
              text is treated as data and is never executed as an instruction.
            </CardDescription>
          </div>
          <SlidersHorizontal aria-hidden="true" className="size-4 shrink-0 text-muted" />
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch(query);
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <div className="min-w-0 flex-1">
              <Label htmlFor="event-search" className="sr-only">
                Search recorded events
              </Label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                />
                <Input
                  id="event-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. Show delivery events from the last 7 days"
                  maxLength={240}
                  className="pl-9"
                  aria-describedby="event-search-hint"
                  autoComplete="off"
                />
              </div>
              <p id="event-search-hint" className="mt-1.5 text-[11px] leading-4 text-muted">
                Interpreted by Gemini when available, otherwise by a local deterministic
                parser. Search never reads or writes anything outside this demo.
              </p>
            </div>
            <Button type="submit" disabled={searching || !query.trim()} className="sm:mt-0">
              {searching ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" className="size-4" />
              )}
              {searching ? "Interpreting…" : "Search"}
            </Button>
            <Button type="button" variant="outline" onClick={resetAll}>
              Reset
            </Button>
          </form>

          <div className="flex flex-wrap gap-1.5" aria-label="Example searches">
            {SEARCH_SUGGESTIONS.slice(0, 4).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setQuery(suggestion);
                  void runSearch(suggestion);
                }}
                disabled={searching}
                className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-brand/30 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {warning ? (
            <Callout tone="warning" title="Search ran without Gemini">
              {warning}
            </Callout>
          ) : null}

          {interpretation ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
              <Badge tone={interpretation.interpretedBy === "gemini" ? "brand" : "neutral"}>
                <Sparkles aria-hidden="true" className="size-3" />
                {interpretation.interpretedBy === "gemini"
                  ? "Interpreted by Gemini"
                  : "Interpreted locally"}
              </Badge>
              <p className="min-w-0 flex-1 text-[11.5px] leading-5 text-muted">
                {interpretation.meta.mode === "fallback" && interpretation.meta.message
                  ? interpretation.meta.message
                  : "The validated plan below ran against the local demo records."}
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <FilterField id="filter-type" label="Event type">
              <Select
                id="filter-type"
                value={typeValue}
                onChange={(event) => {
                  if (event.target.value === "multiple") return;
                  updatePlan({
                    eventTypes:
                      event.target.value === "all"
                        ? []
                        : [event.target.value as (typeof EVENT_TYPES)[number]],
                  });
                }}
              >
                <option value="all">All event types</option>
                {plan.eventTypes.length > 1 ? (
                  <option value="multiple">
                    {plan.eventTypes.length} types selected
                  </option>
                ) : null}
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EVENT_TYPE_META[type].label}
                  </option>
                ))}
              </Select>
            </FilterField>

            <FilterField id="filter-attention" label="Attention level">
              <Select
                id="filter-attention"
                value={attentionValue}
                onChange={(event) => {
                  if (event.target.value === "multiple") return;
                  updatePlan({
                    attentionLevels:
                      event.target.value === "all"
                        ? []
                        : [event.target.value as (typeof ATTENTION_LEVELS)[number]],
                  });
                }}
              >
                <option value="all">Any attention level</option>
                {plan.attentionLevels.length > 1 ? (
                  <option value="multiple">
                    {plan.attentionLevels.length} levels selected
                  </option>
                ) : null}
                {ATTENTION_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {ATTENTION_META[level].label}
                  </option>
                ))}
              </Select>
            </FilterField>

            <FilterField id="filter-location" label="Location">
              <Select
                id="filter-location"
                value={locationValue}
                onChange={(event) => {
                  if (event.target.value === "multiple") return;
                  updatePlan({
                    locations:
                      event.target.value === "all"
                        ? []
                        : [event.target.value as (typeof EVENT_LOCATIONS)[number]],
                  });
                }}
              >
                <option value="all">Any location</option>
                {plan.locations.length > 1 ? (
                  <option value="multiple">
                    {plan.locations.length} locations selected
                  </option>
                ) : null}
                {EVENT_LOCATIONS.map((location) => (
                  <option key={location} value={location}>
                    {EVENT_LOCATION_META[location]}
                  </option>
                ))}
              </Select>
            </FilterField>

            <FilterField id="filter-date" label="Date range">
              <Select
                id="filter-date"
                value={plan.datePreset}
                onChange={(event) =>
                  updatePlan({
                    datePreset: event.target.value as SearchPlan["datePreset"],
                  })
                }
              >
                {SEARCH_DATE_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {SEARCH_DATE_PRESET_LABELS[preset]}
                  </option>
                ))}
              </Select>
            </FilterField>

            <FilterField id="filter-time" label="Time of day">
              <Select
                id="filter-time"
                value={plan.timeOfDay ?? "any"}
                onChange={(event) =>
                  updatePlan({
                    timeOfDay:
                      event.target.value === "any"
                        ? null
                        : (event.target.value as (typeof TIME_OF_DAY)[number]),
                  })
                }
              >
                <option value="any">Any time of day</option>
                {TIME_OF_DAY.map((time) => (
                  <option key={time} value={time}>
                    {TIME_OF_DAY_LABELS[time]}
                  </option>
                ))}
              </Select>
            </FilterField>

            <FilterField id="filter-sort" label="Sort">
              <Select
                id="filter-sort"
                value={plan.sort}
                onChange={(event) =>
                  updatePlan({ sort: event.target.value as SearchPlan["sort"] })
                }
              >
                {SEARCH_SORTS.map((sort) => (
                  <option key={sort} value={sort}>
                    {SORT_LABELS[sort]}
                  </option>
                ))}
              </Select>
            </FilterField>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-muted">
              <input
                type="checkbox"
                checked={plan.caregiverMatchedOnly}
                onChange={(event) =>
                  updatePlan({ caregiverMatchedOnly: event.target.checked })
                }
                className="size-4 rounded border-line-strong"
              />
              Only arrivals that matched my caregiver rule
            </label>
            <Button variant="ghost" size="sm" onClick={resetAll}>
              <FilterX aria-hidden="true" className="size-3.5" />
              Clear filters
            </Button>
          </div>

          <p className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] leading-5 text-muted">
            <span className="font-medium text-ink-2">Active plan:</span> {result.description}
          </p>
        </CardContent>
      </Card>

      <Card aria-busy={searching}>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start">
          <div>
            <CardTitle>
              {result.matches.length} matching event
              {result.matches.length === 1 ? "" : "s"}
            </CardTitle>
            <CardDescription>{result.summary}</CardDescription>
          </div>
          <Badge tone="neutral" className="shrink-0">
            Page {safePage} of {pageCount}
          </Badge>
        </CardHeader>
        <CardContent>
          {result.matches.length === 0 ? (
            <EmptyState
              icon={Search}
              title={clarifying ? "More detail needed" : "No matching events"}
              description={
                clarifying
                  ? plan.clarifyingQuestion ??
                    "Try adding an event type, location, or date range."
                  : "No recorded event matches this plan. Try widening the date range or clearing a filter. RingCare AI never invents matching records."
              }
              action={
                <Button variant="outline" size="sm" onClick={resetAll}>
                  Clear filters
                </Button>
              }
              className="border-line bg-surface-2/40 py-10"
            />
          ) : (
            <ul className="divide-y divide-line">
              {pageMatches.map((match, index) => {
                const previous = pageMatches[index - 1];
                const showHeading =
                  !previous ||
                  getLocalDayKey(previous.event.occurredAt) !==
                    getLocalDayKey(match.event.occurredAt);
                return (
                  <li key={match.event.id}>
                    <EventRow
                      event={match.event}
                      evaluation={match.evaluation}
                      onSelect={setSelectedId}
                      now={now}
                      showDayHeading={showHeading}
                      compact
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
        {result.matches.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
            <p className="text-[11.5px] text-muted">
              Showing {rangeStart}–{rangeEnd} of {result.matches.length}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft aria-hidden="true" className="size-3.5" />
                Previous
              </Button>
              <div className="flex items-center gap-1" aria-label="Pagination">
                {Array.from({ length: pageCount }, (_, index) => index + 1)
                  .filter(
                    (candidate) =>
                      candidate === 1 ||
                      candidate === pageCount ||
                      Math.abs(candidate - safePage) <= 1,
                  )
                  .map((candidate, index, list) => {
                    const previous = list[index - 1];
                    const gap = previous !== undefined && candidate - previous > 1;
                    return (
                      <React.Fragment key={candidate}>
                        {gap ? <span className="px-1 text-[11px] text-muted">…</span> : null}
                        <button
                          type="button"
                          onClick={() => setPage(candidate)}
                          aria-current={candidate === safePage ? "page" : undefined}
                          aria-label={`Page ${candidate}`}
                          className={cn(
                            "inline-flex size-8 items-center justify-center rounded-md text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                            candidate === safePage
                              ? "bg-brand text-brand-contrast"
                              : "text-muted hover:bg-surface-2 hover:text-ink",
                          )}
                        >
                          {candidate}
                        </button>
                      </React.Fragment>
                    );
                  })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                disabled={safePage >= pageCount}
                aria-label="Next page"
              >
                Next
                <ChevronRight aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <p className="text-[11px] leading-5 text-muted">
        Records are stored only in this browser (up to {settings.retentionLimit}). They are
        unaffected by real-world activity, and the absence of an event is not evidence that
        nothing happened.
      </p>

      <EventDetailDialog eventId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
