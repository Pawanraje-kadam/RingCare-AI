import type { AiHealth } from "@/types/ai";

export interface AiHealthSummary {
  label: string;
  tone: "neutral" | "brand" | "review" | "attention" | "unknown";
  /** One sentence explaining the current state. */
  detail: string;
  /** True only when Groq answered a verification request with this key. */
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
      detail: "Checking the server-side Groq configuration.",
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
        "No server-side Groq key was found. Add GROQ_API_KEY and redeploy; the app runs deterministically until then.",
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
          "Groq accepted the key and lists the configured model, so AI analysis is available.",
        verified: true,
        usable: true,
      };
    case "invalid_key":
      return {
        label: "AI key rejected",
        tone: "attention",
        detail:
          health.verificationMessage ??
          "Groq rejected the API key. Replace GROQ_API_KEY in the deployment, then redeploy.",
        verified: false,
        usable: false,
      };
    case "model_unavailable":
      return {
        label: "Model unavailable",
        tone: "attention",
        detail:
          health.verificationMessage ??
          "Groq does not list llama-3.3-70b-versatile for this key. Check the model name or account access.",
        verified: false,
        usable: false,
      };
    case "quota":
      return {
        label: "Quota exceeded",
        tone: "attention",
        detail:
          health.verificationMessage ??
          "Groq reported a quota or rate limit. Check the limits for this key in the Groq console.",
        verified: false,
        usable: false,
      };
    case "unreachable":
      return {
        label: "AI unreachable",
        tone: "review",
        detail:
          health.verificationMessage ??
          "The server could not reach Groq. AI requests will fall back to rules.",
        verified: false,
        usable: false,
      };
    case "not_configured":
      return {
        label: "Rules-only",
        tone: "review",
        detail:
          health.verificationMessage ??
          "No server-side Groq key was found. Add GROQ_API_KEY and redeploy.",
        verified: false,
        usable: false,
      };
    case "error":
      return {
        label: "AI check failed",
        tone: "review",
        detail:
          health.verificationMessage ??
          "Groq returned an unexpected error while verifying the key.",
        verified: false,
        usable: false,
      };
    default:
      return {
        label: "Groq key present",
        tone: "brand",
        detail:
          health.verificationMessage ??
          "A server-side key is present. Use “Test connection” to verify it.",
        verified: false,
        usable: true,
      };
  }
}
