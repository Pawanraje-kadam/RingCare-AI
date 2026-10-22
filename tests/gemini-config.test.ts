import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyGeminiError,
  normalizeApiKey,
  normalizeModelId,
  readGeminiConfig,
  resetGeminiVerificationCache,
  sanitizeProviderDetail,
  verifyGeminiAccess,
} from "@/lib/ai/gemini";
import { GeminiRequestError } from "@/lib/ai/gemini";

const GOOD_KEY = "AIzaSyDummyKeyForTests_1234567890";

beforeEach(() => {
  resetGeminiVerificationCache();
});

describe("Gemini configuration", () => {
  it("repairs pasted quotes, Bearer prefixes, and whitespace", () => {
    expect(normalizeApiKey(`  "AIzaSyTest-key_123"  `)).toBe("AIzaSyTest-key_123");
    expect(normalizeApiKey("Bearer AIzaSyTest-key_123")).toBe("AIzaSyTest-key_123");
    expect(normalizeApiKey("AIzaSyTest\n-key_12 3")).toBe("AIzaSyTest-key_123");
    expect(normalizeApiKey(undefined)).toBe("");
  });

  it("reads GEMINI_API_KEY first and falls back to GOOGLE_API_KEY", () => {
    const primary = readGeminiConfig({ GEMINI_API_KEY: GOOD_KEY });
    expect(primary.configured).toBe(true);
    expect(primary.keySource).toBe("GEMINI_API_KEY");
    expect(primary.model).toBe("gemini-3.8-flash");

    const fallback = readGeminiConfig({ GOOGLE_API_KEY: ` ${GOOD_KEY} ` });
    expect(fallback.configured).toBe(true);
    expect(fallback.keySource).toBe("GOOGLE_API_KEY");
    expect(fallback.apiKey).toBe(GOOD_KEY);

    const none = readGeminiConfig({});
    expect(none.configured).toBe(false);
    expect(none.keySource).toBeNull();
  });

  it("accepts only the pinned 3.8 Flash model and reports ignored values", () => {
    expect(normalizeModelId("gemini-3.8-flash")).toBe("gemini-3.8-flash");
    expect(normalizeModelId("models/gemini-3.8-flash")).toBe("gemini-3.8-flash");
    expect(normalizeModelId("Gemini 3.8 Flash")).toBe("gemini-3.8-flash");
    expect(normalizeModelId("gemini-2.5-flash")).toBeNull();

    const accepted = readGeminiConfig({
      GEMINI_API_KEY: GOOD_KEY,
      GEMINI_MODEL: "models/gemini-3.8-flash",
    });
    expect(accepted.model).toBe("gemini-3.8-flash");
    expect(accepted.ignoredModelEnv).toBeNull();

    const ignored = readGeminiConfig({
      GEMINI_API_KEY: GOOD_KEY,
      GEMINI_MODEL: "gemini-2.5-flash",
    });
    expect(ignored.model).toBe("gemini-3.8-flash");
    expect(ignored.ignoredModelEnv).toBe("gemini-2.5-flash");
  });

  it("classifies provider failures without leaking secrets", () => {
    const auth = classifyGeminiError({
      name: "ApiError",
    });
    // Anonymous objects are treated as unexpected provider failures.
    expect(auth.reason).toBe("provider_error");

    const timeout = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(classifyGeminiError(timeout).reason).toBe("timeout");

    const network = new TypeError("fetch failed");
    expect(classifyGeminiError(network).reason).toBe("network_error");

    const already = new GeminiRequestError("unsafe_response", "no");
    expect(classifyGeminiError(already)).toBe(already);

    const detail = sanitizeProviderDetail(
      '{"error":{"code":401,"message":"API key not valid for AIzaSyDummyKeyForTests_1234567890"}}',
    );
    expect(detail).toBe("API key not valid for [redacted]");
    expect(detail).not.toContain(GOOD_KEY);
  });
});

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("Gemini credential verification", () => {
  it("reports not_configured when no key exists", async () => {
    const result = await verifyGeminiAccess(readGeminiConfig({}));
    expect(result.status).toBe("not_configured");
    expect(result.message).toMatch(/GEMINI_API_KEY/);
  });

  it("reports ok when the model metadata request succeeds", async () => {
    const config = readGeminiConfig({ GEMINI_API_KEY: GOOD_KEY });
    const result = await verifyGeminiAccess(config, {
      fetchImpl: fakeFetch(200, {
        name: "models/gemini-3.8-flash",
        displayName: "Gemini 3.8 Flash",
      }) as unknown as typeof fetch,
    });
    expect(result.status).toBe("ok");
    expect(result.message).toContain("gemini-3.8-flash");
  });

  it("distinguishes an invalid key from a missing model", async () => {
    const config = readGeminiConfig({ GEMINI_API_KEY: GOOD_KEY });
    const unauthorized = await verifyGeminiAccess(config, {
      fetchImpl: fakeFetch(401, {
        error: { code: 401, message: "API key not valid. Please pass a valid API key." },
      }) as unknown as typeof fetch,
    });
    expect(unauthorized.status).toBe("invalid_key");
    expect(unauthorized.message).toMatch(/redeploy/i);

    resetGeminiVerificationCache();
    const missing = await verifyGeminiAccess(config, {
      fetchImpl: fakeFetch(404, {
        error: { code: 404, message: "models/gemini-3.8-flash is not found" },
      }) as unknown as typeof fetch,
    });
    expect(missing.status).toBe("model_unavailable");
  });

  it("reports quota errors", async () => {
    const config = readGeminiConfig({ GEMINI_API_KEY: GOOD_KEY });
    const result = await verifyGeminiAccess(config, {
      fetchImpl: fakeFetch(429, {
        error: { code: 429, message: "Resource has been exhausted" },
      }) as unknown as typeof fetch,
    });
    expect(result.status).toBe("quota");
  });
});
