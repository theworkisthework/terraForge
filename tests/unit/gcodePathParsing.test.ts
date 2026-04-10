import { describe, it, expect } from "vitest";
import {
  tokenizePath,
  toAbsolute,
} from "../../src/workers/gcodeEngine/stages/pathParsing";

describe("gcode path parsing stage", () => {
  it("tokenizes mixed commands and preserves command casing", () => {
    const tokens = tokenizePath("M 0 0 l 10 -5 A 25 25 0 0 1 50 25 Z");
    expect(tokens.map((t) => t.type)).toEqual(["M", "l", "A", "Z"]);
    expect(tokens[1].args).toEqual([10, -5]);
    expect(tokens[2].args).toEqual([25, 25, 0, 0, 1, 50, 25]);
  });

  it("converts relative segments to absolute coordinates", () => {
    const abs = toAbsolute([
      { type: "M", args: [10, 10] },
      { type: "l", args: [5, 5] },
      { type: "h", args: [5] },
      { type: "v", args: [-3] },
    ]);

    expect(abs).toEqual([
      { type: "M", args: [10, 10] },
      { type: "L", args: [15, 15] },
      { type: "H", args: [20] },
      { type: "V", args: [12] },
    ]);
  });

  it("resets cursor on Z before a following relative segment", () => {
    const abs = toAbsolute([
      { type: "M", args: [10, 10] },
      { type: "L", args: [20, 20] },
      { type: "Z", args: [] },
      { type: "l", args: [2, 3] },
    ]);

    expect(abs[3]).toEqual({ type: "L", args: [12, 13] });
  });
});
