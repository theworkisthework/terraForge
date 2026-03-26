import { describe, it, expect, vi } from "vitest";
import { parseFluidNCStatus } from "../../src/machine/serial";

// Import SerialClient for parseListLines / sendAndReceive tests
// We'll test parseListLines indirectly through the class
import { SerialClient } from "../../src/machine/serial";

// Mock serialport so we don't need real hardware
vi.mock("serialport", () => ({
  SerialPort: class MockSerialPort {
    static list = vi.fn().mockResolvedValue([]);
    isOpen = true;
    write = vi.fn((_data: string, cb?: (err?: Error) => void) => cb?.());
    open = vi.fn((cb: (err?: Error) => void) => cb());
    close = vi.fn((cb: (err?: Error) => void) => cb());
    pipe = vi.fn().mockReturnValue({
      on: vi.fn(),
    });
  },
  ReadlineParser: class MockReadlineParser {
    on = vi.fn();
  },
}));

describe("parseFluidNCStatus", () => {
  // ── State parsing ───────────────────────────────────────────────────────

  it("parses Idle state", () => {
    const s = parseFluidNCStatus("<Idle|MPos:0.000,0.000,0.000>");
    expect(s.state).toBe("Idle");
  });

  it("parses Run state", () => {
    const s = parseFluidNCStatus("<Run|MPos:10.000,20.000,0.000>");
    expect(s.state).toBe("Run");
  });

  it("parses Hold state", () => {
    const s = parseFluidNCStatus("<Hold:0|MPos:0.000,0.000,0.000>");
    expect(s.state).toBe("Hold");
  });

  it("parses Alarm state", () => {
    const s = parseFluidNCStatus("<Alarm|MPos:0.000,0.000,0.000>");
    expect(s.state).toBe("Alarm");
  });

  it("parses Jog state", () => {
    const s = parseFluidNCStatus("<Jog|MPos:5.000,5.000,0.000>");
    expect(s.state).toBe("Jog");
  });

  it("returns Unknown for invalid state", () => {
    const s = parseFluidNCStatus("<Banana|MPos:0.000,0.000,0.000>");
    expect(s.state).toBe("Unknown");
  });

  it("returns Unknown for empty/garbage input", () => {
    const s = parseFluidNCStatus("garbage data");
    expect(s.state).toBe("Unknown");
  });

  // ── Position parsing ────────────────────────────────────────────────────

  it("extracts MPos coordinates", () => {
    const s = parseFluidNCStatus("<Idle|MPos:12.345,67.890,1.000>");
    expect(s.mpos).toEqual({ x: 12.345, y: 67.89, z: 1 });
  });

  it("extracts WPos when present", () => {
    const s = parseFluidNCStatus("<Idle|MPos:0,0,0|WPos:5.5,6.6,7.7>");
    expect(s.wpos).toEqual({ x: 5.5, y: 6.6, z: 7.7 });
  });

  it("falls back to MPos for WPos when WPos absent", () => {
    const s = parseFluidNCStatus("<Idle|MPos:10,20,30>");
    expect(s.wpos).toEqual({ x: 10, y: 20, z: 30 });
  });

  it("defaults positions to 0,0,0 when not present", () => {
    const s = parseFluidNCStatus("<Idle>");
    expect(s.mpos).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("handles negative coordinates", () => {
    const s = parseFluidNCStatus("<Idle|MPos:-10.5,-20.3,-0.1>");
    expect(s.mpos.x).toBeCloseTo(-10.5);
    expect(s.mpos.y).toBeCloseTo(-20.3);
    expect(s.mpos.z).toBeCloseTo(-0.1);
  });

  // ── Line number parsing ─────────────────────────────────────────────────

  it("extracts line number and total from Ln: field", () => {
    const s = parseFluidNCStatus("<Run|MPos:0,0,0|Ln:42,100>");
    expect(s.lineNum).toBe(42);
    expect(s.lineTotal).toBe(100);
  });

  it("returns undefined for lineNum when Ln not present", () => {
    const s = parseFluidNCStatus("<Idle|MPos:0,0,0>");
    expect(s.lineNum).toBeUndefined();
    expect(s.lineTotal).toBeUndefined();
  });

  // ── Raw string ──────────────────────────────────────────────────────────

  it("preserves the raw input string", () => {
    const raw = "<Idle|MPos:1,2,3>";
    const s = parseFluidNCStatus(raw);
    expect(s.raw).toBe(raw);
  });

  // ── All valid states ────────────────────────────────────────────────────

  it.each([
    "Idle",
    "Run",
    "Hold",
    "Jog",
    "Alarm",
    "Door",
    "Check",
    "Home",
    "Sleep",
  ])("recognises %s as a valid state", (state) => {
    const s = parseFluidNCStatus(`<${state}|MPos:0,0,0>`);
    expect(s.state).toBe(state);
  });
});

// ── parseListLines (via SerialClient internals) ───────────────────────────────

describe("SerialClient.parseListLines", () => {
  let client: SerialClient;

  beforeEach(() => {
    client = new SerialClient();
  });

  // Access parseListLines via the private method
  const callParseList = (
    client: SerialClient,
    lines: string[],
    pathPrefix: string,
    topLevelOnly = false,
  ) => (client as any).parseListLines(lines, pathPrefix, topLevelOnly);

  it("parses SD FILE lines with single-space indent", () => {
    const lines = ["[FILE: test.gcode|SIZE:1234]", "[FILE: art.nc|SIZE:5678]"];
    const result = callParseList(client, lines, "/");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: "test.gcode",
      size: 1234,
      isDirectory: false,
    });
    expect(result[1]).toMatchObject({ name: "art.nc", size: 5678 });
  });

  it("parses SD DIR lines", () => {
    const lines = ["[DIR:subdir]"];
    const result = callParseList(client, lines, "/");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "subdir",
      isDirectory: true,
      size: 0,
    });
  });

  it("parses LocalFS FILE lines (colon then leading slash)", () => {
    const lines = ["[FILE:/config.yaml|SIZE:256]"];
    const result = callParseList(client, lines, "/");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "config.yaml",
      size: 256,
      isDirectory: false,
    });
  });

  it("filters nested files when topLevelOnly is true", () => {
    const lines = [
      "[FILE: top.gcode|SIZE:100]",
      "[FILE:  nested.gcode|SIZE:200]", // two-space indent → nested
    ];
    const result = callParseList(client, lines, "/", true);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("top.gcode");
  });

  it("includes nested files when topLevelOnly is false", () => {
    const lines = [
      "[FILE: top.gcode|SIZE:100]",
      "[FILE:  nested.gcode|SIZE:200]",
    ];
    const result = callParseList(client, lines, "/", false);
    expect(result).toHaveLength(2);
  });

  it("ignores footer lines and empty lines", () => {
    const lines = [
      "[FILE: test.gcode|SIZE:100]",
      "[/sd Used: 1234 Total: 5678]",
      "",
      "ok",
    ];
    const result = callParseList(client, lines, "/");
    expect(result).toHaveLength(1);
  });

  it("builds correct paths with non-root prefix", () => {
    const lines = ["[FILE: job.gcode|SIZE:100]"];
    const result = callParseList(client, lines, "/mydir");
    expect(result[0].path).toBe("/mydir/job.gcode");
  });
});

