import type { AiHealth } from "@/types/ai";

export interface AiHealthSummary {
  label: string;
  tone: "neutral" | "brand" | "review" | "attention" | "unknown";
  /** One sentence explaining the current state. */
  detail: string;
  /** True only when Gemini answered a verification request with this key. */
  verified: boolean;
  /** True when the configuration is expected to work. */
  usable: boolean;
}

/**
 * Turn the raw health snapshot into stable UI copy. Kept in one place so the
 * header chip, dashboard card, and settings panel never disagree.
 */
export function describeAiHealth(
  health: AiHealth | null,
  status: "checking" | "ready" | "unreachable",
  aiEnabled = true,
): AiHealthSummary {
  if (!aiEnabled) {
    return {
      label: "AI off",
      tone: "neutral",
      detail: "AI analysis is turned off in Settings. Deterministic rules are used everywhere.",
      verified: false,
      usable: false,
    };
  }

  if (status === "checking") {
    return {
      label: "Checking AI",
      tone: "neutral",
      detail: "Checking the server-side Gemini configuration.",
      verified: false,
      usable: false,
    };
  }

  if (status === "unreachable" || !health) {
    return {
      label: "AI status unknown",
      tone: "review",
      detail:
        "The health endpoint could not be read. AI requests will still be attempted and fall back safely.",
      verified: false,
      usable: false,
    };
  }

  if (!health.configured) {
    return {
      label: "Rules-only",
      tone: "review",
      detail:
        "No server-side Gemini key was found. Add GEMINI_API_KEY (or GOOGLE_API_KEY) and redeploy; the app runs deterministically until then.",
      verified: false,
      usable: false,
    };
  }

  switch (health.verificationStatus) {
    case "ok":
      return {
        label: `${health.modelLabel} verified`,
        tone: "brand",
        detail:
          health.verificationMessage ??
          "Gemini answered a free metadata request, so the key and model are usable.",
        verified: true,
        usable: true,
      };
    case "invalid_key":
      return {
        label: "AI key rejected",
        tone: "attention",
        detail:
          health.verificationMessage ??
          "Gemini rejected the API key. Replace GEMINI_API_KEY in the deployment, then redeploy.",
        verified: false,
        usable: false,
      };
    case "model_unavailable":
      return {
        label: "Model unavailable",
        tone: "attention",
        detail:
          health.verificationMessage ??
          "Gemini does not expose gemini-3.8-flash to this project. Check the API key's project access.",
        verified: false,
        usable: false,
      };
    case "quota":
      return {
        label: "Quota exceeded",
        tone: "attention",
        detail:
          health.verificationMessage ??
          "Gemini reported a quota or rate limit. Check the project limits in Google AI Studio.",
        verified: false,
        usable: false,
      };
    case "unreachable":
      return {
        label: "AI unreachable",
        tone: "review",
        detail:
          health.verificationMessage ??
          "The server could not reach Gemini. AI requests will fall back to rules.",
        verified: false,
        usable: false,
      };
    case "not_configured":
      return {
        label: "Rules-only",
        tone: "review",
        detail:
          health.verificationMessage ??
          "No server-side Gemini key was found. Add GEMINI_API_KEY and redeploy.",
        verified: false,
        usable: false,
      };
    case "error":
      return {
        label: "AI check failed",
        tone: "review",
        detail:
          health.verificationMessage ??
          "Gemini returned an unexpected error while verifying the key.",
        verified: false,
        usable: false,
      };
    default:
      return {
        label: "Gemini configured",
        tone: "brand",
        detail:
          health.verificationMessage ??
          "A server-side key is present. Use “Test connection” to verify it.",
        verified: false,
        usable: true,
      };
  }
}
