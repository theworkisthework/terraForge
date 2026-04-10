/**
 * Coordinate transformation utilities for PlotCanvas.
 * Handles conversion between machine-mm, SVG canvas pixels, and screen pixels,
 * all respecting the current viewport (zoom + pan) and origin configuration.
 */

import { MM_TO_PX, PAD } from "../constants";
import type { Vp, CanvasOrigin } from "../types";

/**
 * Convert machine millimeters to SVG canvas pixels, accounting for origin type.
 *
 * @param mm Machine coordinate in millimeters
 * @param axis "x" or "y"
 * @param origin Origin type (bottom-left, top-left, bottom-right, top-right, center)
 * @param bedW Bed width in mm
 * @param bedH Bed height in mm
 */
export function mmToSvg(
  mm: number,
  axis: "x" | "y",
  origin: CanvasOrigin,
  bedW: number,
  bedH: number,
): number {
  const isCenter = origin === "center";
  const isRight = origin === "bottom-right" || origin === "top-right";
  const isBottom = origin === "bottom-left" || origin === "bottom-right";

  if (axis === "x") {
    if (isCenter) return PAD + (bedW / 2 + mm) * MM_TO_PX;
    if (isRight) return PAD + (bedW - mm) * MM_TO_PX;
    return PAD + mm * MM_TO_PX;
  } else {
    // axis === "y"
    if (isCenter) return PAD + (bedH / 2 - mm) * MM_TO_PX;
    if (isBottom) return PAD + (bedH - mm) * MM_TO_PX;
    return PAD + mm * MM_TO_PX;
  }
}

/**
 * Convert SVG canvas pixels to machine millimeters, accounting for origin type.
 *
 * @param px Canvas pixel coordinate
 * @param axis "x" or "y"
 * @param origin Origin type
 * @param bedW Bed width in mm
 * @param bedH Bed height in mm
 */
export function svgToMm(
  px: number,
  axis: "x" | "y",
  origin: CanvasOrigin,
  bedW: number,
  bedH: number,
): number {
  const isCenter = origin === "center";
  const isRight = origin === "bottom-right" || origin === "top-right";
  const isBottom = origin === "bottom-left" || origin === "bottom-right";

  const raw = (px - PAD) / MM_TO_PX;

  if (axis === "x") {
    if (isCenter) return raw - bedW / 2;
    if (isRight) return bedW - raw;
    return raw;
  } else {
    // axis === "y"
    if (isCenter) return bedH / 2 - raw;
    if (isBottom) return bedH - raw;
    return raw;
  }
}

/**
 * Convert SVG canvas pixels to screen (CSS) pixels using viewport transform.
 *
 * @param x Canvas X in SVG pixels
 * @param y Canvas Y in SVG pixels
 * @param vp Viewport state
 */
export function svgToScreen(x: number, y: number, vp: Vp): [number, number] {
  return [x * vp.zoom + vp.panX, y * vp.zoom + vp.panY];
}

/**
 * Convert screen (CSS) pixels to SVG canvas pixels using viewport transform.
 *
 * @param sx Screen X in CSS pixels
 * @param sy Screen Y in CSS pixels
 * @param vp Viewport state
 */
export function screenToSvg(sx: number, sy: number, vp: Vp): [number, number] {
  return [(sx - vp.panX) / vp.zoom, (sy - vp.panY) / vp.zoom];
}

/**
 * Convert machine millimeters directly to screen pixels (combined transform).
 *
 * @param mm Machine coordinate in millimeters
 * @param axis "x" or "y"
 * @param origin Origin type
 * @param bedW Bed width in mm
 * @param bedH Bed height in mm
 * @param vp Viewport state
 */
export function mmToScreen(
  mm: number,
  axis: "x" | "y",
  origin: CanvasOrigin,
  bedW: number,
  bedH: number,
  vp: Vp,
): number {
  const svgPx = mmToSvg(mm, axis, origin, bedW, bedH);
  const screenPx =
    axis === "x" ? svgToScreen(svgPx, 0, vp)[0] : svgToScreen(0, svgPx, vp)[1];
  return screenPx;
}