// ── SerialClient high-level methods ───────────────────────────────────────────

describe("SerialClient", () => {
  it("sendRealtime writes a single character without newline", () => {
    const client = new SerialClient();
    // Connect first to set up the port
    (client as any).port = { isOpen: true, write: vi.fn() };
    client.sendRealtime("!");
    expect((client as any).port.write).toHaveBeenCalledWith("!");
  });

  it("sendRealtime does nothing when port is closed", () => {
    const client = new SerialClient();
    (client as any).port = { isOpen: false, write: vi.fn() };
    client.sendRealtime("?");
    expect((client as any).port.write).not.toHaveBeenCalled();
  });
});

// ── SerialClient – send / handleLine / sendAndReceive ─────────────────────────

describe("SerialClient send and receive", () => {
  let client: SerialClient;
  let mockWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new SerialClient();
    mockWrite = vi.fn((_data: string, cb?: (err?: Error) => void) => cb?.());
    (client as any).port = { isOpen: true, write: mockWrite };
  });

  it("send() writes data with newline", async () => {
    await client.send("G1 X10");
    expect(mockWrite).toHaveBeenCalledWith("G1 X10\n", expect.any(Function));
  });

  it("send() rejects when port is null", async () => {
    (client as any).port = null;
    await expect(client.send("G1")).rejects.toThrow("not connected");
  });

  it("send() rejects when port is not open", async () => {
    (client as any).port = { isOpen: false, write: mockWrite };
    await expect(client.send("G1")).rejects.toThrow("not connected");
  });

  it("send() propagates write errors", async () => {
    (client as any).port = {
      isOpen: true,
      write: vi.fn((_d: string, cb?: (err?: Error) => void) =>
        cb?.(new Error("write fail")),
      ),
    };
    await expect(client.send("G1")).rejects.toThrow("write fail");
  });

  it("handleLine emits status event for <...> packets", () => {
    const handler = vi.fn();
    client.on("status", handler);
    (client as any).handleLine("<Idle|MPos:1,2,3>");
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ state: "Idle" }),
    );
  });

  it("handleLine emits data event for non-status lines", () => {
    const handler = vi.fn();
    client.on("data", handler);
    (client as any).handleLine("console output");
    expect(handler).toHaveBeenCalledWith("console output");
  });

  it("handleLine ignores blank / whitespace-only lines for data emit", () => {
    const handler = vi.fn();
    client.on("data", handler);
    (client as any).handleLine("   ");
    expect(handler).not.toHaveBeenCalled();
  });

  it("sendAndReceive resolves with collected lines on ok", async () => {
    const promise = client.sendAndReceive("$Status");
    (client as any).handleLine("LINE1");
    (client as any).handleLine("LINE2");
    (client as any).handleLine("ok");
    await expect(promise).resolves.toEqual(["LINE1", "LINE2"]);
  });

  it("sendAndReceive rejects on error: response", async () => {
    const promise = client.sendAndReceive("$Bad");
    (client as any).handleLine("error:5");
    await expect(promise).rejects.toThrow("error:5");
  });

  it("sendAndReceive rejects when port is null", async () => {
    (client as any).port = null;
    await expect(client.sendAndReceive("$X")).rejects.toThrow("not connected");
  });

  it("sendAndReceive queues a second call behind the first", async () => {
    const p1 = client.sendAndReceive("CMD1");
    const p2 = client.sendAndReceive("CMD2");

    (client as any).handleLine("r1");
    (client as any).handleLine("ok"); // resolves CMD1; drains CMD2
    const r1 = await p1;

    (client as any).handleLine("r2");
    (client as any).handleLine("ok"); // resolves CMD2
    const r2 = await p2;

    expect(r1).toEqual(["r1"]);
    expect(r2).toEqual(["r2"]);
  });

  it("sendAndReceive times out when no response arrives", async () => {
    vi.useFakeTimers();
    const promise = client.sendAndReceive("$Slow", 500);
    vi.advanceTimersByTime(600);
    await expect(promise).rejects.toThrow("timed out");
    vi.useRealTimers();
  });
});

