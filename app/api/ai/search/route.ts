import { AI_LIMITS } from "@/lib/constants/ai";
import { interpretSearchQuery } from "@/lib/ai/service";
import { handleRouteError, jsonResponse, rateLimitResponse } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/security/request";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";
import { searchRequestSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const limit = checkRateLimit(
    rateLimitKey("ai:search", request),
    AI_LIMITS.rateLimitRequestsPerMinute,
  );
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  try {
    // Search only sends the natural-language query, not the user's event history.
    const body = await readJsonBody(request, 8 * 1024);
    const parsed = searchRequestSchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error);

    const interpretation = await interpretSearchQuery({
      query: parsed.data.query,
      clientNow: new Date(parsed.data.clientNow),
      aiEnabled: parsed.data.aiEnabled,
    });

    return jsonResponse(
      {
        ok: true,
        plan: interpretation.plan,
        interpretedBy: interpretation.interpretedBy,
        meta: interpretation.meta,
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
