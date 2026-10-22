import { DEFAULT_SETTINGS } from "@/lib/constants/settings";
import { buildSeedEvents } from "@/lib/events/seed";
import { handleRouteError, jsonResponse, rateLimitResponse } from "@/lib/api/responses";
import { readJsonBody } from "@/lib/security/request";
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit";
import { demoSeedRequestSchema, parseSettings, ringCareEventSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Server-side seeding keeps the demo dataset's timestamps and scenarios
 * consistent. All records returned here are clearly marked as simulated.
 */
export async function POST(request: Request) {
  const limit = checkRateLimit(rateLimitKey("demo:seed", request), 10);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  try {
    const body = await readJsonBody(request, 16 * 1024);
    const parsed = demoSeedRequestSchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error);

    const settings = parseSettings({
      ...DEFAULT_SETTINGS,
      ...parsed.data.settings,
    });
    const events = buildSeedEvents({ settings }).map((event) =>
      ringCareEventSchema.parse(event),
    );

    return jsonResponse(
      {
        ok: true,
        events,
        generatedAt: new Date().toISOString(),
        demoMode: true,
        note: "All records are synthetic and clearly labelled as simulated.",
      },
      { headers: { "X-RateLimit-Remaining": String(limit.remaining) } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
