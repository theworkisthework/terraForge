import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FluidNCClient } from "../../src/machine/fluidnc";

// ── Mock global fetch ─────────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Helper: create a mock Response */
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

describe("FluidNCClient", () => {
  let client: FluidNCClient;

  beforeEach(() => {
    client = new FluidNCClient();
    client.setHost("192.168.1.100", 80);
  });

  // ── getStatus ───────────────────────────────────────────────────────────

  it("parses status from /state endpoint", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse("<Idle|MPos:10.000,20.000,0.000>"),
    );
    const status = await client.getStatus();
    expect(status.state).toBe("Idle");
    expect(status.mpos).toEqual({ x: 10, y: 20, z: 0 });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://192.168.1.100:80/state",
      expect.objectContaining({ method: "GET" }),
    );
  });

  // ── sendCommand ─────────────────────────────────────────────────────────

  it("sends command via GET for fw 4.x (default)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("ok"));
    const result = await client.sendCommand("G0 X10");
    expect(result).toBe("ok");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/command?plain="),
      expect.objectContaining({ method: "GET" }),
    );
  });

  // ── listFiles ───────────────────────────────────────────────────────────

  it("parses file listing from /files endpoint", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        files: [
          { name: "test.gcode", size: 1234 },
          { name: "subdir", size: 0, dir: true },
        ],
        path: "/",
      }),
    );
    const files = await client.listFiles("/");
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("test.gcode");
    expect(files[0].size).toBe(1234);
    expect(files[0].isDirectory).toBe(false);
    expect(files[1].name).toBe("subdir");
    expect(files[1].isDirectory).toBe(true);
  });

  it("handles empty file list", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ files: [], path: "/" }),
    );
    const files = await client.listFiles("/");
    expect(files).toEqual([]);
  });

  // ── listSDFiles ─────────────────────────────────────────────────────────

  it("parses SD file listing from /upload endpoint", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        files: [{ name: "job.gcode", size: "5678" }],
        path: "/",
        status: "ok",
      }),
    );
    const files = await client.listSDFiles("/");
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("job.gcode");
  });

  // ── runFile ─────────────────────────────────────────────────────────────

  it("sends $SD/Run command for sd filesystem", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("ok"));
    await client.runFile("/job.gcode", "sd");
    const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
    expect(url).toContain("$SD/Run=/job.gcode");
  });

  it("sends $LocalFS/Run command for fs filesystem", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("ok"));
    await client.runFile("/job.gcode", "fs");
    const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
    expect(url).toContain("$LocalFS/Run=/job.gcode");
  });

  // ── Error handling ──────────────────────────────────────────────────────

  it("throws on HTTP error from getStatus", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("", 500));
    await expect(client.getStatus()).rejects.toThrow("HTTP 500");
  });

  it("throws on HTTP error from sendCommand", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("", 404));
    await expect(client.sendCommand("test")).rejects.toThrow("HTTP 404");
  });

  // ── setHost ─────────────────────────────────────────────────────────────

  it("constructs correct base URL", async () => {
    client.setHost("myplotter.local", 8080);
    mockFetch.mockResolvedValueOnce(mockResponse("<Idle|MPos:0,0,0>"));
    await client.getStatus();
    expect(mockFetch).toHaveBeenCalledWith(
      "http://myplotter.local:8080/state",
      expect.any(Object),
    );
  });

  // ── deleteFile ──────────────────────────────────────────────────────────

  it("sends delete command via sendCommand", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("ok"));
    await client.deleteFile("/old.gcode", "sd");
    const url = mockFetch.mock.calls[0][0] as string;
    // fw >= 4 uses REST endpoint, not $SD/Delete command
    expect(url).toContain("/upload?action=delete");
    expect(url).toContain("old.gcode");
  });
});
