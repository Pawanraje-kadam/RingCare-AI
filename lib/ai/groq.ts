import "server-only";
import { createHash } from "node:crypto";
import type { z } from "zod";
import {
  AI_LIMITS,
  AI_PROVIDER_NAME,
  DEFAULT_GROQ_BASE_URL,
  DEFAULT_GROQ_MODEL,
  GROQ_MODEL_ID,
  type AiVerificationStatus,
} from "@/lib/constants/ai";
import type { FallbackReason } from "@/lib/constants/events";
import { safeModelNameSchema } from "@/lib/validation/schemas";

/**
 * Groq client.
 *
 * Groq exposes an OpenAI-compatible Chat Completions API, so this module talks
 * to `POST {base}/chat/completions` directly with `fetch`. That keeps the
 * request shape explicit (and easy to test) and avoids shipping an SDK into the
 * server bundle for four endpoints.
 *
 * The model is pinned to `llama-3.3-70b-versatile` by default. `GROQ_MODEL` may
 * override it, and the active model is reported by `/api/health`, Settings, and
 * every AI response so the UI never claims a model that was not used.
 */

export class GroqRequestError extends Error {
  readonly reason: FallbackReason;
  readonly retryable: boolean;
  readonly status?: number;
  /** Safe, short diagnostic. Never contains the API key or prompt content. */
  readonly detail?: string;

  constructor(
    reason: FallbackReason,
    message: string,
    options: { retryable?: boolean; status?: number; detail?: string } = {},
  ) {
    super(message);
    this.name = "GroqRequestError";
    this.reason = reason;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.detail = options.detail;
  }
}

export type GroqKeySource = "GROQ_API_KEY";

export interface GroqRuntimeConfig {
  configured: boolean;
  apiKey: string;
  /** Active model identifier, e.g. `llama-3.3-70b-versatile`. */
  model: string;
  /** Chat Completions base URL without a trailing slash. */
  baseUrl: string;
  keySource: GroqKeySource | null;
  /** Set when `GROQ_MODEL` was invalid and the default is in use. */
  modelNotice?: string;
}

/**
 * Strip pasted quotes, a leading "Bearer", and every whitespace character.
 * API keys never contain whitespace, so this safely repairs the most common
 * copy/paste damage (newlines, wrapping, quotes) without touching real keys.
 */
export function normalizeApiKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^bearer\s+/i, "")
    .replace(/\s+/g, "")
    .trim();
}

/** Normalize a model identifier; returns `null` when it cannot be valid. */
export function normalizeModelId(raw: string): string | null {
  const cleaned = raw.trim().replace(/[\s_]+/g, "-").toLowerCase();
  return safeModelNameSchema.safeParse(cleaned).success ? cleaned : null;
}

export function normalizeBaseUrl(raw: string | undefined): string {
  const fallback = DEFAULT_GROQ_BASE_URL;
  if (!raw || !raw.trim()) return fallback;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return fallback;
  }
}

/** Read server-only configuration. The key is never serialized or logged. */
export function readGroqConfig(
  env: Record<string, string | undefined> = process.env,
): GroqRuntimeConfig {
  const apiKey = normalizeApiKey(env.GROQ_API_KEY);
  const rawModel = (env.GROQ_MODEL ?? "").trim();
  const parsedModel = rawModel ? normalizeModelId(rawModel) : null;

  return {
    configured: apiKey.length > 0,
    apiKey,
    model: parsedModel ?? DEFAULT_GROQ_MODEL,
    baseUrl: normalizeBaseUrl(env.GROQ_BASE_URL),
    keySource: apiKey ? "GROQ_API_KEY" : null,
    ...(rawModel && !parsedModel
      ? {
          modelNotice: `GROQ_MODEL="${rawModel}" is not a valid model identifier, so ${DEFAULT_GROQ_MODEL} is used.`,
        }
      : {}),
  };
}

