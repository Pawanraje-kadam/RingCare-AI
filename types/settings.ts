import type { z } from "zod";
import type { analysisSettingsSchema, settingsSchema } from "@/lib/validation/schemas";

export type AppSettings = z.infer<typeof settingsSchema>;
export type AnalysisSettings = z.infer<typeof analysisSettingsSchema>;
export type { ThemePreference } from "@/lib/constants/settings";
