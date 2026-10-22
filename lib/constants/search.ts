export const SEARCH_DATE_PRESETS = [
  "today",
  "yesterday",
  "yesterday_evening",
  "last_7_days",
  "last_30_days",
  "all_time",
] as const;
export type SearchDatePreset = (typeof SEARCH_DATE_PRESETS)[number];

export const TIME_OF_DAY = ["morning", "afternoon", "evening", "night"] as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

export const SEARCH_SORTS = ["newest", "oldest", "longest"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export const SEARCH_INTENTS = ["filter", "summarize", "clarify"] as const;
export type SearchIntent = (typeof SEARCH_INTENTS)[number];

export const SEARCH_DATE_PRESET_LABELS: Record<SearchDatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  yesterday_evening: "Yesterday evening",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  all_time: "All recorded events",
};

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: "Morning (05:00–12:00)",
  afternoon: "Afternoon (12:00–17:00)",
  evening: "Evening (17:00–22:00)",
  night: "Night (22:00–05:00)",
};

export const SEARCH_SUGGESTIONS = [
  "Show delivery-related events from today",
  "When was the caregiver arrival recorded?",
  "Show events lasting longer than one minute",
  "Summarize activity from yesterday evening",
  "Which events need review in the last 7 days?",
] as const;
