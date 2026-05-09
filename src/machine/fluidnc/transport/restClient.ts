export type FluidNCHttpMethod = "GET" | "POST" | "DELETE";

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
    if (!response.ok)
      throw new Error(`HTTP ${response.status} ${method} ${url}`);
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
    if (!response.ok) throw new Error(`HTTP ${response.status} POST ${url}`);
    return response;
  }
}