// ── SerialClient – status polling ─────────────────────────────────────────────

describe("SerialClient polling", () => {
  let client: SerialClient;
  let mockWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new SerialClient();
    mockWrite = vi.fn();
    (client as any).port = { isOpen: true, write: mockWrite };
  });

  afterEach(() => {
    client.stopStatusPolling();
    vi.useRealTimers();
  });

  it("startStatusPolling sends ? at the given interval", () => {
    client.startStatusPolling(100);
    vi.advanceTimersByTime(350);
    expect(mockWrite).toHaveBeenCalledTimes(3);
    expect(mockWrite).toHaveBeenCalledWith("?");
  });

  it("stopStatusPolling prevents further sends", () => {
    client.startStatusPolling(100);
    client.stopStatusPolling();
    vi.advanceTimersByTime(500);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("startStatusPolling clears a previous interval before starting a new one", () => {
    client.startStatusPolling(200);
    client.startStatusPolling(100); // replaces: only 100 ms ticks count
    vi.advanceTimersByTime(350);
    expect(mockWrite).toHaveBeenCalledTimes(3); // 100, 200, 300 ms
  });
});

// ── SerialClient – high-level file ops ────────────────────────────────────────

describe("SerialClient file operations", () => {
  let client: SerialClient;

  beforeEach(() => {
    client = new SerialClient();
    (client as any).port = {
      isOpen: true,
      write: vi.fn((_d: string, cb?: (err?: Error) => void) => cb?.()),
    };
  });

  it("listFiles calls $LocalFS/List and returns parsed items", async () => {
    const p = client.listFiles("/");
    (client as any).handleLine("[FILE:/config.yaml|SIZE:256]");
    (client as any).handleLine("ok");
    const files = await p;
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: "config.yaml", size: 256 });
  });

  it("listSDFiles (root) filters nested files and returns top-level items", async () => {
    const p = client.listSDFiles("/");
    (client as any).handleLine("[FILE: top.gcode|SIZE:100]");
    (client as any).handleLine("[FILE:  nested.gcode|SIZE:50]"); // two spaces = nested
    (client as any).handleLine("ok");
    const files = await p;
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("top.gcode");
  });

  it("listSDFiles (subdir) uses the path argument", async () => {
    const p = client.listSDFiles("/subdir");
    (client as any).handleLine("[FILE: file.gcode|SIZE:100]");
    (client as any).handleLine("ok");
    await p;
    expect((client as any).port.write).toHaveBeenCalledWith(
      "$SD/List=/subdir\n",
      expect.any(Function),
    );
  });

  it("listSDFiles translates error:60 to 'No SD card'", async () => {
    const p = client.listSDFiles("/");
    (client as any).handleLine("error:60");
    await expect(p).rejects.toThrow("No SD card");
  });

  it("listSDFiles translates error:7 to 'No SD card'", async () => {
    const p = client.listSDFiles("/");
    (client as any).handleLine("error:7");
    await expect(p).rejects.toThrow("No SD card");
  });

  it("deleteFile sends $SD/Delete for sd source", async () => {
    const p = client.deleteFile("/test.gcode", "sd");
    (client as any).handleLine("ok");
    await p;
    expect((client as any).port.write).toHaveBeenCalledWith(
      "$SD/Delete=/test.gcode\n",
      expect.any(Function),
    );
  });

  it("deleteFile sends $LocalFS/Delete for fs source", async () => {
    const p = client.deleteFile("/config.yaml", "fs");
    (client as any).handleLine("ok");
    await p;
    expect((client as any).port.write).toHaveBeenCalledWith(
      "$LocalFS/Delete=/config.yaml\n",
      expect.any(Function),
    );
  });

  it("runFile sends $SD/Run for sd source", async () => {
    const p = client.runFile("/test.gcode", "sd");
    (client as any).handleLine("ok");
    await p;
    expect((client as any).port.write).toHaveBeenCalledWith(
      "$SD/Run=/test.gcode\n",
      expect.any(Function),
    );
  });

  it("runFile sends $LocalFS/Run for fs source", async () => {
    const p = client.runFile("/test.gcode", "fs");
    (client as any).handleLine("ok");
    await p;
    expect((client as any).port.write).toHaveBeenCalledWith(
      "$LocalFS/Run=/test.gcode\n",
      expect.any(Function),
    );
  });

  it("fetchFileText joins response lines with newlines", async () => {
    const p = client.fetchFileText("/test.gcode");
    (client as any).handleLine("G0 X0 Y0");
    (client as any).handleLine("G1 X10 Y10");
    (client as any).handleLine("ok");
    await expect(p).resolves.toBe("G0 X0 Y0\nG1 X10 Y10");
  });

  it("fetchFileText uses $LocalFS/Show for internal filesystem", async () => {
    const p = client.fetchFileText("/config.yaml", "internal");
    (client as any).handleLine("ok");
    await p;
    expect((client as any).port.write).toHaveBeenCalledWith(
      "$LocalFS/Show=/config.yaml\n",
      expect.any(Function),
    );
  });

  it("sendCommand returns the full response as a joined string", async () => {
    const p = client.sendCommand("$H");
    (client as any).handleLine("Homing started");
    (client as any).handleLine("ok");
    await expect(p).resolves.toBe("Homing started");
  });
});

