import { getAiHealth } from "@/lib/ai/service";
import { jsonResponse } from "@/lib/api/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Safe health/configuration endpoint.
 *
 * Reports whether a key is configured and — because a present key is not proof
 * that Groq will accept it — verifies the key against Groq's free model
 * metadata endpoint. Results are cached per instance for five minutes; pass
 * `?refresh=1` (used by the Settings "Test connection" button) to force a new
 * check. The key itself is never returned, logged, or included in any message.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const ai = await getAiHealth({ refresh });

  return jsonResponse({
    status: "ok",
    service: "ringcare-ai",
    version: "1.0.0",
    demoMode: true,
    eventSource: "simulated_ring",
    storage: "browser_local",
    ai,
    checkedAt: new Date().toISOString(),
  });
}
