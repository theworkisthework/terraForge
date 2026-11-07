export type FluidNCHttpMethod = "GET" | "POST" | "DELETE";

/** The controller answered, but with a non-2xx status. */
export class FluidNCHttpError extends Error {
  constructor(
    readonly status: number,
    method: string,
    url: string,
  ) {
    super(`HTTP ${status} ${method} ${url}`);
    this.name = "FluidNCHttpError";
  }
}

/** True when a request was abandoned by its timeout rather than refused. */
export function isTimeoutError(error: unknown): boolean {
  // AbortSignal.timeout() rejects with a DOMException, which is not an
  // Error subclass in every runtime, so match on shape.
  if (typeof error !== "object" || error === null) return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return (
    name === "TimeoutError" ||
    (typeof message === "string" && /timed out/i.test(message))
  );
}

export class FluidNCRestClient {
  private baseUrl = "";

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async get(
    path: string,
    timeoutMs = 10_000,
    method: Extract<FluidNCHttpMethod, "GET" | "DELETE"> = "GET",
    signal?: AbortSignal,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    let fetchSignal: AbortSignal | undefined;
    let timeoutHandle: NodeJS.Timeout | null = null;
    let abortListener: (() => void) | null = null;

    if (signal && timeoutMs > 0) {
      const controller = new AbortController();
      fetchSignal = controller.signal;

      timeoutHandle = setTimeout(() => {
        controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      abortListener = () => {
        controller.abort(signal.reason ?? new Error("Request aborted"));
      };
      signal.addEventListener("abort", abortListener, { once: true });
    } else if (signal) {
      fetchSignal = signal;
    } else if (timeoutMs > 0) {
      fetchSignal = AbortSignal.timeout(timeoutMs);
    }

    const response = await fetch(url, {
      method,
      ...(fetchSignal && { signal: fetchSignal }),
    }).finally(() => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (signal && abortListener) {
        signal.removeEventListener("abort", abortListener);
      }
    });
    if (!response.ok) throw new FluidNCHttpError(response.status, method, url);
    return response;
  }

  async post(path: string, body: string): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new FluidNCHttpError(response.status, "POST", url);
    return response;
  }
}
