/**
 * Geometry utilities for PlotCanvas.
 * Handles bounding box calculations, OBB (oriented bounding box) transformations,
 * handle positioning, and color scaling.
 */

import { MM_TO_PX, PAD, MIN_ZOOM, MAX_ZOOM } from "../constants";
import type { Vp, HandlePos, CanvasOrigin } from "../types";
import type { SvgImport } from "@types/index";
import type { SvgImport } from "@types/index";

/**
 * Calculate a zoom level and pan offset to fit the bed within a container,
 * with small padding around the edges.
 *
 * @param containerW Container width in CSS pixels
 * @param containerH Container height in CSS pixels
 * @param canvasW Bed canvas width in SVG pixels (bedW * MM_TO_PX + PAD * 2)
 * @param canvasH Bed canvas height in SVG pixels (bedH * MM_TO_PX + PAD * 2)
 * @returns Viewport state { zoom, panX, panY }
 */
export function computeFit(
  containerW: number,
  containerH: number,
  canvasW: number,
  canvasH: number,
): Vp {
  const pad = 8;
  const zoom = Math.max(
    MIN_ZOOM,
    Math.min(
      (containerW - pad * 2) / canvasW,
      (containerH - pad * 2) / canvasH,
    ),
  );
  return {
    zoom,
    panX: (containerW - canvasW * zoom) / 2,
    panY: (containerH - canvasH * zoom) / 2,
  };
}

/**
 * Rotate a point (offset from origin) by a given angle in degrees.
 *
 * @param ox Offset X
 * @param oy Offset Y
 * @param angleDeg Angle in degrees
 * @returns [rotatedX, rotatedY]
 */
export function rotatePoint(
  ox: number,
  oy: number,
  angleDeg: number,
): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [ox * cos - oy * sin, ox * sin + oy * cos];
}

/**
 * Compute axis-aligned bounding box (AABB) for a list of imports in SVG pixels.
 *
 * @param imports Array of SvgImport objects
 * @param getBedY Callback to compute SVG Y from mm (handles origin/flip)
 * @returns { minX, maxX, minY, maxY } in SVG pixels, or null if no imports
 */
export function computeBoundingBox(
  imports: SvgImport[],
  getBedY: (mm: number) => number,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (imports.length === 0) return null;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  for (const imp of imports) {
    const sX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
    const sY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
    const left = PAD + imp.x * MM_TO_PX;
    const top = getBedY(imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale));
    const bboxW = imp.svgWidth * sX;
    const bboxH = imp.svgHeight * sY;

    const rot = imp.rotation ?? 0;
    if (rot === 0) {
      // AABB (no rotation)
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, left + bboxW);
      minY = Math.min(minY, top);
      maxY = Math.max(maxY, top + bboxH);
    } else {
      // Rotated: check all 4 corners
      const cx = left + bboxW / 2;
      const cy = top + bboxH / 2;
      const hw = bboxW / 2;
      const hh = bboxH / 2;

      const corners: [number, number][] = [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ];

      for (const [ox, oy] of corners) {
        const [rx, ry] = rotatePoint(ox, oy, rot);
        const px = cx + rx;
        const py = cy + ry;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
    }
  }

  return { minX, maxX, minY, maxY };
}

/**
 * Compute oriented bounding box (OBB) for a list of imports with accumulated rotation.
 * Returns the OBB geometry (center, half-extents, angle) that can be used to
 * render a rotated rectangle or compute handle positions.
 *
 * @param imports Array of SvgImport objects
 * @param totalAngleDeg Total accumulated rotation angle in degrees
 * @param getBedY Callback to compute SVG Y from mm
 * @returns { cx, cy, hw, hh, angle } or null if no imports
 */
export function computeOBB(
  imports: SvgImport[],
  totalAngleDeg: number,
  getBedY: (mm: number) => number,
): { cx: number; cy: number; hw: number; hh: number; angle: number } | null {
  const aabb = computeBoundingBox(imports, getBedY);
  if (!aabb) return null;

  const cx = (aabb.minX + aabb.maxX) / 2;
  const cy = (aabb.minY + aabb.maxY) / 2;
  const hw = (aabb.maxX - aabb.minX) / 2;
  const hh = (aabb.maxY - aabb.minY) / 2;

  return { cx, cy, hw, hh, angle: totalAngleDeg };
}

/**
 * Compute screen-space positions of 8 resize handles around an AABB or OBB.
 * Handles are placed at cardinal (N, S, E, W) and inter-cardinal (NE, SE, SW, NW) positions.
 *
 * @param cx AABB/OBB center X in SVG pixels
 * @param cy AABB/OBB center Y in SVG pixels
 * @param hw AABB/OBB half-width in SVG pixels
 * @param hh AABB/OBB half-height in SVG pixels
 * @param angleDeg Rotation angle in degrees (0 for AABB, non-zero for OBB)
 * @param zoom Viewport zoom
 * @param panX Viewport pan X
 * @param panY Viewport pan Y
 * @returns Array of [handleId, screenX, screenY] tuples
 */
export function handleBoundsForBox(
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  angleDeg: number,
  zoom: number,
  panX: number,
  panY: number,
): Array<[HandlePos, number, number]> {
  // Offsets in local (unrotated) frame
  const offsets: Record<HandlePos, [number, number]> = {
    tl: [-hw, -hh],
    t: [0, -hh],
    tr: [hw, -hh],
    r: [hw, 0],
    br: [hw, hh],
    b: [0, hh],
    bl: [-hw, hh],
    l: [-hw, 0],
  };

  const positions: Array<[HandlePos, number, number]> = [];
  for (const [id, [ox, oy]] of Object.entries(offsets) as Array<
    [HandlePos, [number, number]]
  >) {
    // Rotate offset to world frame
    const [wx, wy] = rotatePoint(ox, oy, angleDeg);
    // Translate to world position
    const worldX = cx + wx;
    const worldY = cy + wy;
    // Transform to screen coordinates
    const sx = worldX * zoom + panX;
    const sy = worldY * zoom + panY;
    positions.push([id, sx, sy]);
  }

  return positions;
}

/**
 * Scale each RGB channel of a CSS hex color by a factor, clamped to 0-255.
 * Useful for darkening (factor < 1) or brightening (factor > 1) colors.
 *
 * @param hex Hex color string (e.g. "#3a6aaa")
 * @param factor Scaling factor
 * @returns Scaled hex color string
 */
export function scaleHexColor(hex: string, factor: number): string {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * factor));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * factor));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toLowerCase();
}
