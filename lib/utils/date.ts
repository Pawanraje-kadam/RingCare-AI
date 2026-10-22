import type { TimeOfDay } from "@/lib/constants/search";

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

export function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function startOfLocalDay(value: Date | string = new Date()): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfLocalDay(value: Date | string = new Date()): Date {
  const date = startOfLocalDay(value);
  date.setDate(date.getDate() + 1);
  return new Date(date.getTime() - 1);
}

export function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function addMinutes(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * MS_PER_MINUTE);
}

export function isSameLocalDay(a: Date | string, b: Date | string): boolean {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

export function isWithinInclusive(value: Date | string, from: Date, to: Date) {
  const time = new Date(value).getTime();
  return time >= from.getTime() && time <= to.getTime();
}

export function isWithinHalfOpen(value: Date | string, from: Date, to: Date) {
  const time = new Date(value).getTime();
  return time >= from.getTime() && time < to.getTime();
}

export function formatClockTime(value: Date | string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatShortDate(value: Date | string, options?: { year?: boolean }): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...(options?.year ? { year: "numeric" } : {}),
  }).format(new Date(value));
}

export function formatDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function formatDateRange(from: Date, to: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).formatRange(from, to);
  } catch {
    return `${formatShortDate(from, { year: true })} – ${formatShortDate(to, { year: true })}`;
  }
}

export function formatDayHeading(value: Date | string, now: Date = new Date()): string {
  const date = new Date(value);
  if (isSameLocalDay(date, now)) return "Today";
  const yesterday = addDays(now, -1);
  if (isSameLocalDay(date, yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/** Relative timestamp for lists. Detail views always show the exact time. */
export function formatRelativeTime(value: Date | string, now: Date = new Date()): string {
  const date = new Date(value);
  const diffMs = now.getTime() - date.getTime();

  if (Number.isNaN(diffMs)) return "Unknown time";
  if (diffMs < 0) {
    const minutes = Math.ceil(Math.abs(diffMs) / MS_PER_MINUTE);
    return minutes < 60 ? `in ${minutes} min` : `in ${Math.ceil(minutes / 60)} hr`;
  }
  if (diffMs < 45_000) return "just now";
  const minutes = Math.floor(diffMs / MS_PER_MINUTE);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(diffMs / MS_PER_HOUR);
  if (hours < 24 && isSameLocalDay(date, now)) return `${hours} hr ago`;

  const yesterday = addDays(now, -1);
  if (isSameLocalDay(date, yesterday)) return `Yesterday, ${formatClockTime(date)}`;
  const days = Math.floor(diffMs / MS_PER_DAY);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return formatShortDate(date, { year: true });
}

export function getLocalDayKey(value: Date | string): string {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function toDateInputValue(value: Date): string {
  return getLocalDayKey(value);
}

export function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function getTimeOfDay(value: Date | string): TimeOfDay {
  const hour = new Date(value).getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/** Start of an analytics window ending "now", with the equivalent previous window. */
export function getAnalyticsRange(
  range: "today" | "last_7_days" | "last_30_days",
  now: Date = new Date(),
) {
  const end = now;
  if (range === "today") {
    const start = startOfLocalDay(now);
    return {
      from: start,
      to: end,
      previousFrom: addDays(start, -1),
      previousTo: addDays(end, -1),
      label: "Today",
    };
  }
  const days = range === "last_7_days" ? 7 : 30;
  const start = startOfLocalDay(addDays(now, -(days - 1)));
  const previousStart = addDays(start, -days);
  return {
    from: start,
    to: end,
    previousFrom: previousStart,
    previousTo: start,
    label: range === "last_7_days" ? "Last 7 days" : "Last 30 days",
  };
}

export function getSearchPresetRange(
  preset: "today" | "yesterday" | "yesterday_evening" | "last_7_days" | "last_30_days" | "all_time",
  now: Date = new Date(),
): { from: Date; to: Date } | null {
  const todayStart = startOfLocalDay(now);
  switch (preset) {
    case "today":
      return { from: todayStart, to: now };
    case "yesterday":
      return { from: addDays(todayStart, -1), to: todayStart };
    case "yesterday_evening": {
      const yesterdayStart = addDays(todayStart, -1);
      const from = new Date(yesterdayStart);
      from.setHours(17, 0, 0, 0);
      const to = new Date(yesterdayStart);
      to.setHours(22, 0, 0, 0);
      return { from, to };
    }
    case "last_7_days":
      return { from: startOfLocalDay(addDays(now, -6)), to: now };
    case "last_30_days":
      return { from: startOfLocalDay(addDays(now, -29)), to: now };
    case "all_time":
    default:
      return null;
  }
}

export function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds));
  if (safeSeconds < 60) return `${safeSeconds}s`;
  return `${Math.floor(safeSeconds / 60)}m ${String(safeSeconds % 60).padStart(2, "0")}s`;
}

/** Hour (0–23) of a timestamp in a specific IANA time zone. */
export function getHourInTimeZone(value: Date | string, timeZone?: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  });
  const parts = formatter.formatToParts(new Date(value));
  const hourPart = parts.find((part) => part.type === "hour");
  const parsed = Number(hourPart?.value);
  return Number.isFinite(parsed) ? parsed % 24 : 0;
}

export function formatHourLabel(hour: number, timeZone?: string): string {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const sample = timeZone
    ? new Date(Date.UTC(2020, 0, 1, normalizedHour))
    : new Date(2020, 0, 1, normalizedHour, 0, 0, 0);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    ...(timeZone ? { timeZone: "UTC" } : {}),
  }).format(sample);
}

export function formatWeekday(value: Date | string, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}
