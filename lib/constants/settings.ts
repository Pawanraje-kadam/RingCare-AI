import {
  DEFAULT_CAREGIVER_LABEL,
  DEFAULT_PROLONGED_PRESENCE_SECONDS,
  EVENT_TYPES,
  type EventType,
} from "./events";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const NOTIFICATION_DEFAULTS: Record<EventType, boolean> = EVENT_TYPES.reduce(
  (acc, type) => {
    acc[type] = type !== "motion_detected";
    return acc;
  },
  {} as Record<EventType, boolean>,
);

export const SETTINGS_LIMITS = {
  prolongedPresenceMinSeconds: 10,
  prolongedPresenceMaxSeconds: 1800,
  caregiverLabelMinLength: 2,
  caregiverLabelMaxLength: 40,
  retentionMin: 25,
  retentionMax: 1000,
  autoGenerationMinSeconds: 20,
  autoGenerationMaxSeconds: 300,
} as const;

export const DEFAULT_SETTINGS = {
  prolongedPresenceThresholdSeconds: DEFAULT_PROLONGED_PRESENCE_SECONDS,
  notificationPreferences: NOTIFICATION_DEFAULTS,
  retentionLimit: 250,
  autoGenerateEnabled: false,
  autoGenerateIntervalSeconds: 30,
  caregiverLabel: DEFAULT_CAREGIVER_LABEL,
  caregiverCriteria: "event_type_and_label" as const,
  caregiverAlertsEnabled: true,
  aiEnabled: true,
  theme: "system" as const,
};

export const SETTINGS_STORAGE_KEY = "ringcare.settings.v1";
export const EVENTS_STORAGE_KEY = "ringcare.events.v1";
export const SUMMARY_CACHE_KEY = "ringcare.summary-cache.v1";
export const SIDEBAR_STORAGE_KEY = "ringcare.sidebar-collapsed.v1";
export const THEME_STORAGE_KEY = "ringcare.theme.v1";
