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

// Need beforeEach import
import { beforeEach } from "vitest";
