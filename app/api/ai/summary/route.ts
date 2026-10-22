import { AI_LIMITS } from "@/lib/constants/ai";
import { generateDailySummary } from "@/lib/ai/service";
import { handleRouteError, jsonResponse, rateLimitResponse } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/security/request";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";
import { summaryRequestSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const limit = checkRateLimit(
    rateLimitKey("ai:summary", request),
    AI_LIMITS.rateLimitRequestsPerMinute,
  );
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  try {
    const body = await readJsonBody(request, AI_LIMITS.maxRequestBodyBytes);
    const parsed = summaryRequestSchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error);

    const summary = await generateDailySummary({
      events: parsed.data.events,
      settings: parsed.data.settings,
      from: new Date(parsed.data.from),
      to: new Date(parsed.data.to),
      label: parsed.data.label,
      timeZone: parsed.data.timeZone,
    });

    return jsonResponse(
      { ok: true, summary },
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
