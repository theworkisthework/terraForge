import type { BitmapRendererSettings } from "../../../../types";
import { renderToneSpine, type SpineStrand } from "./toneSpine/engine";
import { angleField, DEFAULT_ANGLE_DEG, DEFAULT_ORIGIN_PCT, originFields, waveformField } from "./toneSpine/fields";
import { DEFAULT_WAVEFORM, type WaveformId } from "./toneSpine/waveforms";
import type { BitmapRendererDefinition, RendererContext } from "./types";

export const CIRCULAR_RINGS_RENDERER_ID = "circular-rings";

export const circularRingsDefaults: BitmapRendererSettings = {
  spacingMM: 4,
  toothWidthMM: 6,
  amplitudeMM: 1.5,
  waveform: DEFAULT_WAVEFORM,
  angleDeg: DEFAULT_ANGLE_DEG,
  originXPct: DEFAULT_ORIGIN_PCT,
  originYPct: DEFAULT_ORIGIN_PCT,
};

/**
 * One closed ring's base points, radial-outward normal. `angleRad` rotates
 * where each ring's tooth pattern starts — a ring has no inherent "start" the
 * way a spiral's radial growth does, so this is the natural stand-in.
 */
function generateRingStrand(
  centreX: number,
  centreY: number,
  radius: number,
  angleRad: number,
  targetSegmentLength: number,
): SpineStrand {
  const circumference = 2 * Math.PI * radius;
  const steps = Math.max(8, Math.ceil(circumference / Math.max(targetSegmentLength, 0.01)));
  const points: SpineStrand = [];
  for (let i = 0; i <= steps; i++) {
    const theta = angleRad + (i / steps) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    points.push({ x: centreX + radius * cos, y: centreY + radius * sin, nx: cos, ny: sin });
  }
  return points;
}

/** Concentric closed circles spaced evenly outward from the origin, each ring
 * its own strand, out to the far corner of the image. */
export function generateCircularRingsPath({ source, settings, scale, width, height }: RendererContext): string {
  if (!source || width < 1 || height < 1 || source.values.length === 0) return "";

  const pixelsPerMM = 1 / Math.max(scale, 0.001);
  const spacingMM = Math.max(0.1, Math.min(Number(settings.spacingMM), 20));
  const spacing = spacingMM * pixelsPerMM;
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

  const strands: SpineStrand[] = [];
  const ringSpacing = Math.max(spacing, 0.1);
  for (let radius = ringSpacing; radius <= maxRadius; radius += ringSpacing) {
    strands.push(generateRingStrand(centreX, centreY, radius, angleRad, targetSegmentLength));
  }

  return renderToneSpine(strands, { toothWidth, amplitude, waveform, image: source });
}

export const circularRingsRenderer: BitmapRendererDefinition = {
  id: CIRCULAR_RINGS_RENDERER_ID,
  label: "Circular tone rings",
  defaults: circularRingsDefaults,
  fields: [
    { type: "number", key: "spacingMM", label: "Ring spacing (mm)", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "toothWidthMM", label: "Tooth width (mm)", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "amplitudeMM", label: "Amplitude (mm)", min: 0, max: 10, step: 0.1 },
    waveformField(),
    angleField(),
    ...originFields(),
  ],
  render: generateCircularRingsPath,
};
