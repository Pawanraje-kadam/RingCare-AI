import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyAiError,
  classifyHttpError,
  GroqRequestError,
  normalizeApiKey,
  normalizeBaseUrl,
  normalizeModelId,
  readGroqConfig,
  resetAiVerificationCache,
  sanitizeProviderDetail,
  verifyAiAccess,
} from "@/lib/ai/groq";

const GOOD_KEY = "gsk_DummyKeyForTests1234567890abcdef";
const MODEL = "llama-3.3-70b-versatile";

beforeEach(() => {
  resetAiVerificationCache();
});

describe("Groq configuration", () => {
  it("repairs pasted quotes, Bearer prefixes, and whitespace", () => {
    expect(normalizeApiKey(`  "gsk_TestKey123"  `)).toBe("gsk_TestKey123");
    expect(normalizeApiKey("Bearer gsk_TestKey123")).toBe("gsk_TestKey123");
    expect(normalizeApiKey("gsk_Test\nKey_12 3")).toBe("gsk_TestKey_123");
    expect(normalizeApiKey(undefined)).toBe("");
  });

  it("reads only GROQ_API_KEY and never falls back to a legacy Gemini key", () => {
    const primary = readGroqConfig({ GROQ_API_KEY: GOOD_KEY });
    expect(primary.configured).toBe(true);
    expect(primary.keySource).toBe("GROQ_API_KEY");
    expect(primary.model).toBe(MODEL);
    expect(primary.baseUrl).toBe("https://api.groq.com/openai/v1");

    const legacy = readGroqConfig({
      GOOGLE_API_KEY: GOOD_KEY,
      GEMINI_API_KEY: GOOD_KEY,
    });
    expect(legacy.configured).toBe(false);
    expect(legacy.keySource).toBeNull();

    const none = readGroqConfig({});
    expect(none.configured).toBe(false);
  });

  it("normalizes a custom model and reports an invalid GROQ_MODEL", () => {
    expect(normalizeModelId(` ${MODEL} `)).toBe(MODEL);
    expect(normalizeModelId("mixtral-8x7b-32768")).toBe("mixtral-8x7b-32768");
    expect(normalizeModelId("not a model!!")).toBeNull();

    const accepted = readGroqConfig({
      GROQ_API_KEY: GOOD_KEY,
      GROQ_MODEL: "mixtral-8x7b-32768",
    });
    expect(accepted.model).toBe("mixtral-8x7b-32768");
    expect(accepted.modelNotice).toBeUndefined();

    const ignored = readGroqConfig({
      GROQ_API_KEY: GOOD_KEY,
      GROQ_MODEL: "not a model!!",
    });
    expect(ignored.model).toBe(MODEL);
    expect(ignored.modelNotice).toContain("GROQ_MODEL");
  });

  it("accepts a base-URL override and ignores an unusable one", () => {
    expect(normalizeBaseUrl("http://127.0.0.1:4010/openai/v1/")).toBe(
      "http://127.0.0.1:4010/openai/v1",
    );
    expect(normalizeBaseUrl("not a url")).toBe(
      "https://api.groq.com/openai/v1",
    );
    expect(normalizeBaseUrl(undefined)).toBe("https://api.groq.com/openai/v1");
  });

  it("classifies transport failures without leaking secrets", () => {
    const timeout = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(classifyAiError(timeout).reason).toBe("timeout");
    expect(classifyAiError(timeout).retryable).toBe(true);

    expect(classifyAiError(new TypeError("fetch failed")).reason).toBe(
      "network_error",
    );
    expect(classifyAiError({}).reason).toBe("provider_error");

    const already = new GroqRequestError("unsafe_response", "no");
    expect(classifyAiError(already)).toBe(already);

    const quota = classifyHttpError(
      429,
      '{"error":{"message":"Rate limit reached"}}',
    );
    expect(quota.reason).toBe("rate_limited");
    expect(quota.retryable).toBe(false);

    const server = classifyHttpError(503, "upstream down");
    expect(server.retryable).toBe(true);

    const detail = sanitizeProviderDetail(
      `HTTP 401 · {"error":{"code":401,"message":"Invalid API Key gsk_DummyKeyForTests1234567890abcdef"}}`,
    );
    expect(detail).toBe("Invalid API Key [redacted]");
    expect(detail).not.toContain(GOOD_KEY);

    expect(
      sanitizeProviderDetail(
        "Authorization: Bearer gsk_DummyKeyForTests1234567890abcdef",
      ),
    ).toBe("Authorization: Bearer [redacted]");
  });
});

function fakeFetch(status: number, body: unknown) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

describe("Groq credential verification", () => {
  it("reports not_configured without a key and never calls the network", async () => {
    const fetchImpl = vi.fn();
    const result = await verifyAiAccess(readGroqConfig({}), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("not_configured");
    expect(result.message).toMatch(/GROQ_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("verifies with the free /models endpoint using a bearer token", async () => {
    const config = readGroqConfig({ GROQ_API_KEY: GOOD_KEY });
    const fetchImpl = fakeFetch(200, { data: [{ id: MODEL }] });
    const result = await verifyAiAccess(config, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.status).toBe("ok");
    expect(result.message).toContain(MODEL);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.groq.com/openai/v1/models");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${GOOD_KEY}`,
    );
  });

  it("distinguishes an invalid key from an unavailable model", async () => {
    const config = readGroqConfig({ GROQ_API_KEY: GOOD_KEY });

    const unauthorized = await verifyAiAccess(config, {
      fetchImpl: fakeFetch(401, {
        error: { message: "Invalid API Key" },
      }) as unknown as typeof fetch,
    });
    expect(unauthorized.status).toBe("invalid_key");
    expect(unauthorized.message).toMatch(/rejected the API key/);

    const missingModel = await verifyAiAccess(config, {
      force: true,
      fetchImpl: fakeFetch(200, {
        data: [{ id: "mixtral-8x7b-32768" }, { id: "gemma2-9b-it" }],
      }) as unknown as typeof fetch,
    });
    expect(missingModel.status).toBe("model_unavailable");
    expect(missingModel.message).toContain(MODEL);

    const limited = await verifyAiAccess(config, {
      force: true,
      fetchImpl: fakeFetch(429, {
        error: { message: "Rate limit reached" },
      }) as unknown as typeof fetch,
    });
    expect(limited.status).toBe("quota");

    const offline = await verifyAiAccess(config, {
      force: true,
      fetchImpl: vi.fn(async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });
    expect(offline.status).toBe("unreachable");
  });

  it("caches verification results per key and honours force", async () => {
    const config = readGroqConfig({ GROQ_API_KEY: GOOD_KEY });
    const fetchImpl = fakeFetch(200, { data: [{ id: MODEL }] });

    await verifyAiAccess(config, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: 1_000,
    });
    await verifyAiAccess(config, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: 2_000,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await verifyAiAccess(config, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: 3_000,
      force: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
