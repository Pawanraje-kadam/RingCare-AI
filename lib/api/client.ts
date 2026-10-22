export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, options: { code?: string; status?: number } = {}) {
    super(message);
    this.name = "ApiClientError";
    this.code = options.code ?? "request_failed";
    this.status = options.status ?? 0;
  }
}

interface PostJsonOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

/** POST JSON to a same-origin route with a hard timeout and safe error messages. */
export async function postJson<T>(
  url: string,
  body: unknown,
  options: PostJsonOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 25_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const errorBody = (payload ?? {}) as ApiErrorBody;
      throw new ApiClientError(
        errorBody.error?.message ?? "The request could not be completed.",
        { code: errorBody.error?.code ?? "request_failed", status: response.status },
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiClientError("The request timed out.", { code: "timeout" });
    }
    throw new ApiClientError("The server could not be reached.", { code: "network_error" });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}

export async function getJson<T>(
  url: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiClientError("The service is not available.", {
        code: "request_failed",
        status: response.status,
      });
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError("The server could not be reached.", { code: "network_error" });
  } finally {
    clearTimeout(timer);
  }
}
