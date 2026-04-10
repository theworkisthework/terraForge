import { describe, expect, it } from "vitest";
import {
  parseSdRemoteFiles,
  parseRemoteFiles,
} from "../../src/machine/fluidnc/parsers/fileParsers";
import { parseFirmwareProbeResponse } from "../../src/machine/fluidnc/parsers/firmwareParser";
import { parseMachineStatus } from "../../src/machine/fluidnc/parsers/statusParser";

describe("FluidNC parser modules", () => {
  it("parses machine status reports", () => {
    const status = parseMachineStatus(
      "<Run|MPos:5.000,10.000,0.000|Ln:42,100>",
    );
    expect(status.state).toBe("Run");
    expect(status.mpos).toEqual({ x: 5, y: 10, z: 0 });
    expect(status.lineNum).toBe(42);
    expect(status.lineTotal).toBe(100);
  });

  it("parses firmware probe response", () => {
    const result = parseFirmwareProbeResponse(
      "FW version: FluidNC v4.0.1 # webcommunication: Sync: 80 # ...",
    );
    expect(result).toEqual({
      raw: "FW version: FluidNC v4.0.1 # webcommunication: Sync: 80 # ...",
      version: "4.0.1",
      major: 4,
      wsPort: 80,
    });
  });

  it("parses normal remote file lists", () => {
    const files = parseRemoteFiles("/jobs", {
      files: [
        { name: "test.gcode", size: 1234 },
        { name: "subdir", size: 0, dir: true },
      ],
    });
    expect(files).toEqual([
      {
        name: "test.gcode",
        path: "/jobs/test.gcode",
        size: 1234,
        isDirectory: false,
      },
      {
        name: "subdir",
        path: "/jobs/subdir",
        size: 0,
        isDirectory: true,
      },
    ]);
  });

  it("parses sd remote file lists and directory markers", () => {
    const files = parseSdRemoteFiles("/", {
      status: "ok",
      files: [
        { name: "job.gcode", size: "5678" },
        { name: "dir", size: "-1" },
      ],
    });
    expect(files).toEqual([
      {
        name: "job.gcode",
        path: "/job.gcode",
        size: 5678,
        isDirectory: false,
      },
      {
        name: "dir",
        path: "/dir",
        size: -1,
        isDirectory: true,
      },
    ]);
  });

  it("throws when sd response reports a card error", () => {
    expect(() =>
      parseSdRemoteFiles("/", { status: "SD CARD READER FAILED" }),
    ).toThrow(/SD card/);
  });
});
