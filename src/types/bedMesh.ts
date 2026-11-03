import type { BedMesh, BedMeshPoint } from "./index";

/** Returns the bilinearly interpolated Z offset, clamped to the calibrated bed. */
export function interpolateBedMesh(mesh: BedMesh, x: number, y: number): number {
  if (mesh.xPoints < 2 || mesh.yPoints < 2 || mesh.points.length !== mesh.xPoints * mesh.yPoints) return 0;
  const tx = Math.max(0, Math.min(1, x / Math.max(mesh.widthMM, Number.EPSILON))) * (mesh.xPoints - 1);
  const ty = Math.max(0, Math.min(1, y / Math.max(mesh.heightMM, Number.EPSILON))) * (mesh.yPoints - 1);
  const x0 = Math.min(mesh.xPoints - 2, Math.floor(tx));
  const y0 = Math.min(mesh.yPoints - 2, Math.floor(ty));
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = tx - x0;
  const fy = ty - y0;
  const at = (px: number, py: number): BedMeshPoint =>
    mesh.points[py * mesh.xPoints + px] ?? { x: 0, y: 0, z: 0 };
  const z00 = at(x0, y0).z;
  const z10 = at(x1, y0).z;
  const z01 = at(x0, y1).z;
  const z11 = at(x1, y1).z;
  return z00 * (1 - fx) * (1 - fy) + z10 * fx * (1 - fy) + z01 * (1 - fx) * fy + z11 * fx * fy;
}

export function createBedMeshPoints(
  xPoints: number,
  yPoints: number,
  widthMM: number,
  heightMM: number,
): BedMeshPoint[] {
  return Array.from({ length: yPoints }, (_, row) =>
    Array.from({ length: xPoints }, (_, column) => ({
      x: xPoints === 1 ? 0 : (column / (xPoints - 1)) * widthMM,
      y: yPoints === 1 ? 0 : (row / (yPoints - 1)) * heightMM,
      z: 0,
    })),
  ).flat();
}
