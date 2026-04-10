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
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      ...(timeoutMs > 0 && { signal: AbortSignal.timeout(timeoutMs) }),
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
