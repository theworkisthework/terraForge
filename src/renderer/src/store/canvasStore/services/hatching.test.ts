import { describe, it, expect } from "vitest";
import {
  applyImportHatch,
  getEffectiveImportScale,
  regenerateImportHatching,
} from "./hatching";
import type { SvgImport } from "../../../../../types";

function makeImport(overrides?: Partial<SvgImport>): SvgImport {
  return {
    id: "imp-1",
    name: "imp",
    paths: [
      {
        id: "p1",
        d: "M 0 0 L 10 0 L 10 10 L 0 10 Z",
        svgSource: "<path/>",
        visible: true,
        hasFill: true,
      },
      {
        id: "p2",
        d: "M 0 0 L 10 10",
        svgSource: "<path/>",
        visible: true,
        hasFill: false,
        hatchLines: ["M0,0 L1,1"],
      },
    ],
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    visible: true,
    svgWidth: 100,
    svgHeight: 100,
    viewBoxX: 0,
    viewBoxY: 0,
    hatchEnabled: true,
    hatchSpacingMM: 2,
    hatchAngleDeg: 0,
    ...overrides,
  };
}

describe("canvasStore hatching service", () => {
  it("computes geometric mean for non-uniform scale", () => {
    const imp = makeImport({ scaleX: 0.5, scaleY: 2, scale: 1 });
    expect(getEffectiveImportScale(imp)).toBe(1);
  });

  it("regenerateImportHatching creates hatch lines for filled paths only", () => {
    const imp = makeImport();
    regenerateImportHatching(imp);

    expect(imp.paths[0].hatchLines).toBeDefined();
    expect(imp.paths[0].hatchLines!.length).toBeGreaterThan(0);
    expect(imp.paths[1].hatchLines).toBeUndefined();
  });

  it("regenerateImportHatching is a no-op when hatch is disabled", () => {
    const imp = makeImport({ hatchEnabled: false });
    const before = structuredClone(imp.paths);

    regenerateImportHatching(imp);

    expect(imp.paths).toEqual(before);
  });

  it("applyImportHatch sanitizes invalid spacing/angle values", () => {
    const imp = makeImport({ hatchSpacingMM: 3, hatchAngleDeg: 45 });

    applyImportHatch(imp, NaN, Infinity, true);

    expect(imp.hatchSpacingMM).toBe(3);
    expect(imp.hatchAngleDeg).toBe(45);
  });

  it("applyImportHatch clears all hatch lines when disabled", () => {
    const imp = makeImport();
    imp.paths[0].hatchLines = ["M0,1 L10,1"];

    applyImportHatch(imp, 2, 0, false);

    expect(imp.hatchEnabled).toBe(false);
    expect(imp.paths[0].hatchLines).toBeUndefined();
    expect(imp.paths[1].hatchLines).toBeUndefined();
  });
});
