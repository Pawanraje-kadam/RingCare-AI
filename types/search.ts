import type { z } from "zod";
import type { searchPlanSchema } from "@/lib/validation/schemas";
import type { RingCareEvent, RuleEvaluation } from "./events";

export type SearchPlan = z.infer<typeof searchPlanSchema>;

export type SearchInterpreter = "gemini" | "rules";

export interface SearchMatch {
  event: RingCareEvent;
  evaluation: RuleEvaluation;
}

export interface SearchExecutionResult {
  matches: SearchMatch[];
  range: { from: string; to: string } | null;
  description: string;
  summary: string;
}

export interface SearchInterpretation {
  plan: SearchPlan;
  interpretedBy: SearchInterpreter;
  meta: import("./ai").AiResponseMeta;
}
