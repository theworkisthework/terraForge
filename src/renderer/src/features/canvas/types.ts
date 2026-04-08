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

// ── Gesture state types ───────────────────────────────────────────────────────

export interface DraggingState {
  id: string;
  startMouseX: number;
  startMouseY: number;
  startObjX: number;
  startObjY: number;
  /** Non-null when dragging all selected imports as a group. */
  group?: { id: string; startX: number; startY: number }[];
}

export interface ScalingState {
  id: string;
  handle: HandlePos;
  startMouseX: number;
  startMouseY: number;
  startScale: number;
  startScaleX: number;
  startScaleY: number;
  ratioLocked: boolean;
  startObjX: number;
  startObjY: number;
  startW: number;
  startH: number;
}

export interface RotatingState {
  id: string;
  cx: number;
  cy: number;
  startAngle: number;
  startRotation: number;
}

export interface GroupScalingItem {
  id: string;
  startScaleX: number;
  startScaleY: number;
  cxSvg: number;
  cySvg: number;
}

export interface GroupScalingState {
  handle: HandlePos;
  startMouseX: number;
  startMouseY: number;
  gCx: number;
  gCy: number;
  gHW: number;
  gHH: number;
  items: GroupScalingItem[];
}

export interface GroupRotatingItem {
  id: string;
  cxSvg: number;
  cySvg: number;
  startX: number;
  startY: number;
  startRotation: number;
}

export interface GroupRotatingState {
  gCx: number;
  gCy: number;
  gHW: number;
  gHH: number;
  startAngle: number;
  baseOBBAngle: number;
  items: GroupRotatingItem[];
}

export interface PersistentGroupOBB {
  gCx: number;
  gCy: number;
  gHW: number;
  gHH: number;
  angle: number;
}
