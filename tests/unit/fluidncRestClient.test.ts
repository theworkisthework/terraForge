import { beforeEach, describe, expect, it, vi } from "vitest";
import { FluidNCRestClient } from "../../src/machine/fluidnc/transport/restClient";

const mockFetch = vi.fn();

function mockResponse(body: string | object, status = 200): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
    headers: new Headers(),
  } as unknown as Response;
}

describe("FluidNCRestClient", () => {
  let client: FluidNCRestClient;

  beforeEach(() => {
    client = new FluidNCRestClient();
    client.setBaseUrl("http://192.168.1.100:80");
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  it("performs successful GET requests", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("ok"));
    const response = await client.get("/state");
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://192.168.1.100:80/state",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("performs successful POST requests", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("ok"));
    const response = await client.post("/command", "commandText=$I");
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://192.168.1.100:80/command",
      expect.objectContaining({
        method: "POST",
        body: "commandText=$I",
      }),
    );
  });

  it("throws on failed GET requests", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("", 500));
    await expect(client.get("/state")).rejects.toThrow("HTTP 500 GET");
  });

  it("throws on failed POST requests", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("", 404));
    await expect(client.post("/command", "commandText=test")).rejects.toThrow(
      "HTTP 404 POST",
    );
  });
});
