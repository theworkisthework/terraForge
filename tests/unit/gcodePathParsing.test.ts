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

  it("tokenizes compact numbers without separators", () => {
    const tokens = tokenizePath("M10-5L20.5.25");
    expect(tokens).toEqual([
      { type: "M", args: [10, -5] },
      { type: "L", args: [20.5, 0.25] },
    ]);
  });

  it("tokenizes scientific notation numbers", () => {
    const tokens = tokenizePath("M1e-3,2E+1 L-.5e2,3.25e-1");
    expect(tokens).toEqual([
      { type: "M", args: [0.001, 20] },
      { type: "L", args: [-50, 0.325] },
    ]);
  });

  it("keeps H and V by default, and expands them to L from the current point when asked", () => {
    const tokens = tokenizePath("M 1 2 h 3 V 10 v -4 h -1 2");
    expect(toAbsolute(tokens).map((t) => [t.type, t.args])).toEqual([
      ["M", [1, 2]],
      ["H", [4]],
      ["V", [10]],
      ["V", [6]],
      ["H", [3, 5]],
    ]);
    expect(toAbsolute(tokens, { expandHV: true }).map((t) => [t.type, t.args])).toEqual([
      ["M", [1, 2]],
      ["L", [4, 2]],
      ["L", [4, 10]],
      ["L", [4, 6]],
      ["L", [3, 6, 5, 6]],
    ]);
  });

  it("resolves each group of a repeated relative command from where the last one ended", () => {
    const [, curve] = toAbsolute(tokenizePath("M 10 10 q 5 5 10 0 5 -5 10 0"));
    expect(curve).toEqual({ type: "Q", args: [15, 15, 20, 10, 25, 5, 30, 10] });
  });
});
