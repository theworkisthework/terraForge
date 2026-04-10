import { describe, it, expect } from "vitest";
import {
  transformPt,
  cubicBezier,
  arcToBeziers,
} from "../../src/workers/gcodeEngine/stages/geometryFlattening";
import { createVectorObject, createMachineConfig } from "../helpers/factories";

describe("gcode geometry/flattening stage", () => {
  it("maps points with origin + rotation semantics unchanged", () => {
    const obj = createVectorObject({
      x: 0,
      y: 0,
      scale: 1,
      rotation: 90,
      originalWidth: 100,
      originalHeight: 100,
    });
    const cfg = createMachineConfig({
      origin: "top-left",
      bedWidth: 400,
      bedHeight: 400,
    });

    const pt = transformPt(obj, cfg, 10, 0);
    expect(pt.x).toBeCloseTo(100);
    expect(pt.y).toBeCloseTo(10);
  });

  it("keeps cubic flattening endpoint exact", () => {
    const pts = cubicBezier(0, 0, 10, 20, 30, 40, 50, 60);
    expect(pts[pts.length - 1]).toEqual({ x: 50, y: 60 });
  });

  it("flattens degenerate arcs to endpoint semantics", () => {
    const pts = arcToBeziers(0, 0, 0, 0, 0, 0, 1, 10, 10);
    expect(pts).toEqual([{ x: 10, y: 10 }]);
  });
});
