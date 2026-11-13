import type { BedMesh, BedMeshPoint } from "./index";

export const MAX_BED_MESH_GRID_POINTS = 32;

/** Returns the bilinearly interpolated Z offset, clamped to the calibrated bed. */
export function isValidBedMesh(mesh: BedMesh | null | undefined): mesh is BedMesh {
  return !!mesh &&
    mesh.version === 1 &&
    typeof mesh.name === "string" &&
    Number.isInteger(mesh.xPoints) &&
    Number.isInteger(mesh.yPoints) &&
    mesh.xPoints >= 2 &&
    mesh.xPoints <= MAX_BED_MESH_GRID_POINTS &&
    mesh.yPoints >= 2 &&
    mesh.yPoints <= MAX_BED_MESH_GRID_POINTS &&
    (mesh.xMinMM === undefined || Number.isFinite(mesh.xMinMM)) &&
    (mesh.yMinMM === undefined || Number.isFinite(mesh.yMinMM)) &&
    Number.isFinite(mesh.widthMM) &&
    Number.isFinite(mesh.heightMM) &&
    mesh.widthMM > 0 &&
    mesh.heightMM > 0 &&
    Array.isArray(mesh.points) &&
    mesh.points.length === mesh.xPoints * mesh.yPoints &&
    mesh.points.every((point) =>
      !!point &&
      Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z));
}

export function createBedMeshInterpolator(
  mesh: BedMesh | null | undefined,
): ((x: number, y: number) => number) | null {
  if (!isValidBedMesh(mesh)) return null;
  const xMin = mesh.xMinMM ?? 0;
  const yMin = mesh.yMinMM ?? 0;
  return (x: number, y: number) => {
    const tx = Math.max(0, Math.min(1, (x - xMin) / mesh.widthMM)) * (mesh.xPoints - 1);
    const ty = Math.max(0, Math.min(1, (y - yMin) / mesh.heightMM)) * (mesh.yPoints - 1);
    const x0 = Math.min(mesh.xPoints - 2, Math.floor(tx));
    const y0 = Math.min(mesh.yPoints - 2, Math.floor(ty));
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const fx = tx - x0;
    const fy = ty - y0;
    const at = (px: number, py: number): BedMeshPoint => mesh.points[py * mesh.xPoints + px];
    const z00 = at(x0, y0).z;
    const z10 = at(x1, y0).z;
    const z01 = at(x0, y1).z;
    const z11 = at(x1, y1).z;
    return z00 * (1 - fx) * (1 - fy) + z10 * fx * (1 - fy) + z01 * (1 - fx) * fy + z11 * fx * fy;
  };
}

export function interpolateBedMesh(mesh: BedMesh, x: number, y: number): number | null {
  return createBedMeshInterpolator(mesh)?.(x, y) ?? null;
}

export function createBedMeshPoints(
  xPoints: number,
  yPoints: number,
  widthMM: number,
  heightMM: number,
  xMinMM = 0,
  yMinMM = 0,
): BedMeshPoint[] {
  if (
    !Number.isInteger(xPoints) || xPoints < 2 || xPoints > MAX_BED_MESH_GRID_POINTS ||
    !Number.isInteger(yPoints) || yPoints < 2 || yPoints > MAX_BED_MESH_GRID_POINTS ||
    !Number.isFinite(widthMM) || widthMM <= 0 ||
    !Number.isFinite(heightMM) || heightMM <= 0 ||
    !Number.isFinite(xMinMM) || !Number.isFinite(yMinMM)
  ) {
    throw new RangeError("Invalid bed mesh dimensions or bounds.");
  }
  return Array.from({ length: yPoints }, (_, row) =>
    Array.from({ length: xPoints }, (_, column) => ({
      x: xMinMM + (column / (xPoints - 1)) * widthMM,
      y: yMinMM + (row / (yPoints - 1)) * heightMM,
      z: 0,
    })),
  ).flat();
}
