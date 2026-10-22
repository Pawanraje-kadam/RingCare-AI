import { AI_LIMITS } from "@/lib/constants/ai";
import { analyzeEvent } from "@/lib/ai/service";
import { errorResponse, handleRouteError, jsonResponse, rateLimitResponse } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/security/request";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";
import { analyzeRequestSchema, parseIncomingEvent } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const limit = checkRateLimit(
    rateLimitKey("ai:analyze", request),
    AI_LIMITS.rateLimitRequestsPerMinute,
  );
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  try {
    const body = await readJsonBody(request, 64 * 1024);
    const parsed = analyzeRequestSchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error);

    const eventResult = parseIncomingEvent(parsed.data.event);
    if (!eventResult.success) {
      return errorResponse(400, "invalid_event", eventResult.error.message);
    }

    const result = await analyzeEvent({
      event: eventResult.data,
      contextEvents: parsed.data.contextEvents,
      settings: parsed.data.settings,
    });

    return jsonResponse(
      {
        ok: true,
        analysis: result.analysis,
        meta: result.meta,
        evaluation: result.evaluation,
      },
      {
        headers: {
          "X-RateLimit-Limit": String(limit.limit),
          "X-RateLimit-Remaining": String(limit.remaining),
        },
      },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
