"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useNow } from "@/hooks/use-now";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buildActivityChart, type ChartRange } from "@/lib/analytics/chart";
import { cn } from "@/lib/utils/cn";

const SERIES = [
  { key: "routine", label: "Routine", color: "var(--chart-routine)" },
  { key: "review", label: "Review suggested", color: "var(--chart-review)" },
  { key: "highAttention", label: "Needs attention", color: "var(--chart-high)" },
  { key: "uncertain", label: "Uncertain", color: "var(--chart-unknown)" },
] as const;

const RANGE_OPTIONS: Array<{ value: ChartRange; label: string; longLabel: string }> = [
  { value: "today", label: "Today", longLabel: "Today, in four-hour blocks" },
  { value: "last_7_days", label: "7 days", longLabel: "Last 7 days, by day" },
];

export function ActivityChart() {
  const { events, settings } = useApp();
  const now = useNow(60_000);
  const [range, setRange] = React.useState<ChartRange>("today");

  const chart = React.useMemo(
    () => buildActivityChart(events, settings, range, now),
    [events, settings, range, now],
  );

  const counts = React.useMemo(() => {
    return SERIES.reduce<Record<string, number>>((acc, series) => {
      acc[series.key] = chart.rows.reduce(
        (sum, row) => sum + (row[series.key] as number),
        0,
      );
      return acc;
    }, {});
  }, [chart.rows]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Recorded activity</CardTitle>
          <CardDescription>
            Simulated event counts grouped by the attention suggested by deterministic
            rules. Not a monitor of a real location.
          </CardDescription>
        </div>
        <div
          role="group"
          aria-label="Chart time range"
          className="inline-flex shrink-0 rounded-lg border border-line bg-surface-2 p-0.5"
        >
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRange(option.value)}
              aria-pressed={range === option.value}
              className={cn(
                "rounded-[7px] px-2.5 py-1 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                range === option.value
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
        {chart.total === 0 ? (
          <EmptyState
            icon={Activity}
            title="No events in this window"
            description="Use the simulator to add clearly labelled demo events, or choose a wider range."
            className="border-line bg-surface-2/40 py-8"
          />
        ) : (
          <div>
            <p className="sr-only">{chart.description}</p>
            <div
              aria-hidden="true"
              className="h-[228px] w-full"
              data-testid="activity-chart"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chart.rows}
                  margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                  barCategoryGap="24%"
                >
                  <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    dy={6}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    width={44}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--surface-3)", opacity: 0.55 }}
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--line)",
                      borderRadius: 10,
                      boxShadow: "var(--shadow-card)",
                      fontSize: 12,
                      color: "var(--ink)",
                    }}
                    labelStyle={{ color: "var(--ink)", fontWeight: 500, marginBottom: 4 }}
                    itemStyle={{ color: "var(--ink-2)", padding: 0 }}
                  />
                  {SERIES.map((series) => (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      name={series.label}
                      stackId="activity"
                      fill={series.color}
                      maxBarSize={44}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Chart legend">
              {SERIES.map((series) => (
                <li key={series.key} className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-[3px]"
                    style={{ backgroundColor: series.color }}
                  />
                  {series.label}
                  <span className="tabular-nums text-ink-2">{counts[series.key] ?? 0}</span>
                </li>
              ))}
            </ul>

            <details className="mt-3 rounded-lg border border-line bg-surface-2/50 px-3 py-2">
              <summary className="cursor-pointer text-[11.5px] font-medium text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                View chart as a table
              </summary>
              <p className="mt-2 text-[11px] leading-5 text-muted">{chart.description}</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <caption className="sr-only">
                    Recorded simulated events by {range === "today" ? "four-hour block" : "day"}
                  </caption>
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th scope="col" className="py-1.5 pr-3 font-medium">
                        Period
                      </th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                        Routine
                      </th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                        Review
                      </th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                        Attention
                      </th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                        Uncertain
                      </th>
                      <th scope="col" className="py-1.5 text-right font-medium">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chart.rows.map((row) => (
                      <tr key={row.key} className="border-b border-line/70 last:border-0">
                        <th scope="row" className="py-1.5 pr-3 font-normal text-ink-2">
                          {row.fullLabel}
                        </th>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-ink-2">{row.routine}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-ink-2">{row.review}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-ink-2">{row.highAttention}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-ink-2">{row.uncertain}</td>
                        <td className="py-1.5 text-right font-medium tabular-nums text-ink">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
