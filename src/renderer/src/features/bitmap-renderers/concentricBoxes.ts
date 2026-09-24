import type { BitmapRendererSettings } from "../../../../types";
import { renderToneSpine, type SpineStrand } from "./toneSpine/engine";
import { angleField, DEFAULT_ANGLE_DEG, DEFAULT_ORIGIN_PCT, originFields, waveformField } from "./toneSpine/fields";
import { DEFAULT_WAVEFORM, type WaveformId } from "./toneSpine/waveforms";
import type { BitmapRendererDefinition, RendererContext } from "./types";

export const CONCENTRIC_BOXES_RENDERER_ID = "concentric-boxes";

export const concentricBoxesDefaults: BitmapRendererSettings = {
  spacingMM: 4,
  toothWidthMM: 6,
  amplitudeMM: 1.5,
  waveform: DEFAULT_WAVEFORM,
  angleDeg: DEFAULT_ANGLE_DEG,
  originXPct: DEFAULT_ORIGIN_PCT,
  originYPct: DEFAULT_ORIGIN_PCT,
};

function rotate(x: number, y: number, angleRad: number): { x: number; y: number } {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/**
 * One closed box's base points. Edges are local axis-aligned before rotation
 * (bottom/right/top/left, in that winding order), each with its own outward
 * normal — unlike a circle a box's normal is discontinuous at the corners,
 * which is expected: the waveform displaces perpendicular to whichever edge
 * a point falls on, same as any hard-corner engraving pattern.
 */
function generateBoxStrand(
  centreX: number,
  centreY: number,
  halfWidth: number,
  halfHeight: number,
  angleRad: number,
  targetSegmentLength: number,
): SpineStrand {
  const edges: { from: [number, number]; to: [number, number]; normal: [number, number] }[] = [
    { from: [-halfWidth, -halfHeight], to: [halfWidth, -halfHeight], normal: [0, -1] },
    { from: [halfWidth, -halfHeight], to: [halfWidth, halfHeight], normal: [1, 0] },
    { from: [halfWidth, halfHeight], to: [-halfWidth, halfHeight], normal: [0, 1] },
    { from: [-halfWidth, halfHeight], to: [-halfWidth, -halfHeight], normal: [-1, 0] },
  ];

  const points: SpineStrand = [];
  for (const edge of edges) {
    const [fx, fy] = edge.from;
    const [tx, ty] = edge.to;
    const length = Math.hypot(tx - fx, ty - fy);
    const steps = Math.max(1, Math.ceil(length / Math.max(targetSegmentLength, 0.01)));
    const normal = rotate(edge.normal[0], edge.normal[1], angleRad);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const local = rotate(fx + t * (tx - fx), fy + t * (ty - fy), angleRad);
      points.push({ x: centreX + local.x, y: centreY + local.y, nx: normal.x, ny: normal.y });
    }
  }
  if (points.length > 0) points.push({ ...points[0] });
  return points;
}

/**
 * Concentric rectangles, aspect-matched to the image and rotated by
 * `angleDeg` around the origin, spaced evenly outward until they cover the
 * farthest image corner — each box its own strand.
 */
export function generateConcentricBoxesPath({ source, settings, scale, width, height }: RendererContext): string {
  if (!source || width < 1 || height < 1 || source.values.length === 0) return "";

  const pixelsPerMM = 1 / Math.max(scale, 0.001);
  const spacingMM = Math.max(0.1, Math.min(Number(settings.spacingMM), 20));
  const spacing = Math.max(spacingMM * pixelsPerMM, 0.1);
  const toothWidth = Math.max(0.1, Math.min(Number(settings.toothWidthMM), 20)) * pixelsPerMM;
  const amplitude = Math.max(0, Math.min(Number(settings.amplitudeMM), 10)) * pixelsPerMM;
  const waveform = (settings.waveform as WaveformId) ?? DEFAULT_WAVEFORM;
  const angleRad = (Number(settings.angleDeg ?? DEFAULT_ANGLE_DEG) * Math.PI) / 180;
  const centreX = (Number(settings.originXPct ?? DEFAULT_ORIGIN_PCT) / 100) * source.width;
  const centreY = (Number(settings.originYPct ?? DEFAULT_ORIGIN_PCT) / 100) * source.height;
  const targetSegmentLength = toothWidth / 4;

  const maxRadius = Math.max(
    Math.hypot(centreX, centreY),
    Math.hypot(source.width - centreX, centreY),
    Math.hypot(centreX, source.height - centreY),
    Math.hypot(source.width - centreX, source.height - centreY),
  );
  const aspect = source.height / source.width;

  const strands: SpineStrand[] = [];
  for (let k = 1; ; k++) {
    const halfWidth = k * spacing;
    const halfHeight = k * spacing * aspect;
    if (Math.hypot(halfWidth, halfHeight) > maxRadius) break;
    strands.push(generateBoxStrand(centreX, centreY, halfWidth, halfHeight, angleRad, targetSegmentLength));
  }

  return renderToneSpine(strands, { toothWidth, amplitude, waveform, image: source });
}

export const concentricBoxesRenderer: BitmapRendererDefinition = {
  id: CONCENTRIC_BOXES_RENDERER_ID,
  label: "Concentric boxes",
  defaults: concentricBoxesDefaults,
  fields: [
    { type: "number", key: "spacingMM", label: "Box spacing (mm)", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "toothWidthMM", label: "Tooth width (mm)", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "amplitudeMM", label: "Amplitude (mm)", min: 0, max: 10, step: 0.1 },
    waveformField(),
    angleField(),
    ...originFields(),
  ],
  render: generateConcentricBoxesPath,
};
