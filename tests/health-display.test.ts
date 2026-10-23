import { describe, expect, it } from "vitest";
import { describeAiHealth } from "@/lib/ai/health-display";
import type { AiHealth } from "@/types/ai";

function health(overrides: Partial<AiHealth> = {}): AiHealth {
  return {
    configured: true,
    provider: "Groq",
    model: "openai/gpt-oss-120b",
    modelLabel: "GPT-OSS 120B",
    promptVersion: "test",
    credentialsVerified: true,
    verificationStatus: "ok",
    verificationMessage:
      "Groq accepted the key and lists openai/gpt-oss-120b.",
    keySource: "GROQ_API_KEY",
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("describeAiHealth", () => {
  it("reports a verified key distinctly from a merely present key", () => {
    const verified = describeAiHealth(health(), "ready", true);
    expect(verified.verified).toBe(true);
    expect(verified.label).toContain("verified");

    const unverified = describeAiHealth(
      health({
        credentialsVerified: false,
        verificationStatus: "unverified",
        verificationMessage: undefined,
      }),
      "ready",
      true,
    );
    expect(unverified.verified).toBe(false);
    expect(unverified.detail).toMatch(/Test connection/i);
  });

  it("surfaces rejected keys and quotas as actionable problems", () => {
    const rejected = describeAiHealth(
      health({
        verificationStatus: "invalid_key",
        credentialsVerified: false,
        verificationMessage: undefined,
      }),
      "ready",
      true,
    );
    expect(rejected.tone).toBe("attention");
    expect(rejected.label).toMatch(/rejected/i);
    expect(rejected.detail).toMatch(/GROQ_API_KEY|redeploy/i);

    const quota = describeAiHealth(
      health({
        verificationStatus: "quota",
        credentialsVerified: false,
        verificationMessage: undefined,
      }),
      "ready",
      true,
    );
    expect(quota.label).toMatch(/quota/i);
  });

  it("explains rules-only mode when no key exists", () => {
    const rulesOnly = describeAiHealth(
      health({
        configured: false,
        verificationStatus: "not_configured",
        verificationMessage: undefined,
      }),
      "ready",
      true,
    );
    expect(rulesOnly.label).toBe("Rules-only");
    expect(rulesOnly.usable).toBe(false);
    expect(rulesOnly.detail).toMatch(/redeploy/i);
  });

  it("respects the AI-off preference and unreachable health", () => {
    expect(describeAiHealth(health(), "ready", false).label).toBe("AI off");
    expect(describeAiHealth(null, "unreachable", true).label).toBe(
      "AI status unknown",
    );
  });
});
