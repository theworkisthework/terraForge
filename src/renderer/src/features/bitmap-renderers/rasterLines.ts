import type { BitmapRendererSettings } from "../../../../types";
import { renderToneSpine, type SpineStrand } from "./toneSpine/engine";
import { angleField, DEFAULT_ANGLE_DEG, DEFAULT_ORIGIN_PCT, originFields, waveformField } from "./toneSpine/fields";
import { DEFAULT_WAVEFORM, type WaveformId } from "./toneSpine/waveforms";
import type { BitmapRendererDefinition, RendererContext } from "./types";

export const RASTER_LINES_RENDERER_ID = "raster-lines";

export const rasterLinesDefaults: BitmapRendererSettings = {
  spacingMM: 2,
  toothWidthMM: 3,
  amplitudeMM: 1,
  waveform: DEFAULT_WAVEFORM,
  angleDeg: DEFAULT_ANGLE_DEG,
  originXPct: DEFAULT_ORIGIN_PCT,
  originYPct: DEFAULT_ORIGIN_PCT,
};

/**
 * Where an infinite line `base + t * dir` (|dir| = 1) enters and leaves the
 * `[0,width] x [0,height]` rectangle, as a [tMin, tMax] arc-length range, or
 * null if the line misses the rectangle entirely. Liang-Barsky clipping
 * against an unbounded parameter range, so it handles axis-aligned lines
 * (where a naive edge-by-edge division would divide by zero) uniformly.
 */
function clipLineToRect(
  base: { x: number; y: number },
  dir: { x: number; y: number },
  width: number,
  height: number,
): [number, number] | null {
  const bound = 2 * Math.hypot(width, height);
  let t0 = -bound;
  let t1 = bound;
  const edges: [number, number][] = [
    [-dir.x, base.x - 0],
    [dir.x, width - base.x],
    [-dir.y, base.y - 0],
    [dir.y, height - base.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  return t0 > t1 ? null : [t0, t1];
}

function generateLineStrand(
  base: { x: number; y: number },
  dir: { x: number; y: number },
  normal: { x: number; y: number },
  tRange: [number, number],
  targetSegmentLength: number,
): SpineStrand {
  const [tMin, tMax] = tRange;
  const span = tMax - tMin;
  const steps = Math.max(1, Math.ceil(span / Math.max(targetSegmentLength, 0.01)));
  const points: SpineStrand = [];
  for (let i = 0; i <= steps; i++) {
    const t = tMin + (i / steps) * span;
    points.push({ x: base.x + t * dir.x, y: base.y + t * dir.y, nx: normal.x, ny: normal.y });
  }
  return points;
}

/**
 * Parallel lines perpendicular to `angleDeg` (0° = horizontal rows, 90° =
 * vertical columns, anything else = diagonal hatching), spaced evenly and
 * anchored so one line passes exactly through the origin point.
 */
export function generateRasterLinesPath({ source, settings, scale, width, height }: RendererContext): string {
  if (!source || width < 1 || height < 1 || source.values.length === 0) return "";

  const pixelsPerMM = 1 / Math.max(scale, 0.001);
  const spacingMM = Math.max(0.1, Math.min(Number(settings.spacingMM), 20));
  const spacing = Math.max(spacingMM * pixelsPerMM, 0.1);
  const toothWidth = Math.max(0.1, Math.min(Number(settings.toothWidthMM), 20)) * pixelsPerMM;
  const amplitude = Math.max(0, Math.min(Number(settings.amplitudeMM), 10)) * pixelsPerMM;
  const waveform = (settings.waveform as WaveformId) ?? DEFAULT_WAVEFORM;
  const angleRad = (Number(settings.angleDeg ?? DEFAULT_ANGLE_DEG) * Math.PI) / 180;
  const originX = (Number(settings.originXPct ?? DEFAULT_ORIGIN_PCT) / 100) * source.width;
  const originY = (Number(settings.originYPct ?? DEFAULT_ORIGIN_PCT) / 100) * source.height;
  const targetSegmentLength = toothWidth / 4;

  const dir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
  const normal = { x: -Math.sin(angleRad), y: Math.cos(angleRad) };

  const corners = [
    { x: 0, y: 0 },
    { x: source.width, y: 0 },
    { x: 0, y: source.height },
    { x: source.width, y: source.height },
  ];
  const offsets = corners.map((c) => (c.x - originX) * normal.x + (c.y - originY) * normal.y);
  const offsetMin = Math.min(...offsets);
  const offsetMax = Math.max(...offsets);

  const strands: SpineStrand[] = [];
  const firstOffset = Math.ceil(offsetMin / spacing) * spacing;
  for (let offset = firstOffset; offset <= offsetMax; offset += spacing) {
    const base = { x: originX + offset * normal.x, y: originY + offset * normal.y };
    const tRange = clipLineToRect(base, dir, source.width, source.height);
    if (!tRange) continue;
    strands.push(generateLineStrand(base, dir, normal, tRange, targetSegmentLength));
  }

  return renderToneSpine(strands, { toothWidth, amplitude, waveform, image: source });
}

export const rasterLinesRenderer: BitmapRendererDefinition = {
  id: RASTER_LINES_RENDERER_ID,
  label: "Row & diagonal lines",
  defaults: rasterLinesDefaults,
  fields: [
    { type: "number", key: "spacingMM", label: "Line spacing (mm)", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "toothWidthMM", label: "Tooth width (mm)", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "amplitudeMM", label: "Amplitude (mm)", min: 0, max: 10, step: 0.1 },
    waveformField(),
    angleField(),
    ...originFields(),
  ],
  render: generateRasterLinesPath,
};
