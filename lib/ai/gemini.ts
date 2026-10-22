import "server-only";
import { ApiError, GoogleGenAI, type SchemaUnion } from "@google/genai";
import type { z } from "zod";
import { DEFAULT_GEMINI_MODEL } from "@/lib/constants/ai";
import type { FallbackReason } from "@/lib/constants/events";
import { safeModelNameSchema } from "@/lib/validation/schemas";

export class GeminiRequestError extends Error {
  readonly reason: FallbackReason;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    reason: FallbackReason,
    message: string,
    options: { retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = "GeminiRequestError";
    this.reason = reason;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

export interface GeminiRuntimeConfig {
  configured: boolean;
  apiKey: string;
  model: string;
  usedDefaultModel: boolean;
  usedDefaultDueToInvalidEnv: boolean;
}

/** Read server-only configuration. The key is never serialized or logged. */
export function readGeminiConfig(
  env: Record<string, string | undefined> = process.env,
): GeminiRuntimeConfig {
  const apiKey = (env.GEMINI_API_KEY ?? "").trim();
  const rawModel = (env.GEMINI_MODEL ?? "").trim();
  const parsed = rawModel ? safeModelNameSchema.safeParse(rawModel) : null;
  const model = parsed?.success ? parsed.data : DEFAULT_GEMINI_MODEL;
  return {
    configured: apiKey.length > 0,
    apiKey,
    model,
    usedDefaultModel: !rawModel,
    usedDefaultDueToInvalidEnv: Boolean(rawModel) && parsed !== null && !parsed.success,
  };
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

/** Map SDK/network failures to safe, user-facing fallback reasons. */
export function classifyGeminiError(error: unknown): GeminiRequestError {
  if (error instanceof GeminiRequestError) return error;

  if (error instanceof ApiError) {
    const status = error.status;
    if (status === 429) {
      return new GeminiRequestError("rate_limited", "Gemini quota or rate limit reached", {
        retryable: false,
        status,
      });
    }
    if (status === 408 || status >= 500) {
      return new GeminiRequestError("provider_error", "Gemini service error", {
        retryable: true,
        status,
      });
    }
    return new GeminiRequestError("provider_error", "Gemini request was rejected", {
      retryable: false,
      status,
    });
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return new GeminiRequestError("timeout", "Gemini request timed out");
    }
    if (error instanceof TypeError || /fetch failed|network/i.test(error.message)) {
      return new GeminiRequestError("network_error", "Gemini network failure", {
        retryable: true,
      });
    }
  }

  return new GeminiRequestError("provider_error", "Unexpected Gemini failure");
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
            temperature: input.temperature ?? 0.2,
            maxOutputTokens: input.maxOutputTokens ?? 900,
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
          throw new GeminiRequestError(
            "invalid_response",
            "Gemini returned an empty response",
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
    throw new GeminiRequestError(
      "invalid_response",
      "Gemini response failed schema validation",
    );
  }
  return result.data;
}