/** Remove anything key-shaped from a provider message before it is shown. */
function extractProviderMessage(raw: string): string {
  const candidates = [raw];
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        error?: { message?: unknown } | string;
        message?: unknown;
      };
      const nested =
        typeof parsed.error === "object" && parsed.error
          ? parsed.error.message
          : parsed.error;
      if (typeof nested === "string" && nested.trim()) return nested;
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message;
      }
    } catch {
      // Try the next candidate.
    }
  }

  const matched = raw.match(/"message"\s*:\s*"([^"]+)"/);
  if (matched?.[1]) return matched[1];
  return raw;
}

export function sanitizeProviderDetail(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const cleaned = extractProviderMessage(value)
    .replace(/gsk_[0-9A-Za-z]{10,}/g, "[redacted]")
    .replace(/Bearer\s+[0-9A-Za-z._-]{10,}/gi, "Bearer [redacted]")
    .replace(/key=[^\s&]+/gi, "key=[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, 180);
}

function detailFor(status: number, message: string | undefined): string {
  const safe = sanitizeProviderDetail(message);
  return [`HTTP ${status}`, safe].filter(Boolean).join(" · ");
}

/** Map an HTTP status and provider message to a safe fallback reason. */
export function classifyHttpError(
  status: number,
  message?: string,
): GroqRequestError {
  const detail = detailFor(status, message);
  if (status === 429) {
    return new GroqRequestError("rate_limited", "Groq rate limit reached", {
      retryable: false,
      status,
      detail,
    });
  }
  if (status === 408 || status >= 500) {
    return new GroqRequestError("provider_error", "Groq service error", {
      retryable: true,
      status,
      detail,
    });
  }
  return new GroqRequestError("provider_error", "Groq request was rejected", {
    retryable: false,
    status,
    detail,
  });
}

/** Map thrown network/abort errors to safe fallback reasons. */
export function classifyTransportError(error: unknown): GroqRequestError {
  if (error instanceof GroqRequestError) return error;
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return new GroqRequestError("timeout", "Groq request timed out", {
        retryable: true,
      });
    }
    if (error instanceof TypeError || /fetch failed|network|ENOTFOUND|ECONN/i.test(error.message)) {
      return new GroqRequestError("network_error", "Groq network failure", {
        retryable: true,
        detail: sanitizeProviderDetail(error.message),
      });
    }
    return new GroqRequestError("provider_error", "Unexpected Groq failure", {
      detail: sanitizeProviderDetail(error.message),
    });
  }
  return new GroqRequestError("provider_error", "Unexpected Groq failure");
}

/**
 * Normalise anything thrown during a provider call into a `GroqRequestError`.
 * Already-classified errors are returned unchanged so retry decisions stay
 * stable across layers.
 */
export function classifyAiError(error: unknown): GroqRequestError {
  if (error instanceof GroqRequestError) return error;
  return classifyTransportError(error);
}

/**
 * One safe warning per failure. Includes only the reason, HTTP status, and a
 * sanitized provider message — never prompts, event text, or the key.
 */
export function logAiFailure(scope: string, error: GroqRequestError): void {
  console.warn("[ringcare:ai]", {
    provider: AI_PROVIDER_NAME,
    scope,
    reason: error.reason,
    status: error.status,
    detail: error.detail,
  });
}

export interface GroqJsonInput {
  systemInstruction: string;
  userPrompt: string;
  timeoutMs: number;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface GroqJsonClient {
  model: string;
  generateJson(input: GroqJsonInput): Promise<string>;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string } | string;
}

async function readErrorBody(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    return text || undefined;
  } catch {
    return undefined;
  }
}

