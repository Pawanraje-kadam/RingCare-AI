import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  generateContent: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@google/genai", () => {
  class ApiError extends Error {
    status: number;
    constructor(options: { message: string; status: number }) {
      super(options.message);
      this.name = "ApiError";
      this.status = options.status;
    }
  }
  class GoogleGenAI {
    models = {
      generateContent: sdk.generateContent,
      get: sdk.get,
    };
  }
  return {
    ApiError,
    GoogleGenAI,
    ThinkingLevel: {
      MINIMAL: "MINIMAL",
      LOW: "LOW",
      MEDIUM: "MEDIUM",
      HIGH: "HIGH",
    },
  };
});

import { createGeminiClient, GeminiRequestError } from "@/lib/ai/gemini";

beforeEach(() => {
  sdk.generateContent.mockReset();
  sdk.get.mockReset();
});

const input = {
  systemInstruction: "system",
  userPrompt: "prompt",
  responseSchema: { type: "OBJECT", properties: {} },
  timeoutMs: 5_000,
};

describe("Gemini SDK request shape", () => {
  it("pins the model, disables default medium thinking, and bounds output", async () => {
    sdk.generateContent.mockResolvedValue({ text: '{"ok":true}' });
    const client = createGeminiClient({
      apiKey: "AIzaSyDummyKeyForTests_1234567890",
      model: "gemini-3.8-flash",
    });

    await client.generateJson(input);

    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
    const request = sdk.generateContent.mock.calls[0][0];
    expect(request.model).toBe("gemini-3.8-flash");
    expect(request.config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(request.config.responseMimeType).toBe("application/json");
    expect(request.config.maxOutputTokens).toBeGreaterThanOrEqual(1024);
    expect(request.config.temperature).toBeUndefined();
    expect(request.config.httpOptions.retryOptions).toEqual({ attempts: 1 });
  });

  it("surfaces an empty response as an invalid response with a diagnostic", async () => {
    sdk.generateContent.mockResolvedValue({
      text: undefined,
      candidates: [{ finishReason: "MAX_TOKENS" }],
      usageMetadata: { thoughtsTokenCount: 1200 },
    });
    const client = createGeminiClient({
      apiKey: "AIzaSyDummyKeyForTests_1234567890",
      model: "gemini-3.8-flash",
    });

    await expect(client.generateJson(input)).rejects.toMatchObject({
      reason: "invalid_response",
      detail: expect.stringContaining("MAX_TOKENS"),
    });
    await expect(client.generateJson(input)).rejects.toBeInstanceOf(GeminiRequestError);
  });

  it("maps a 401 from the SDK to a safe provider detail", async () => {
    const ApiError = (await import("@google/genai")).ApiError;
    sdk.generateContent.mockRejectedValue(
      new ApiError({
        message: '{"error":{"message":"API key not valid. Please pass a valid API key."}}',
        status: 401,
      }),
    );
    const client = createGeminiClient({
      apiKey: "AIzaSyDummyKeyForTests_1234567890",
      model: "gemini-3.8-flash",
    });

    await expect(client.generateJson(input)).rejects.toMatchObject({
      reason: "provider_error",
      status: 401,
      detail: "HTTP 401 · API key not valid. Please pass a valid API key.",
    });
  });
});
