import { describe, expect, it } from "vitest";
import { interpolateBedMesh, isValidBedMesh } from "../../src/types/bedMesh";
import type { BedMesh } from "../../src/types";

const mesh: BedMesh = {
  version: 1,
  name: "test",
  xPoints: 2,
  yPoints: 2,
  widthMM: 10,
  heightMM: 10,
  createdAt: "",
  points: [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 2 },
    { x: 0, y: 10, z: 4 },
    { x: 10, y: 10, z: 6 },
  ],
};

describe("interpolateBedMesh", () => {
  it("bilinearly interpolates between four calibration points", () => {
    expect(interpolateBedMesh(mesh, 5, 5)).toBe(3);
  });

  it("clamps coordinates outside the calibrated bed", () => {
    expect(interpolateBedMesh(mesh, -5, 20)).toBe(4);
  });

  it("returns the exact value at the maximum boundary", () => {
    expect(interpolateBedMesh(mesh, 10, 10)).toBe(6);
  });

  it("rejects invalid dimensions and point counts", () => {
    expect(isValidBedMesh({ ...mesh, widthMM: 0 })).toBe(false);
    expect(interpolateBedMesh({ ...mesh, widthMM: 0 }, 5, 5)).toBeNull();
    expect(interpolateBedMesh({ ...mesh, points: mesh.points.slice(0, 3) }, 5, 5)).toBeNull();
  });

  it("rejects non-finite point values", () => {
    expect(isValidBedMesh({
      ...mesh,
      points: [{ ...mesh.points[0], z: Number.NaN }, ...mesh.points.slice(1)],
    })).toBe(false);
  });
});