export function createGroqClient(config: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): GroqJsonClient {
  const baseUrl = (config.baseUrl ?? DEFAULT_GROQ_BASE_URL).replace(/\/+$/, "");
  const doFetch = config.fetchImpl ?? fetch;

  return {
    model: config.model,
    async generateJson(input: GroqJsonInput): Promise<string> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
      try {
        const response = await doFetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: "system", content: input.systemInstruction },
              // JSON mode requires the word "JSON" in the conversation; all of
              // our system prompts include it, and the user prompt is bounded.
              { role: "user", content: input.userPrompt },
            ],
            temperature: input.temperature ?? 0.2,
            max_completion_tokens:
              input.maxOutputTokens ?? AI_LIMITS.maxOutputTokensNarrative,
            response_format: { type: "json_object" },
            stream: false,
          }),
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw classifyHttpError(response.status, await readErrorBody(response));
        }

        let payload: ChatCompletionResponse;
        try {
          payload = (await response.json()) as ChatCompletionResponse;
        } catch {
          throw new GroqRequestError(
            "invalid_response",
            "Groq returned a non-JSON HTTP body",
          );
        }

        const choice = payload.choices?.[0];
        const content = choice?.message?.content;
        if (!content || !content.trim()) {
          const detail = [
            choice?.finish_reason ? `finish_reason ${choice.finish_reason}` : null,
            payload.usage?.completion_tokens !== undefined
              ? `${payload.usage.completion_tokens} completion tokens`
              : null,
          ]
            .filter(Boolean)
            .join(" · ");
          throw new GroqRequestError(
            "invalid_response",
            "Groq returned an empty response",
            { detail: detail || undefined },
          );
        }
        if (choice?.finish_reason === "length") {
          // The JSON is almost certainly truncated; surface it as invalid so
          // the caller retries or falls back instead of showing half an object.
          throw new GroqRequestError(
            "invalid_response",
            "Groq stopped at the output limit",
            { detail: "finish_reason length" },
          );
        }
        return content;
      } catch (error) {
        throw classifyTransportError(error);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One bounded retry, only for retryable transport/service errors. */
export async function generateJsonWithRetry(
  client: GroqJsonClient,
  input: GroqJsonInput,
  maxAttempts = 2,
): Promise<string> {
  let lastError: GroqRequestError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.generateJson(input);
    } catch (error) {
      lastError = classifyTransportError(error);
      if (!lastError.retryable || attempt >= maxAttempts) throw lastError;
      await delay(350);
    }
  }
  throw lastError ?? new GroqRequestError("unknown", "Groq request failed");
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  throw new GroqRequestError("invalid_response", "Groq returned non-JSON content");
}

export interface StructuredGenerationOptions<T> {
  client: GroqJsonClient;
  systemInstruction: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  timeoutMs: number;
  maxOutputTokens?: number;
  temperature?: number;
}

export async function generateStructured<T>({
  client,
  systemInstruction,
  userPrompt,
  schema,
  timeoutMs,
  maxOutputTokens,
  temperature,
}: StructuredGenerationOptions<T>): Promise<T> {
  const text = await generateJsonWithRetry(client, {
    systemInstruction,
    userPrompt,
    timeoutMs,
    maxOutputTokens,
    temperature,
  });
  const parsed = extractJsonObject(text);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const detail = first
      ? sanitizeProviderDetail(`${first.path.join(".") || "root"}: ${first.message}`)
      : undefined;
    throw new GroqRequestError(
      "invalid_response",
      "Groq response failed schema validation",
      { detail },
    );
  }
  return result.data;
}

/* -------------------------------------------------------------------------- */
/*                          Credential verification                           */
/* -------------------------------------------------------------------------- */

export interface AiVerification {
  status: AiVerificationStatus;
  message: string;
  checkedAt: string;
  latencyMs?: number;
}

interface VerificationEntry {
  fingerprint: string;
  expiresAt: number;
  value: AiVerification;
}

const verificationCache = new Map<string, VerificationEntry>();

function keyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

