import type { AppSettings, AnalysisSettings } from "@/types/settings";

export function toAnalysisSettings(settings: AppSettings): AnalysisSettings {
  return {
    prolongedPresenceThresholdSeconds: settings.prolongedPresenceThresholdSeconds,
    notificationPreferences: settings.notificationPreferences,
    caregiverLabel: settings.caregiverLabel,
    caregiverCriteria: settings.caregiverCriteria,
    caregiverAlertsEnabled: settings.caregiverAlertsEnabled,
    aiEnabled: settings.aiEnabled,
  };
}

export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
