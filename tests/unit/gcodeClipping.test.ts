import { describe, it, expect } from "vitest";
import {
  clipSubpathsToRect,
  clipSubpathsToBed,
  type Subpath,
} from "../../src/workers/gcodeEngine/stages/clipping";
import { createMachineConfig } from "../helpers/factories";

describe("gcode clipping stage", () => {
  it("clips line entry and exit points against explicit rectangle", () => {
    const subpaths: Subpath[] = [
      [
        { x: -50, y: 50 },
        { x: 150, y: 50 },
      ],
    ];
    const result = clipSubpathsToRect(subpaths, 0, 100, 0, 100);
    expect(result).toHaveLength(1);
    expect(result[0][0].x).toBeCloseTo(0);
    expect(result[0][result[0].length - 1].x).toBeCloseTo(100);
  });

  it("drops fully outside segments", () => {
    const subpaths: Subpath[] = [
      [
        { x: 150, y: 150 },
        { x: 200, y: 200 },
      ],
    ];
    expect(clipSubpathsToRect(subpaths, 0, 100, 0, 100)).toEqual([]);
  });

  it("uses center-origin bed bounds when clipping", () => {
    const cfg = createMachineConfig({
      origin: "center",
      bedWidth: 100,
      bedHeight: 100,
    });
    const subpaths: Subpath[] = [
      [
        { x: -30, y: -30 },
        { x: 30, y: 30 },
      ],
    ];
    const result = clipSubpathsToBed(subpaths, cfg);
    expect(result).toHaveLength(1);
    expect(result[0][0].x).toBeCloseTo(-30);
    expect(result[0][result[0].length - 1].x).toBeCloseTo(30);
  });
});
