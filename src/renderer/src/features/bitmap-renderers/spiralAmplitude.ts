import type { BitmapRendererSettings } from "../../../../types";
import { renderToneSpine, type SpineStrand } from "./toneSpine/engine";
import { luminanceAt } from "./toneSpine/sampling";
import { angleField, DEFAULT_ANGLE_DEG, DEFAULT_ORIGIN_PCT, originFields, waveformField } from "./toneSpine/fields";
import { bipolarToothPulse, DEFAULT_WAVEFORM, type WaveformId } from "./toneSpine/waveforms";
import type { RendererContext, RendererSource, BitmapRendererDefinition } from "./types";

export const SPIRAL_AMPLITUDE_RENDERER_ID = "spiral-amplitude";

export const spiralAmplitudeDefaults: BitmapRendererSettings = {
  spacingMM: 8,
  toothWidthMM: 9,
  amplitude: 10,
  waveform: DEFAULT_WAVEFORM,
  angleDeg: DEFAULT_ANGLE_DEG,
  originXPct: DEFAULT_ORIGIN_PCT,
  originYPct: DEFAULT_ORIGIN_PCT,
};

export type { RendererSource, RendererContext, BitmapRendererDefinition };

// Re-exported for the existing unit tests and any other module that imported
// these directly from this file before they moved into the shared engine.
export { bipolarToothPulse, luminanceAt };

/**
 * Base points of one continuous Archimedean spiral centred at the given
 * origin, with the outward radial direction as each point's normal — this is
 * the unmodulated curve that `renderToneSpine` displaces tone-driven amplitude
 * along. `angleRad` rotates the spiral's start direction; the spiral still
 * begins at radius 0, so this only changes which way it initially unwinds.
 */
function generateSpiralStrand({
  width,
  height,
  centreX,
  centreY,
  angleRad,
  spacing,
  targetSegmentLength,
}: {
  width: number;
  height: number;
  centreX: number;
  centreY: number;
  angleRad: number;
  spacing: number;
  targetSegmentLength: number;
}): SpineStrand {
  const maxRadius = Math.max(
    Math.hypot(centreX, centreY),
    Math.hypot(width - centreX, centreY),
    Math.hypot(centreX, height - centreY),
    Math.hypot(width - centreX, height - centreY),
  );
  const turns = maxRadius / Math.max(spacing, 0.1);
  const maxTheta = turns * Math.PI * 2;
  const radialRate = spacing / (Math.PI * 2);
  const maxPoints = 500_000;
  const points: SpineStrand = [];

  for (let theta = 0, index = 0; theta <= maxTheta && index < maxPoints; index++) {
    const radius = (spacing * theta) / (Math.PI * 2);
    const effectiveTheta = theta + angleRad;
    const cos = Math.cos(effectiveTheta);
    const sin = Math.sin(effectiveTheta);
    points.push({
      x: centreX + radius * cos,
      y: centreY + radius * sin,
      nx: cos,
      ny: sin,
    });
    const arcRate = Math.hypot(radialRate, radius);
    theta += Math.min(0.05, targetSegmentLength / Math.max(arcRate, 0.001));
  }

  return points;
}

/**
 * Generates one continuous Archimedean spiral. Each fixed-width cycle crosses
 * the baseline at its sample point, then produces equal positive and negative
 * pulses whose amplitude is determined solely by that luminance sample.
 */
export function generateSpiralAmplitudePath({
  source,
  settings,
  scale,
  width,
  height,
}: RendererContext): string {
  // This renderer traces tone, so it has nothing to draw without a source.
  // Its manifest equivalent would declare `"source": "required"`.
  if (!source || width < 1 || height < 1 || source.values.length === 0) {
    return "";
  }

  const pixelsPerMM = 1 / Math.max(scale, 0.001);
  const spacingMM = Math.max(0.1, Math.min(Number(settings.spacingMM), 20));
  const spacing = spacingMM * pixelsPerMM;
  const toothWidth = Math.max(0.1, Math.min(Number(settings.toothWidthMM), 20)) * pixelsPerMM;
  const amplitude = Math.max(0, Math.min(Number(settings.amplitude), 10)) * pixelsPerMM;
  const waveform = (settings.waveform as WaveformId) ?? DEFAULT_WAVEFORM;
  const angleRad = (Number(settings.angleDeg ?? DEFAULT_ANGLE_DEG) * Math.PI) / 180;
  const centreX = (Number(settings.originXPct ?? DEFAULT_ORIGIN_PCT) / 100) * source.width;
  const centreY = (Number(settings.originYPct ?? DEFAULT_ORIGIN_PCT) / 100) * source.height;
  // Four segments per waveform period preserves the two peaks and three
  // baseline crossings at every radius. A fixed angular step makes segments
  // grow with radius, which visibly stretches outer waveform periods.
  const targetSegmentLength = toothWidth / 4;

  const strand = generateSpiralStrand({
    width: source.width,
    height: source.height,
    centreX,
    centreY,
    angleRad,
    spacing,
    targetSegmentLength,
  });

  return renderToneSpine([strand], { toothWidth, amplitude, waveform, image: source });
}

export const spiralAmplitudeRenderer: BitmapRendererDefinition = {
  id: SPIRAL_AMPLITUDE_RENDERER_ID,
  label: "Spiral amplitude",
  defaults: spiralAmplitudeDefaults,
  fields: [
    { type: "number", key: "spacingMM", label: "Spacing (mm)", ariaLabel: "Spiral spacing", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "toothWidthMM", label: "Tooth width (mm)", ariaLabel: "Sawtooth width", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "amplitude", label: "Amplitude (mm)", ariaLabel: "Bitmap amplitude", min: 0, max: 10, step: 0.1 },
    waveformField(),
    angleField(),
    ...originFields(),
  ],
  render: generateSpiralAmplitudePath,
};
