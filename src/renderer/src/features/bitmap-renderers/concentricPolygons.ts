import type { BitmapRendererSettings } from "../../../../types";
import { renderToneSpine, type SpineStrand } from "./toneSpine/engine";
import { angleField, DEFAULT_ANGLE_DEG, DEFAULT_ORIGIN_PCT, originFields, waveformField } from "./toneSpine/fields";
import { DEFAULT_WAVEFORM, type WaveformId } from "./toneSpine/waveforms";
import type { BitmapRendererDefinition, RendererContext } from "./types";

export const CONCENTRIC_POLYGONS_RENDERER_ID = "concentric-polygons";
const DEFAULT_SIDES = 6;

export const concentricPolygonsDefaults: BitmapRendererSettings = {
  spacingMM: 4,
  toothWidthMM: 6,
  amplitudeMM: 1.5,
  sides: DEFAULT_SIDES,
  waveform: DEFAULT_WAVEFORM,
  angleDeg: DEFAULT_ANGLE_DEG,
  originXPct: DEFAULT_ORIGIN_PCT,
  originYPct: DEFAULT_ORIGIN_PCT,
};

/**
 * One closed regular polygon's base points, circumradius `radius`, centred
 * at the origin. Each edge's outward normal is the direction from the centre
 * to that edge's midpoint — exact for a regular polygon, and the natural
 * generalization of a circle's radial normal to straight edges.
 */
function generatePolygonStrand(
  centreX: number,
  centreY: number,
  radius: number,
  sides: number,
  angleRad: number,
  targetSegmentLength: number,
): SpineStrand {
  const vertices = Array.from({ length: sides }, (_, i) => {
    const theta = angleRad + (i / sides) * Math.PI * 2;
    return { x: radius * Math.cos(theta), y: radius * Math.sin(theta) };
  });

  const points: SpineStrand = [];
  for (let i = 0; i < sides; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % sides];
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const midLength = Math.hypot(midX, midY) || 1;
    const normal = { x: midX / midLength, y: midY / midLength };
    const edgeLength = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(edgeLength / Math.max(targetSegmentLength, 0.01)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      points.push({
        x: centreX + a.x + t * (b.x - a.x),
        y: centreY + a.y + t * (b.y - a.y),
        nx: normal.x,
        ny: normal.y,
      });
    }
  }
  if (points.length > 0) points.push({ ...points[0] });
  return points;
}

/**
 * Concentric regular polygons (triangle up to 12-gon) spaced evenly outward
 * from the origin by circumradius, out to the far image corner — each
 * polygon its own strand. `angleDeg` rotates every polygon's vertex phase.
 */
export function generateConcentricPolygonsPath({ source, settings, scale, width, height }: RendererContext): string {
  if (!source || width < 1 || height < 1 || source.values.length === 0) return "";

  const pixelsPerMM = 1 / Math.max(scale, 0.001);
  const spacingMM = Math.max(0.1, Math.min(Number(settings.spacingMM), 20));
  const spacing = Math.max(spacingMM * pixelsPerMM, 0.1);
  const toothWidth = Math.max(0.1, Math.min(Number(settings.toothWidthMM), 20)) * pixelsPerMM;
  const amplitude = Math.max(0, Math.min(Number(settings.amplitudeMM), 10)) * pixelsPerMM;
  const sides = Math.round(Math.max(3, Math.min(Number(settings.sides ?? DEFAULT_SIDES), 12)));
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

  const strands: SpineStrand[] = [];
  for (let radius = spacing; radius <= maxRadius; radius += spacing) {
    strands.push(generatePolygonStrand(centreX, centreY, radius, sides, angleRad, targetSegmentLength));
  }

  return renderToneSpine(strands, { toothWidth, amplitude, waveform, image: source });
}

export const concentricPolygonsRenderer: BitmapRendererDefinition = {
  id: CONCENTRIC_POLYGONS_RENDERER_ID,
  label: "Concentric polygons",
  defaults: concentricPolygonsDefaults,
  fields: [
    { type: "number", key: "spacingMM", label: "Ring spacing (mm)", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "toothWidthMM", label: "Tooth width (mm)", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "amplitudeMM", label: "Amplitude (mm)", min: 0, max: 10, step: 0.1 },
    { type: "number", key: "sides", label: "Sides", min: 3, max: 12, step: 1 },
    waveformField(),
    angleField(),
    ...originFields(),
  ],
  render: generateConcentricPolygonsPath,
};
