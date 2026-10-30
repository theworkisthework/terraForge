/**
 * Geometry shared by the scale and rotate gestures: which way each handle
 * pulls, where an import sits on the canvas, and how a group scales.
 */
import { MM_TO_PX, PAD } from "../constants";
import type { HandlePos } from "../types";
import type { LayerGroup, SvgImport } from "../../../../../types";

/** Which way each handle moves its edges: -1 left/up, 1 right/down, 0 not
 * on that axis. */
export const HANDLE_DIRECTIONS: Record<HandlePos, { x: number; y: number }> = {
  tl: { x: -1, y: -1 },
  t: { x: 0, y: -1 },
  tr: { x: 1, y: -1 },
  r: { x: 1, y: 0 },
  br: { x: 1, y: 1 },
  b: { x: 0, y: 1 },
  bl: { x: -1, y: 1 },
  l: { x: -1, y: 0 },
};

/** The imports a group gesture moves: the selected group's, or all of them. */
export function groupGestureImports(
  imports: SvgImport[],
  layerGroups: LayerGroup[],
  selectedGroupId: string | null,
): SvgImport[] {
  if (!selectedGroupId) return imports;
  return imports.filter((i) => layerGroups.find((g) => g.id === selectedGroupId)?.importIds.includes(i.id));
}

/** An import's centre on the canvas, and its half extents, in canvas pixels. */
export function importCenter(imp: SvgImport, getBedY: (mmY: number) => number) {
  const sX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
  const sY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
  const left = PAD + imp.x * MM_TO_PX;
  const top = getBedY(imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale));
  const hw = (imp.svgWidth * sX) / 2;
  const hh = (imp.svgHeight * sY) / 2;
  return { cxSvg: left + hw, cySvg: top + hh, hw, hh };
}

/** The import position (mm) that puts its centre at (cxSvg, cySvg) at the
 * given scales — the inverse of importCenter. */
export function positionForCenter(
  imp: SvgImport,
  cxSvg: number,
  cySvg: number,
  scaleX: number,
  scaleY: number,
  isBottom: boolean,
  canvasH: number,
): { x: number; y: number } {
  return {
    x: (cxSvg - PAD) / MM_TO_PX - (imp.svgWidth * scaleX) / 2,
    y: isBottom
      ? (canvasH - PAD - cySvg) / MM_TO_PX - (imp.svgHeight * scaleY) / 2
      : (cySvg - PAD) / MM_TO_PX - (imp.svgHeight * scaleY) / 2,
  };
}

/** The axis-aligned extents of imports' rotated outlines on the canvas, with
 * each import's starting scale and centre. */
export function rotatedExtents(imps: SvgImport[], getBedY: (mmY: number) => number) {
  let minWx = Infinity,
    maxWx = -Infinity,
    minWy = Infinity,
    maxWy = -Infinity;
  const items = imps.map((imp) => {
    const { cxSvg, cySvg, hw, hh } = importCenter(imp, getBedY);
    const rad = ((imp.rotation ?? 0) * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    for (const [ox, oy] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as [number, number][]) {
      const wx = cxSvg + ox * cosA - oy * sinA;
      const wy = cySvg + ox * sinA + oy * cosA;
      if (wx < minWx) minWx = wx;
      if (wx > maxWx) maxWx = wx;
      if (wy < minWy) minWy = wy;
      if (wy > maxWy) maxWy = wy;
    }
    return { id: imp.id, startScaleX: imp.scaleX ?? imp.scale, startScaleY: imp.scaleY ?? imp.scale, cxSvg, cySvg };
  });
  return { minWx, maxWx, minWy, maxWy, items };
}

/** The box around imports' rotated outlines, as centre and half extents,
 * with each import's starting scale and centre. */
export function groupBounds(imps: SvgImport[], getBedY: (mmY: number) => number) {
  const { minWx, maxWx, minWy, maxWy, items } = rotatedExtents(imps, getBedY);
  return {
    gCx: (minWx + maxWx) / 2,
    gCy: (minWy + maxWy) / 2,
    gHW: (maxWx - minWx) / 2,
    gHH: (maxWy - minWy) / 2,
    items,
  };
}

/**
 * How a handle drag of (dx, dy) scales a group: one factor along the
 * handle's pull (never below 0.001), applied on the axes it moves, about an
 * anchor — the opposite corner for a corner handle, the centre for an edge.
 */
export function groupScaleFactors(
  handle: HandlePos,
  dx: number,
  dy: number,
  box: { gCx: number; gCy: number; gHW: number; gHH: number },
): { kX: number; kY: number; ax: number; ay: number } {
  const dir = HANDLE_DIRECTIONS[handle];
  const delta = dir.x !== 0 ? dir.x * dx : dir.y * dy;
  const dimPx = dir.x === 0 ? 2 * box.gHH : 2 * box.gHW;
  const k = Math.max(0.001, 1 + delta / dimPx);
  const corner = dir.x !== 0 && dir.y !== 0;
  return {
    kX: dir.x === 0 ? 1 : k,
    kY: dir.y === 0 ? 1 : k,
    ax: corner ? box.gCx - dir.x * box.gHW : box.gCx,
    ay: corner ? box.gCy - dir.y * box.gHH : box.gCy,
  };
}

/** A mouse event's position in canvas coordinates (before the viewport), or
 * null if the canvas container is not mounted. */
export function canvasPoint(
  container: HTMLElement | null,
  vp: { panX: number; panY: number; zoom: number },
  e: { clientX: number; clientY: number },
): { x: number; y: number } | null {
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  return { x: (e.clientX - rect.left - vp.panX) / vp.zoom, y: (e.clientY - rect.top - vp.panY) / vp.zoom };
}