const STATUS_MESSAGES: Record<AiVerificationStatus, string> = {
  ok: `Groq accepted the key and lists ${GROQ_MODEL_ID}.`,
  not_configured:
    "No server-side Groq key was found. Set GROQ_API_KEY and redeploy.",
  invalid_key:
    "Groq rejected the API key (HTTP 401/403). Replace GROQ_API_KEY in your deployment, then redeploy.",
  model_unavailable: `Groq does not list ${GROQ_MODEL_ID} for this key. Check the model name or your Groq account access.`,
  quota:
    "Groq reported a rate or quota limit (HTTP 429). Check the limits for this key in the Groq console.",
  unreachable:
    "The server could not reach Groq. Check outbound network access from the deployment.",
  error: "Groq returned an unexpected error while verifying the key.",
  unverified:
    "The key is present but has not been verified. Use “Test connection” to check it.",
};

interface ModelsResponse {
  data?: Array<{ id?: string }>;
  error?: { message?: string } | string;
}

/**
 * Verify the key by listing models (a free endpoint that returns no
 * completions) and checking that the configured model is available. Results
 * are cached per instance for five minutes so the dashboard can poll health.
 */
export async function verifyAiAccess(
  config: GroqRuntimeConfig,
  options: { force?: boolean; now?: number; fetchImpl?: typeof fetch } = {},
): Promise<AiVerification> {
  const now = options.now ?? Date.now();
  const checkedAt = new Date(now).toISOString();

  if (!config.configured) {
    return { status: "not_configured", message: STATUS_MESSAGES.not_configured, checkedAt };
  }

  const fingerprint = keyFingerprint(config.apiKey);
  const cacheKey = `${config.baseUrl}:${config.model}:${fingerprint}`;
  const cached = verificationCache.get(cacheKey);
  if (!options.force && cached && cached.expiresAt > now) {
    return cached.value;
  }

  const startedAt = Date.now();
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_LIMITS.healthCheckTimeoutMs);

  try {
    const response = await doFetch(`${config.baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    let value: AiVerification;
    if (!response.ok) {
      const failure = classifyHttpError(response.status, await readErrorBody(response));
      const status: AiVerificationStatus =
        response.status === 401 || response.status === 403
          ? "invalid_key"
          : response.status === 429
            ? "quota"
            : response.status >= 500
              ? "error"
              : "error";
      const base = STATUS_MESSAGES[status];
      value = {
        status,
        message: failure.detail ? `${base} (${failure.detail})` : base,
        checkedAt,
        latencyMs: Date.now() - startedAt,
      };
      logAiFailure("health", failure);
    } else {
      const body = (await response.json()) as ModelsResponse;
      const ids = (body.data ?? [])
        .map((entry) => entry.id)
        .filter((id): id is string => typeof id === "string");
      if (ids.length > 0 && !ids.includes(config.model)) {
        const preview = ids.slice(0, 4).join(", ");
        value = {
          status: "model_unavailable",
          message: `${STATUS_MESSAGES.model_unavailable} Available examples: ${preview}.`,
          checkedAt,
          latencyMs: Date.now() - startedAt,
        };
      } else {
        value = {
          status: "ok",
          message: STATUS_MESSAGES.ok,
          checkedAt,
          latencyMs: Date.now() - startedAt,
        };
      }
    }

    verificationCache.set(cacheKey, {
      fingerprint,
      value,
      expiresAt:
        now +
        (value.status === "unreachable" ? 30_000 : AI_LIMITS.healthCacheTtlMs),
    });
    return value;
  } catch (error) {
    const classified = classifyTransportError(error);
    const value: AiVerification = {
      status: "unreachable",
      message: classified.detail
        ? `${STATUS_MESSAGES.unreachable} (${classified.detail})`
        : STATUS_MESSAGES.unreachable,
      checkedAt,
      latencyMs: Date.now() - startedAt,
    };
    verificationCache.set(cacheKey, {
      fingerprint,
      value,
      expiresAt: now + 30_000,
    });
    logAiFailure("health", classified);
    return value;
  } finally {
    clearTimeout(timer);
  }
}

/** Test-only helper. */
export function resetAiVerificationCache(): void {
  verificationCache.clear();
}
