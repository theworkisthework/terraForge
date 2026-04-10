/**
 * Canvas constants and magic numbers for PlotCanvas rendering and interaction.
 */

// Coordinate transformation
export const MM_TO_PX = 3; // internal SVG scale: 3 px per mm
export const PAD = 30; // margin around bed in SVG pixels

// Viewport zoom
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 20;
export const ZOOM_STEP = 1.25; // per keyboard / button press

// Ruler overlay (screen space)
export const RULER_W = 20; // ruler strip width in screen pixels
export const FONT = 11; // ruler text font size
export const BG = "#0d0d0d"; // ruler strip background
export const TICK_COL = "#444444"; // ruler tick/line color
export const ORIGIN_COL = "#22c55e"; // origin marker color
export const LABEL_COL = "#888888"; // ruler label text color

// Handle (resize/rotate) overlay
export const HANDLE_SCREEN_R = 5; // handle circle radius in screen pixels
export const DEL_OFFSET_PX = 12; // delete button offset from top-right corner (screen px)
export const DEL_HALF_PX = 8; // delete button half-size (screen px, so 16×16 total)

// Lucide rotate-cw cursor shown on the rotation handle and while rotating.
// White stroke, 24×24, encoded as an SVG data URL.
// Hotspot centred at (12, 12); fallback to ew-resize for browsers that don't support custom cursors.
export const ROTATE_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E" +
  "%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'/%3E" +
  "%3Cpath d='M21 3v5h-5'/%3E" +
  '%3C/svg%3E") 12 12, ew-resize';

// LOD (level-of-detail) threshold for toolpath rendering
export const LOD_PX = 0.4; // minimum segment screen-length (CSS px) below which a segment is skipped
