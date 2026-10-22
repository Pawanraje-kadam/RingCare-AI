import { getAiHealth } from "@/lib/ai/service";
import { jsonResponse } from "@/lib/api/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Safe health/configuration endpoint.
 * It reports whether a key is present configuration-wise. It does NOT verify the
 * key's validity or the account's current quota.
 */
export async function GET() {
  const ai = getAiHealth();
  return jsonResponse({
    status: "ok",
    service: "ringcare-ai",
    version: "1.0.0",
    demoMode: true,
    eventSource: "simulated_ring",
    storage: "browser_local",
    ai: {
      configured: ai.configured,
      provider: ai.provider,
      model: ai.model,
      promptVersion: ai.promptVersion,
      credentialsVerified: false,
    },
    checkedAt: new Date().toISOString(),
  });
}
