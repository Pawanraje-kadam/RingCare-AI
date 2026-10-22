import { ZodError } from "zod";
import { HttpError } from "@/lib/security/request";

const baseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export function jsonResponse(
  data: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { ...baseHeaders, ...(init.headers ?? {}) },
  });
}

export interface ApiErrorPayload {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }>;
  };
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  options: { details?: Array<{ path: string; message: string }>; headers?: Record<string, string> } = {},
): Response {
  const payload: ApiErrorPayload = {
    ok: false,
    error: {
      code,
      message,
      ...(options.details ? { details: options.details } : {}),
    },
  };
  return jsonResponse(payload, { status, headers: options.headers });
}

export function handleRouteError(error: unknown): Response {
  if (error instanceof HttpError) {
    return errorResponse(
      error.status,
      error.code,
      error.message,
      error.retryAfterSeconds
        ? { headers: { "Retry-After": String(error.retryAfterSeconds) } }
        : {},
    );
  }
  if (error instanceof ZodError) {
    return errorResponse(400, "invalid_request", "The request did not pass validation.", {
      details: error.issues.slice(0, 6).map((issue) => ({
        path: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
    });
  }
  // Do not log raw request bodies, event descriptions, or credentials.
  console.error("[ringcare-api] unexpected_error", {
    name: error instanceof Error ? error.name : "unknown",
  });
  return errorResponse(500, "internal_error", "An unexpected server error occurred.");
}

export function rateLimitResponse(retryAfterSeconds: number): Response {
  return errorResponse(429, "rate_limited", "Too many requests. Please wait a moment.", {
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}
