import "server-only";
import { createHash } from "node:crypto";
import { ApiError, GoogleGenAI, ThinkingLevel, type SchemaUnion } from "@google/genai";
import type { z } from "zod";
import {
  AI_LIMITS,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_ID,
  type AiVerificationStatus,
} from "@/lib/constants/ai";
import type { FallbackReason } from "@/lib/constants/events";
import { safeModelNameSchema } from "@/lib/validation/schemas";

export class GeminiRequestError extends Error {
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
    this.name = "GeminiRequestError";
    this.reason = reason;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.detail = options.detail;
  }
}

export type GeminiKeySource = "GEMINI_API_KEY" | "GOOGLE_API_KEY";

export interface GeminiRuntimeConfig {
  configured: boolean;
  apiKey: string;
  /** Always `gemini-3.8-flash`; the app does not switch models at runtime. */
  model: string;
  /** Which server-side variable supplied the key. Never the key itself. */
  keySource: GeminiKeySource | null;
  /** Raw `GEMINI_MODEL` value when it could not be honoured. */
  ignoredModelEnv: string | null;
  usedDefaultModel: boolean;
  usedDefaultDueToInvalidEnv: boolean;
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

/** Resolve an environment value to the pinned model, or `null` if different. */
export function normalizeModelId(raw: string): string | null {
  const cleaned = raw.trim().replace(/^models\//i, "").replace(/[\s_]+/g, "-").toLowerCase();
  return cleaned === GEMINI_MODEL_ID ? GEMINI_MODEL_ID : null;
}

/** Read server-only configuration. The key is never serialized or logged. */
export function readGeminiConfig(
  env: Record<string, string | undefined> = process.env,
): GeminiRuntimeConfig {
  const primary = normalizeApiKey(env.GEMINI_API_KEY);
  const secondary = normalizeApiKey(env.GOOGLE_API_KEY);
  const apiKey = primary || secondary;
  const keySource: GeminiKeySource | null = primary
    ? "GEMINI_API_KEY"
    : secondary
      ? "GOOGLE_API_KEY"
      : null;

  const rawModel = (env.GEMINI_MODEL ?? "").trim();
  const normalizedModel = rawModel ? normalizeModelId(rawModel) : null;
  const syntaxValid = rawModel ? safeModelNameSchema.safeParse(rawModel).success : false;

  return {
    configured: apiKey.length > 0,
    apiKey,
    // Pinned: the app is prompted and tested for Gemini 3.8 Flash only.
    model: DEFAULT_GEMINI_MODEL,
    keySource,
    ignoredModelEnv: rawModel && !normalizedModel ? rawModel : null,
    usedDefaultModel: !(rawModel && normalizedModel),
    usedDefaultDueToInvalidEnv: Boolean(rawModel) && !syntaxValid,
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
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redacted]")
    .replace(/Bearer\s+[0-9A-Za-z._-]{10,}/gi, "Bearer [redacted]")
    .replace(/key=[^\s&]+/gi, "key=[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, 180);
}

export interface GeminiJsonInput {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: Record<string, unknown> | SchemaUnion;
  timeoutMs: number;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface GeminiJsonClient {
  model: string;
  generateJson(input: GeminiJsonInput): Promise<string>;
}

function httpDetail(error: ApiError): string | undefined {
  const status = typeof error.status === "number" ? `HTTP ${error.status}` : undefined;
  const message = sanitizeProviderDetail(error.message);
  return [status, message].filter(Boolean).join(" · ") || undefined;
}

/** Map SDK/network failures to safe, user-facing fallback reasons. */
export function classifyGeminiError(error: unknown): GeminiRequestError {
  if (error instanceof GeminiRequestError) return error;

  if (error instanceof ApiError) {
    const status = error.status;
    const detail = httpDetail(error);
    if (status === 429) {
      return new GeminiRequestError("rate_limited", "Gemini quota or rate limit reached", {
        retryable: false,
        status,
        detail,
      });
    }
    if (status === 408 || status >= 500) {
      return new GeminiRequestError("provider_error", "Gemini service error", {
        retryable: true,
        status,
        detail,
      });
    }
    return new GeminiRequestError("provider_error", "Gemini request was rejected", {
      retryable: false,
      status,
      detail,
    });
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return new GeminiRequestError("timeout", "Gemini request timed out", {
        retryable: true,
      });
    }
    if (error instanceof TypeError || /fetch failed|network/i.test(error.message)) {
      return new GeminiRequestError("network_error", "Gemini network failure", {
        retryable: true,
        detail: sanitizeProviderDetail(error.message),
      });
    }
    return new GeminiRequestError("provider_error", "Unexpected Gemini failure", {
      detail: sanitizeProviderDetail(error.message),
    });
  }

  return new GeminiRequestError("provider_error", "Unexpected Gemini failure");
}

/**
 * One safe warning per failure. Includes only the reason, HTTP status, and a
 * sanitized provider message — never prompts, event text, or the key.
 */
export function logGeminiFailure(scope: string, error: GeminiRequestError): void {
  console.warn("[ringcare:ai]", {
    scope,
    reason: error.reason,
    status: error.status,
    detail: error.detail,
  });
}

export function createGeminiClient(config: {
  apiKey: string;
  model: string;
}): GeminiJsonClient {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  return {
    model: config.model,
    async generateJson(input: GeminiJsonInput): Promise<string> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
      try {
        const response = await ai.models.generateContent({
          model: config.model,
          contents: input.userPrompt,
          config: {
            systemInstruction: input.systemInstruction,
            responseMimeType: "application/json",
            responseSchema: input.responseSchema as SchemaUnion,
            maxOutputTokens:
              input.maxOutputTokens ?? AI_LIMITS.maxOutputTokensNarrative,
            // Gemini 3.8 Flash cannot disable thinking and defaults to medium.
            // "low" keeps latency and thought-token usage predictable for these
            // short structured tasks (MINIMAL is rejected by this model).
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            ...(input.temperature !== undefined
              ? { temperature: input.temperature }
              : {}),
            abortSignal: controller.signal,
            httpOptions: {
              timeout: input.timeoutMs,
              // The app owns retry policy; disable SDK automatic retries.
              retryOptions: { attempts: 1 },
            },
          },
        });
        const text = response.text;
        if (!text) {
          const finishReason = response.candidates?.[0]?.finishReason;
          const thoughts = response.usageMetadata?.thoughtsTokenCount;
          const detail = [
            finishReason ? `finishReason ${finishReason}` : null,
            typeof thoughts === "number" ? `${thoughts} thought tokens` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          throw new GeminiRequestError(
            "invalid_response",
            "Gemini returned an empty response",
            { detail: detail || undefined },
          );
        }
        return text;
      } catch (error) {
        throw classifyGeminiError(error);
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
  client: GeminiJsonClient,
  input: GeminiJsonInput,
  maxAttempts = 2,
): Promise<string> {
  let lastError: GeminiRequestError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.generateJson(input);
    } catch (error) {
      lastError = classifyGeminiError(error);
      if (!lastError.retryable || attempt >= maxAttempts) throw lastError;
      await delay(350);
    }
  }
  throw lastError ?? new GeminiRequestError("unknown", "Gemini request failed");
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
  throw new GeminiRequestError("invalid_response", "Gemini returned non-JSON content");
}

export interface StructuredGenerationOptions<T> {
  client: GeminiJsonClient;
  systemInstruction: string;
  userPrompt: string;
  responseSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
  timeoutMs: number;
  maxOutputTokens?: number;
  temperature?: number;
}

export async function generateStructured<T>({
  client,
  systemInstruction,
  userPrompt,
  responseSchema,
  schema,
  timeoutMs,
  maxOutputTokens,
  temperature,
}: StructuredGenerationOptions<T>): Promise<T> {
  const text = await generateJsonWithRetry(client, {
    systemInstruction,
    userPrompt,
    responseSchema,
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
    throw new GeminiRequestError(
      "invalid_response",
      "Gemini response failed schema validation",
      { detail },
    );
  }
  return result.data;
}

/* -------------------------------------------------------------------------- */
/*                          Credential verification                           */
/* -------------------------------------------------------------------------- */

export interface GeminiVerification {
  status: AiVerificationStatus;
  message: string;
  checkedAt: string;
  latencyMs?: number;
}

interface VerificationEntry {
  fingerprint: string;
  expiresAt: number;
  value: GeminiVerification;
}

const verificationCache = new Map<string, VerificationEntry>();

function keyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

const STATUS_MESSAGES: Record<AiVerificationStatus, string> = {
  ok: `${GEMINI_MODEL_ID} responded to a metadata request. The key and model are usable.`,
  not_configured:
    "No server-side Gemini key was found. Set GEMINI_API_KEY (or GOOGLE_API_KEY) and redeploy.",
  invalid_key:
    "Gemini rejected the API key (HTTP 401/403). Replace GEMINI_API_KEY in your deployment, then redeploy.",
  model_unavailable: `Gemini returned HTTP 404 for ${GEMINI_MODEL_ID}. The key may be valid, but this model is not available to the project.`,
  quota:
    "Gemini reported a quota or rate limit (HTTP 429). Check the project quota in Google AI Studio.",
  unreachable:
    "The server could not reach Gemini. Check outbound network access from the deployment.",
  error: "Gemini returned an unexpected error while verifying the key.",
  unverified:
    "The key is present but has not been verified. Use “Test connection” to check it.",
};

/**
 * Verify the key against Gemini's free `models.get` endpoint. This does not
 * consume generation tokens and results are cached per instance for five
 * minutes so the dashboard can poll health safely.
 */
export async function verifyGeminiAccess(
  config: GeminiRuntimeConfig,
  options: { force?: boolean; now?: number; fetchImpl?: typeof fetch } = {},
): Promise<GeminiVerification> {
  const now = options.now ?? Date.now();
  const checkedAt = new Date(now).toISOString();

  if (!config.configured) {
    return { status: "not_configured", message: STATUS_MESSAGES.not_configured, checkedAt };
  }

  const fingerprint = keyFingerprint(config.apiKey);
  const cacheKey = `${config.model}:${fingerprint}`;
  const cached = verificationCache.get(cacheKey);
  if (!options.force && cached && cached.expiresAt > now) {
    return cached.value;
  }

  const startedAt = Date.now();
  try {
    const ai = new GoogleGenAI({
      apiKey: config.apiKey,
      ...(options.fetchImpl
        ? { httpOptions: { fetch: options.fetchImpl as never } }
        : {}),
    });
    await ai.models.get({
      model: config.model,
      config: { httpOptions: { timeout: AI_LIMITS.healthCheckTimeoutMs } },
    });
    const value: GeminiVerification = {
      status: "ok",
      message: STATUS_MESSAGES.ok,
      checkedAt,
      latencyMs: Date.now() - startedAt,
    };
    verificationCache.set(cacheKey, {
      fingerprint,
      value,
      expiresAt: now + AI_LIMITS.healthCacheTtlMs,
    });
    return value;
  } catch (error) {
    const classified = classifyGeminiError(error);
    const status: AiVerificationStatus =
      classified.status === 401 || classified.status === 403
        ? "invalid_key"
        : classified.status === 404
          ? "model_unavailable"
          : classified.reason === "rate_limited"
            ? "quota"
            : classified.reason === "network_error" || classified.reason === "timeout"
              ? "unreachable"
              : "error";
    const base = STATUS_MESSAGES[status];
    const value: GeminiVerification = {
      status,
      message: classified.detail ? `${base} (${classified.detail})` : base,
      checkedAt,
      latencyMs: Date.now() - startedAt,
    };
    // Cache failures briefly so a broken deployment does not hammer Gemini,
    // but allow a quick retry after a transient network error.
    verificationCache.set(cacheKey, {
      fingerprint,
      value,
      expiresAt: now + (status === "unreachable" ? 30_000 : AI_LIMITS.healthCacheTtlMs),
    });
    logGeminiFailure("health", classified);
    return value;
  }
}

/** Test-only helper. */
export function resetGeminiVerificationCache(): void {
  verificationCache.clear();
}
