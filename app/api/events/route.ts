import { z } from "zod";
import {
  errorResponse,
  handleRouteError,
  jsonResponse,
  rateLimitResponse,
} from "@/lib/api/responses";
import { simulatedRingAdapter } from "@/lib/integrations/ring";
import { readJsonBody } from "@/lib/security/request";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";
import { ringCareEventSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const maxDuration = 15;

const inboundSchema = z.object({ event: ringCareEventSchema }).strict();

/**
 * Input boundary for a future authorized Ring adapter.
 *
 * The current adapter is simulated only. This endpoint validates and normalizes
 * one event; it deliberately does not accept live Ring data or credentials.
 */
export async function POST(request: Request) {
  const limit = checkRateLimit(rateLimitKey("events:ingest", request), 30);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  try {
    const body = await readJsonBody(request, 64 * 1024);
    const parsed = inboundSchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error);

    const result = simulatedRingAdapter.normalize(parsed.data.event);
    if (!result.success || !result.event) {
      return errorResponse(400, "invalid_event", result.error ?? "Event could not be normalized.");
    }

    return jsonResponse(
      {
        ok: true,
        event: result.event,
        acceptedSource: "simulated_ring",
        note: "Live Ring events are not supported. This boundary exists for a future authorized adapter.",
      },
      { headers: { "X-RateLimit-Remaining": String(limit.remaining) } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
