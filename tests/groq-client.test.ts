import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createGroqClient,
  extractJsonObject,
  generateJsonWithRetry,
  generateStructured,
  GroqRequestError,
} from "@/lib/ai/groq";

const KEY = "gsk_DummyKeyForTests1234567890abcdef";
const MODEL = "llama-3.3-70b-versatile";

function completion(content: string | null, finishReason = "stop") {
  return {
    id: "chatcmpl-test",
    model: MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: finishReason,
      },
    ],
    usage: { prompt_tokens: 120, completion_tokens: 64 },
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const input = {
  systemInstruction: "Reply with JSON only.",
  userPrompt: 'Return {"ok":true}',
  timeoutMs: 5_000,
};

describe("Groq Chat Completions request shape", () => {
  it("posts an OpenAI-compatible JSON-mode request to /chat/completions", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, completion('{"ok":true}')),
    );
    const client = createGroqClient({
      apiKey: KEY,
      model: MODEL,
      baseUrl: "http://localhost:4010/openai/v1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const text = await client.generateJson({ ...input, maxOutputTokens: 1024 });
    expect(text).toBe('{"ok":true}');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://localhost:4010/openai/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${KEY}`,
    );

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe(MODEL);
    expect(body.stream).toBe(false);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_completion_tokens).toBe(1024);
    expect(body.temperature).toBe(0.2);
    expect(body.messages).toEqual([
      { role: "system", content: input.systemInstruction },
      { role: "user", content: input.userPrompt },
    ]);
  });

  it("treats truncated and empty completions as invalid responses", async () => {
    const truncated = createGroqClient({
      apiKey: KEY,
      model: MODEL,
      fetchImpl: vi.fn(async () =>
        jsonResponse(200, completion('{"summary":"half', "length")),
      ) as unknown as typeof fetch,
    });
    await expect(truncated.generateJson(input)).rejects.toMatchObject({
      reason: "invalid_response",
      detail: "finish_reason length",
    });

    const empty = createGroqClient({
      apiKey: KEY,
      model: MODEL,
      fetchImpl: vi.fn(async () =>
        jsonResponse(200, completion(null, "stop")),
      ) as unknown as typeof fetch,
    });
    await expect(empty.generateJson(input)).rejects.toMatchObject({
      reason: "invalid_response",
      detail: expect.stringContaining("finish_reason stop"),
    });
  });

  it("maps HTTP failures to typed, redacted errors", async () => {
    const unauthorized = createGroqClient({
      apiKey: KEY,
      model: MODEL,
      fetchImpl: vi.fn(async () =>
        jsonResponse(401, { error: { message: `Invalid API Key ${KEY}` } }),
      ) as unknown as typeof fetch,
    });
    await expect(unauthorized.generateJson(input)).rejects.toMatchObject({
      reason: "provider_error",
      status: 401,
      retryable: false,
      detail: expect.stringContaining("Invalid API Key [redacted]"),
    });

    const limited = createGroqClient({
      apiKey: KEY,
      model: MODEL,
      fetchImpl: vi.fn(async () =>
        jsonResponse(429, {
          error: { message: "Rate limit reached for requests" },
        }),
      ) as unknown as typeof fetch,
    });
    const error = await limited
      .generateJson(input)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GroqRequestError);
    expect((error as GroqRequestError).reason).toBe("rate_limited");
    expect((error as GroqRequestError).detail).not.toContain(KEY);
  });

  it("reports network failures as retryable network errors", async () => {
    const client = createGroqClient({
      apiKey: KEY,
      model: MODEL,
      fetchImpl: vi.fn(async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });
    await expect(client.generateJson(input)).rejects.toMatchObject({
      reason: "network_error",
      retryable: true,
    });
  });
});

describe("Groq retry and JSON handling", () => {
  it("retries one transient failure, then succeeds", async () => {
    let attempts = 0;
    const client = {
      model: MODEL,
      async generateJson() {
        attempts += 1;
        if (attempts === 1) {
          throw new GroqRequestError("provider_error", "Groq service error", {
            retryable: true,
            status: 503,
          });
        }
        return '{"ok":true}';
      },
    };
    await expect(generateJsonWithRetry(client, input)).resolves.toBe(
      '{"ok":true}',
    );
    expect(attempts).toBe(2);
  });

  it("never retries auth or quota failures", async () => {
    let attempts = 0;
    const client = {
      model: MODEL,
      async generateJson(): Promise<string> {
        attempts += 1;
        throw new GroqRequestError("rate_limited", "Groq rate limit reached");
      },
    };
    await expect(generateJsonWithRetry(client, input)).rejects.toMatchObject({
      reason: "rate_limited",
    });
    expect(attempts).toBe(1);
  });

  it("extracts JSON from fenced or prose-wrapped completions", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJsonObject('Here is the JSON: {"a":3} — done.')).toEqual({
      a: 3,
    });
    expect(() => extractJsonObject("no object here")).toThrow(GroqRequestError);
  });

  it("validates the decoded object against the schema", async () => {
    const schema = z.object({ ok: z.boolean() });
    const good = {
      model: MODEL,
      async generateJson() {
        return '{"ok":true}';
      },
    };
    await expect(
      generateStructured({ client: good, ...input, schema }),
    ).resolves.toEqual({ ok: true });

    const bad = {
      model: MODEL,
      async generateJson() {
        return '{"ok":"yes"}';
      },
    };
    await expect(
      generateStructured({ client: bad, ...input, schema }),
    ).rejects.toMatchObject({
      reason: "invalid_response",
      detail: expect.stringContaining("ok"),
    });
  });
});