// ── SerialClient – connect / disconnect ───────────────────────────────────────

describe("SerialClient connect and disconnect", () => {
  it("listPorts returns an array of port path strings", async () => {
    const client = new SerialClient();
    const ports = await client.listPorts();
    expect(Array.isArray(ports)).toBe(true);
  });

  it("disconnect resolves immediately when not connected", async () => {
    const client = new SerialClient();
    await expect(client.disconnect()).resolves.toBeUndefined();
  });

  it("disconnect closes the port when one is open", async () => {
    const client = new SerialClient();
    const mockClose = vi.fn((cb: (err?: Error) => void) => cb());
    (client as any).port = { isOpen: true, close: mockClose };
    await client.disconnect();
    expect(mockClose).toHaveBeenCalled();
    expect((client as any).port).toBeNull();
  });

  it("disconnect rejects a pending sendAndReceive command", async () => {
    const client = new SerialClient();
    (client as any).port = {
      isOpen: true,
      write: vi.fn((_d: string, cb?: (err?: Error) => void) => cb?.()),
      close: vi.fn((cb: (err?: Error) => void) => cb()),
    };
    const cmdPromise = client.sendAndReceive("CMD");
    await client.disconnect();
    await expect(cmdPromise).rejects.toThrow("disconnected");
  });

  it("connect() opens the port and sets up parser", async () => {
    const client = new SerialClient();
    await client.connect("/dev/ttyUSB0", 115200);
    expect((client as any).port).not.toBeNull();
    expect((client as any).parser).not.toBeNull();
  });
});

// Need beforeEach import
import { beforeEach, afterEach } from "vitest";
