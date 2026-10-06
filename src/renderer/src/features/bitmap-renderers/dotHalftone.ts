import type { BitmapRendererSettings } from "../../../../types";
import { angleField, DEFAULT_ANGLE_DEG, DEFAULT_ORIGIN_PCT, originFields } from "./sharedFields";
import { luminanceAt } from "./toneSpine/sampling";
import type { BitmapRendererDefinition, RendererContext } from "./types";

export const DOT_HALFTONE_RENDERER_ID = "dot-halftone";
const DEFAULT_DOT_SCALE = 1;
const DOT_SEGMENTS = 20;
/** Below this fraction of the cell's max radius a dot is invisible enough to
 * skip outright, rather than emitting a near-zero-radius closed loop. */
const MIN_DOT_FRACTION = 0.05;

export const dotHalftoneDefaults: BitmapRendererSettings = {
  spacingMM: 3,
  dotScale: DEFAULT_DOT_SCALE,
  angleDeg: DEFAULT_ANGLE_DEG,
  originXPct: DEFAULT_ORIGIN_PCT,
  originYPct: DEFAULT_ORIGIN_PCT,
};

function format(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** One dot's closed polyline-circle path, `M...L...Z` only — no arcs, so
 * `bitmapImage.ts` can split a renderer's dots back apart with a plain
 * string operation instead of a full path parser. */
function circlePath(cx: number, cy: number, radius: number): string {
  const points: string[] = [];
  for (let i = 0; i < DOT_SEGMENTS; i++) {
    const theta = (i / DOT_SEGMENTS) * Math.PI * 2;
    const x = cx + radius * Math.cos(theta);
    const y = cy + radius * Math.sin(theta);
    points.push(`${i === 0 ? "M" : "L"}${format(x)} ${format(y)}`);
  }
  return `${points.join(" ")} Z`;
}

/**
 * A rotated, origin-anchored grid of dots, one per cell, radius proportional
 * to the source tone sampled at that cell's centre — classic halftone
 * screening. `angleDeg` is the screen angle; `dotScale` lets 100%-black
 * cells slightly overlap their neighbours (>1) or stay inset (<1), matching
 * how a real halftone screen's dot gain is tuned.
 */
export function generateDotHalftonePath({ source, settings, scale, width, height }: RendererContext): string {
  if (!source || width < 1 || height < 1 || source.values.length === 0) return "";

  const pixelsPerMM = 1 / Math.max(scale, 0.001);
  const spacingMM = Math.max(0.1, Math.min(Number(settings.spacingMM), 20));
  const spacing = Math.max(spacingMM * pixelsPerMM, 0.1);
  const dotScale = Math.max(0.5, Math.min(Number(settings.dotScale ?? DEFAULT_DOT_SCALE), 1.5));
  const maxRadius = (spacing / 2) * dotScale;
  const angleRad = (Number(settings.angleDeg ?? DEFAULT_ANGLE_DEG) * Math.PI) / 180;
  const originX = (Number(settings.originXPct ?? DEFAULT_ORIGIN_PCT) / 100) * source.width;
  const originY = (Number(settings.originYPct ?? DEFAULT_ORIGIN_PCT) / 100) * source.height;

  const u = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
  const v = { x: -Math.sin(angleRad), y: Math.cos(angleRad) };

  const corners = [
    { x: 0, y: 0 },
    { x: source.width, y: 0 },
    { x: 0, y: source.height },
    { x: source.width, y: source.height },
  ];
  const uCoords = corners.map((c) => (c.x - originX) * u.x + (c.y - originY) * u.y);
  const vCoords = corners.map((c) => (c.x - originX) * v.x + (c.y - originY) * v.y);
  const iMin = Math.ceil(Math.min(...uCoords) / spacing);
  const iMax = Math.floor(Math.max(...uCoords) / spacing);
  const jMin = Math.ceil(Math.min(...vCoords) / spacing);
  const jMax = Math.floor(Math.max(...vCoords) / spacing);

  const dots: string[] = [];
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      const cx = originX + i * spacing * u.x + j * spacing * v.x;
      const cy = originY + i * spacing * u.y + j * spacing * v.y;
      const toneDark = 1 - luminanceAt(source, cx, cy) / 255;
      const radius = maxRadius * toneDark;
      if (radius < maxRadius * MIN_DOT_FRACTION) continue;
      dots.push(circlePath(cx, cy, radius));
    }
  }

  return dots.join(" ");
}

export const dotHalftoneRenderer: BitmapRendererDefinition = {
  id: DOT_HALFTONE_RENDERER_ID,
  label: "Dot halftone",
  defaults: dotHalftoneDefaults,
  producesDots: true,
  fields: [
    { type: "number", key: "spacingMM", label: "Cell spacing (mm)", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "dotScale", label: "Dot scale", min: 0.5, max: 1.5, step: 0.05 },
    angleField(),
    ...originFields(),
  ],
  render: generateDotHalftonePath,
};
