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
    mockFetch.mockResolvedValueOnce(mockResponse({ files: [], path: "/" }));
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

  // ── getStatus variants ──────────────────────────────────────────────────

  it("parses Run state with line numbers from getStatus", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse("<Run|MPos:5.000,10.000,0.000|Ln:42,100>"),
    );
    const status = await client.getStatus();
    expect(status.state).toBe("Run");
    expect(status.lineNum).toBe(42);
    expect(status.lineTotal).toBe(100);
  });

  it("parses Hold sub-state from getStatus", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse("<Hold:0|MPos:0.000,0.000,0.000>"),
    );
    const status = await client.getStatus();
    expect(status.state).toBe("Hold");
  });

  it("returns Unknown for unrecognised state", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse("<Banana|MPos:0.000,0.000,0.000>"),
    );
    const status = await client.getStatus();
    expect(status.state).toBe("Unknown");
  });

  // ── sendCommand 3.x ─────────────────────────────────────────────────────

  it("sends command via POST for fw 3.x", async () => {
    // Force fwMajor to 3 by accessing private field
    (client as any).fwMajor = 3;
    mockFetch.mockResolvedValueOnce(mockResponse("ok"));
    const result = await client.sendCommand("G0 X10");
    expect(result).toBe("ok");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/command"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  // ── listSDFiles error ───────────────────────────────────────────────────

  it("throws on SD card error status from listSDFiles", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ status: "SD CARD READER FAILED" }),
    );
    await expect(client.listSDFiles("/")).rejects.toThrow(
      /SD card.*READER FAILED/,
    );
  });

  it("throws on unexpected JSON from listSDFiles", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "not json",
      json: async () => {
        throw new Error("not json");
      },
      headers: new Headers(),
    } as unknown as Response);
    await expect(client.listSDFiles("/")).rejects.toThrow(
      /unexpected response/i,
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

  it("sends delete via REST DELETE for localFS (4.x)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("ok"));
    await client.deleteFile("/myfile.txt", "fs");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/localfs/myfile.txt"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("sends $SD/Delete command for 3.x firmware", async () => {
    (client as any).fwMajor = 3;
    mockFetch.mockResolvedValueOnce(mockResponse("ok"));
    await client.deleteFile("/job.gcode", "sd");
    // 3.x uses POST /command with commandText body
    const body = decodeURIComponent(mockFetch.mock.calls[0][1]?.body as string);
    expect(body).toContain("$SD/Delete=/job.gcode");
  });

  it("sends $LocalFS/Delete command for 3.x firmware", async () => {
    (client as any).fwMajor = 3;
    mockFetch.mockResolvedValueOnce(mockResponse("ok"));
    await client.deleteFile("/config.yaml", "fs");
    // 3.x uses POST /command with commandText body
    const body = decodeURIComponent(mockFetch.mock.calls[0][1]?.body as string);
    expect(body).toContain("$LocalFS/Delete=/config.yaml");
  });

  // ── Job control ─────────────────────────────────────────────────────────

  it("pauseJob sends '!' realtime via sendCommand fallback", async () => {
    // No WS connected → falls back to HTTP sendCommand
    mockFetch.mockResolvedValueOnce(mockResponse("ok"));
    await client.pauseJob();
    expect(mockFetch).toHaveBeenCalled();
  });

  it("resumeJob sends '~' realtime via sendCommand fallback", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("ok"));
    await client.resumeJob();
    expect(mockFetch).toHaveBeenCalled();
  });

  it("abortJob sends 0x18 realtime via sendCommand fallback", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("ok"));
    await client.abortJob();
    expect(mockFetch).toHaveBeenCalled();
  });

  // ── fetchFileText ───────────────────────────────────────────────────────

  it("fetches SD card file text via /sd/ prefix", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("G0 X10 Y10\nG1 X20 Y20"));
    const text = await client.fetchFileText("/test.gcode", "sdcard");
    expect(text).toContain("G0 X10 Y10");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/sd/test.gcode"),
      expect.any(Object),
    );
  });

  it("fetches LocalFS file text via /localfs/ prefix", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("config data"));
    const text = await client.fetchFileText("/config.yaml", "internal");
    expect(text).toBe("config data");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/localfs/config.yaml"),
      expect.any(Object),
    );
  });

  // ── probeFirmwareVersion ────────────────────────────────────────────────

  it("parses v4.x from [ESP800] response", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(
        "FW version: FluidNC v4.0.1 # webcommunication: Sync: 80 # ...",
      ),
    );
    const result = await client.probeFirmwareVersion();
    expect(result).not.toBeNull();
    expect(result!.major).toBe(4);
    expect(result!.version).toBe("4.0");
    expect(result!.wsPort).toBe(80);
  });

  it("parses v3.x from [ESP800] response with port 81", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(
        "FW version: FluidNC v3.9.7 # webcommunication: Sync: 81 # ...",
      ),
    );
    const result = await client.probeFirmwareVersion();
    expect(result!.major).toBe(3);
    expect(result!.wsPort).toBe(81);
  });

  it("falls back to strategy 2 (POST) when strategy 1 fails", async () => {
    // Strategy 1 fails
    mockFetch.mockResolvedValueOnce(mockResponse("", 500));
    // Strategy 2 succeeds
    mockFetch.mockResolvedValueOnce(
      mockResponse("FW version: FluidNC v4.1.0 # webcommunication: Sync: 80"),
    );
    const result = await client.probeFirmwareVersion();
    expect(result!.major).toBe(4);
  });

  it("falls back to strategy 3 ($I) when strategies 1+2 fail", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("", 500));
    mockFetch.mockResolvedValueOnce(mockResponse("", 500));
    mockFetch.mockResolvedValueOnce(
      mockResponse("[VER:3.9.7.FluidNC v3.9.7:]"),
    );
    const result = await client.probeFirmwareVersion();
    expect(result!.major).toBe(3);
    expect(result!.wsPort).toBeNull(); // no webcommunication field in $I
  });

  it("returns null when all probe strategies fail", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("", 500));
    mockFetch.mockResolvedValueOnce(mockResponse("", 500));
    mockFetch.mockResolvedValueOnce(mockResponse("", 500));
    const result = await client.probeFirmwareVersion();
    expect(result).toBeNull();
  });

  it("returns null when responses contain no version info", async () => {
    // All succeed but body has no version
    mockFetch.mockResolvedValueOnce(mockResponse("no version here"));
    mockFetch.mockResolvedValueOnce(mockResponse("still nothing"));
    mockFetch.mockResolvedValueOnce(mockResponse("nope"));
    const result = await client.probeFirmwareVersion();
    expect(result).toBeNull();
  });

  // ── disconnectWebSocket ─────────────────────────────────────────────────

  it("disconnectWebSocket resets fwMajor to null", () => {
    (client as any).fwMajor = 4;
    client.disconnectWebSocket();
    expect((client as any).fwMajor).toBeNull();
  });

  // ── Generation counter ──────────────────────────────────────────────────

  it("increments wsGeneration on disconnectWebSocket", () => {
    const gen1 = (client as any).wsGeneration;
    client.disconnectWebSocket();
    const gen2 = (client as any).wsGeneration;
    expect(gen2).toBeGreaterThan(gen1);
  });
});
