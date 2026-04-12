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

  it("guards non-finite cubic inputs without throwing", () => {
    const pts = cubicBezier(0, 0, Number.NaN, 5, 10, 10, 20, 20);
    expect(pts).toEqual([{ x: 20, y: 20 }]);
  });

  it("applies viewBox origin offsets before mapping to machine space", () => {
    const obj = createVectorObject({
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      originalWidth: 100,
      originalHeight: 100,
      viewBoxX: 200,
      viewBoxY: 300,
    });
    const cfg = createMachineConfig({
      origin: "top-left",
      bedWidth: 400,
      bedHeight: 400,
    });

    const pt = transformPt(obj, cfg, 210, 320);
    expect(pt.x).toBeCloseTo(10);
    expect(pt.y).toBeCloseTo(20);
  });
});
