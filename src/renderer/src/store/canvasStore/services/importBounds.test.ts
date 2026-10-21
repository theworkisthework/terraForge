import { describe, expect, it } from "vitest";
import type { SvgImport } from "../../../../../types";
import { refitImportToPaths } from "./importBounds";

/** Bed position (mm, y up) of a content point, mirroring ImportLayer's transform. */
function bedPoint(imp: SvgImport, px: number, py: number) {
  const sX = imp.scaleX ?? imp.scale;
  const sY = imp.scaleY ?? imp.scale;
  const vbX = imp.viewBoxX ?? 0;
  const vbY = imp.viewBoxY ?? 0;
  const lx = (px - vbX - imp.svgWidth / 2) * sX;
  const ly = (py - vbY - imp.svgHeight / 2) * sY;
  const rad = ((imp.rotation ?? 0) * Math.PI) / 180;
  const rx = lx * Math.cos(rad) - ly * Math.sin(rad);
  const ry = lx * Math.sin(rad) + ly * Math.cos(rad);
  return {
    x: imp.x + (imp.svgWidth * sX) / 2 + rx,
    y: imp.y + (imp.svgHeight * sY) / 2 - ry,
  };
}

function makeImport(patch: Partial<SvgImport> = {}): SvgImport {
  return {
    id: "imp",
    name: "imp",
    paths: [
      { id: "page", d: "M0 0 H100 V200 H0 Z", svgSource: "", visible: true },
      { id: "art", d: "M60 20 H70 V30 H60 Z", svgSource: "", visible: true },
    ],
    x: 15,
    y: 40,
    scale: 0.5,
    rotation: 0,
    visible: true,
    svgWidth: 100,
    svgHeight: 200,
    viewBoxX: 0,
    viewBoxY: 0,
    ...patch,
  };
}

describe("refitImportToPaths", () => {
  it.each([
    ["unrotated", {}],
    ["rotated", { rotation: 37 }],
    ["rotated 90°", { rotation: 90 }],
    [
      "non-uniformly scaled and rotated",
      { scaleX: 0.3, scaleY: 1.2, rotation: -120 },
    ],
  ])("shrinks to the remaining paths without moving them (%s)", (_, patch) => {
    const imp = makeImport(patch);
    imp.paths = imp.paths.filter((p) => p.id !== "page");
    const corners = [
      [60, 20],
      [70, 30],
    ].map(([x, y]) => bedPoint(imp, x, y));

    refitImportToPaths(imp);

    expect(imp).toMatchObject({
      viewBoxX: 60,
      viewBoxY: 20,
      svgWidth: 10,
      svgHeight: 10,
    });
    [
      [60, 20],
      [70, 30],
    ].forEach(([x, y], i) => {
      const after = bedPoint(imp, x, y);
      expect(after.x).toBeCloseTo(corners[i].x, 9);
      expect(after.y).toBeCloseTo(corners[i].y, 9);
    });
  });

  it("puts the bottom-left of the remaining art at the unrotated origin", () => {
    // Content y runs down, so the art's bottom edge (y=30) is 170 units above
    // the page's bottom edge (y=200).
    const imp = makeImport();
    imp.paths = imp.paths.filter((p) => p.id !== "page");

    refitImportToPaths(imp);

    expect(imp.x).toBeCloseTo(15 + 60 * 0.5, 9);
    expect(imp.y).toBeCloseTo(40 + 170 * 0.5, 9);
  });

  it("leaves the import alone when no paths remain", () => {
    const imp = makeImport({ paths: [] });
    const before = { ...imp };

    refitImportToPaths(imp);

    expect(imp).toEqual(before);
  });
});
