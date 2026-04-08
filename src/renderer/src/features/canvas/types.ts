/**
 * Shared types for PlotCanvas feature.
 */

/** Viewport state: zoom level and pan offset */
export interface Vp {
  zoom: number;
  panX: number;
  panY: number;
}

/** Handle positions on a bounding box (8 cardinal + inter-cardinal points) */
export type HandlePos = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";

/** Origin types supported by the canvas */
export type CanvasOrigin =
  | "bottom-left"
  | "top-left"
  | "bottom-right"
  | "top-right"
  | "center";
