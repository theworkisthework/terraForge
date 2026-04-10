import { describe, it, expect } from "vitest";
import {
  nearestNeighbourSort,
  joinSubpaths,
  type Subpath,
} from "../../src/workers/gcodeEngine/stages/pathOptimization";

describe("gcode path optimization stage", () => {
  it("orders by nearest startpoint chaining from previous endpoint", () => {
    const a: Subpath = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const b: Subpath = [
      { x: 11, y: 0 },
      { x: 20, y: 0 },
    ];
    const c: Subpath = [
      { x: 60, y: 60 },
      { x: 70, y: 70 },
    ];
    const result = nearestNeighbourSort([c, b, a]);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(b);
    expect(result[2]).toBe(c);
  });

  it("retains completion via fallback when comparison distances are non-finite", () => {
    const a: Subpath = [
      { x: 0, y: 0 },
      { x: Number.NaN, y: 0 },
    ];
    const b: Subpath = [
      { x: 20, y: 20 },
      { x: 25, y: 25 },
    ];
    const c: Subpath = [
      { x: 30, y: 30 },
      { x: 35, y: 35 },
    ];
    const result = nearestNeighbourSort([a, b, c]);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(a);
    expect(result.includes(b)).toBe(true);
    expect(result.includes(c)).toBe(true);
  });

  it("joins only when endpoint gap is within tolerance", () => {
    const result = joinSubpaths(
      [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        [
          { x: 10.1, y: 0 },
          { x: 20, y: 0 },
        ],
        [
          { x: 40, y: 0 },
          { x: 50, y: 0 },
        ],
      ],
      0.2,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(4);
    expect(result[1]).toHaveLength(2);
  });
});