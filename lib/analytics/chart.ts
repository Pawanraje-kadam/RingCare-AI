import type { AttentionLevel } from "@/lib/constants/events";
import { evaluateEvent, type RuleSettings } from "@/lib/events/rules";
import type { RuleEvent } from "@/types/events";
import {
  addDays,
  formatHourLabel,
  formatShortDate,
  formatWeekday,
  getLocalDayKey,
  isWithinHalfOpen,
  startOfLocalDay,
} from "@/lib/utils/date";

export type ChartRange = "today" | "last_7_days";

export interface ActivityChartRow {
  key: string;
  label: string;
  fullLabel: string;
  routine: number;
  review: number;
  highAttention: number;
  uncertain: number;
  total: number;
}

export interface ActivityChartData {
  range: ChartRange;
  rows: ActivityChartRow[];
  from: string;
  to: string;
  total: number;
  description: string;
}

function emptyRow(key: string, label: string, fullLabel: string): ActivityChartRow {
  return {
    key,
    label,
    fullLabel,
    routine: 0,
    review: 0,
    highAttention: 0,
    uncertain: 0,
    total: 0,
  };
}

function addToRow(row: ActivityChartRow, level: AttentionLevel) {
  if (level === "routine") row.routine += 1;
  else if (level === "review") row.review += 1;
  else if (level === "high_attention") row.highAttention += 1;
  else row.uncertain += 1;
  row.total += 1;
}

/** Build event counts by time bucket, using actual event timestamps. */
export function buildActivityChart(
  events: RuleEvent[],
  settings: RuleSettings,
  range: ChartRange,
  now: Date = new Date(),
): ActivityChartData {
  const evaluations = new Map(
    events.map((event) => [event.id, evaluateEvent(event, settings, events)]),
  );

  if (range === "today") {
    const from = startOfLocalDay(now);
    const to = now;
    const rows = Array.from({ length: 6 }, (_, index) => {
      const startHour = index * 4;
      const label = `${formatHourLabel(startHour)}`;
      return emptyRow(
        `hour-${startHour}`,
        label,
        `${formatHourLabel(startHour)}–${formatHourLabel(startHour + 4)}`,
      );
    });

    for (const event of events) {
      if (!isWithinHalfOpen(event.occurredAt, from, to)) continue;
      const hour = new Date(event.occurredAt).getHours();
      const bucket = Math.min(5, Math.floor(hour / 4));
      const row = rows[bucket];
      if (!row) continue;
      addToRow(row, evaluations.get(event.id)?.attentionLevel ?? "unknown");
    }

    const total = rows.reduce((sum, row) => sum + row.total, 0);
    return {
      range,
      rows,
      from: from.toISOString(),
      to: to.toISOString(),
      total,
      description: describeChart(rows, "today", total),
    };
  }

  const from = startOfLocalDay(addDays(now, -6));
  const to = now;
  const rows = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(from, index);
    return emptyRow(
      getLocalDayKey(day),
      formatWeekday(day),
      `${formatWeekday(day)}, ${formatShortDate(day, { year: true })}`,
    );
  });
  const rowByKey = new Map(rows.map((row) => [row.key, row]));

  for (const event of events) {
    if (!isWithinHalfOpen(event.occurredAt, from, to)) continue;
    const row = rowByKey.get(getLocalDayKey(event.occurredAt));
    if (!row) continue;
    addToRow(row, evaluations.get(event.id)?.attentionLevel ?? "unknown");
  }

  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return {
    range,
    rows,
    from: from.toISOString(),
    to: to.toISOString(),
    total,
    description: describeChart(rows, "last_7_days", total),
  };
}

function describeChart(rows: ActivityChartRow[], range: ChartRange, total: number): string {
  const routine = rows.reduce((sum, row) => sum + row.routine, 0);
  const review = rows.reduce((sum, row) => sum + row.review, 0);
  const high = rows.reduce((sum, row) => sum + row.highAttention, 0);
  const uncertain = rows.reduce((sum, row) => sum + row.uncertain, 0);
  const windowText = range === "today" ? "today" : "over the last seven days";
  return `Bar chart of recorded activity ${windowText}: ${total} total events, including ${routine} routine, ${review} review suggested, ${high} needing attention, and ${uncertain} uncertain.`;
}
