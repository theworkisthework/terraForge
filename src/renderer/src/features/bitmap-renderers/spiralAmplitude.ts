import type { BitmapRendererSettings } from "../../../../../types";
import type { BitmapLuminance, BitmapRendererDefinition } from "./types";

export const SPIRAL_AMPLITUDE_RENDERER_ID = "spiral-amplitude";

export const spiralAmplitudeDefaults: BitmapRendererSettings = {
  spacingMM: 8,
  toothWidthMM: 9,
  amplitude: 10,
};

export type { BitmapLuminance, BitmapRendererDefinition };

function format(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function luminanceAt(image: BitmapLuminance, x: number, y: number): number {
  const sampleX = Math.round(x);
  const sampleY = Math.round(y);
  // The spiral's circular extent can exceed a rectangular source bitmap. Do
  // not repeat edge pixels into that area; white gives an unmodulated baseline.
  if (
    sampleX < 0 ||
    sampleX >= image.width ||
    sampleY < 0 ||
    sampleY >= image.height
  ) {
    return 255;
  }
  return image.values[sampleY * image.width + sampleX] ?? 255;
}

export function bipolarToothPulse(phase: number): number {
  const cycle = phase - Math.floor(phase);
  if (cycle <= 0.25) return cycle * 4;
  if (cycle <= 0.5) return 2 - cycle * 4;
  if (cycle <= 0.75) return -(cycle - 0.5) * 4;
  return -4 + cycle * 4;
}

/**
 * Generates one continuous Archimedean spiral. Each fixed-width cycle crosses
 * the baseline at its sample point, then produces equal positive and negative
 * pulses whose amplitude is determined solely by that luminance sample.
 */
export function generateSpiralAmplitudePath(
  image: BitmapLuminance,
  settings: BitmapRendererSettings,
  baseScale: number,
): string {
  if (image.width < 1 || image.height < 1 || image.values.length === 0) {
    return "";
  }

  const pixelsPerMM = 1 / Math.max(baseScale, 0.001);
  const spacingMM = Math.max(0.1, Math.min(Number(settings.spacingMM), 20));
  const spacing = spacingMM * pixelsPerMM;
  const toothWidth = Math.max(0.1, Math.min(Number(settings.toothWidthMM), 20)) * pixelsPerMM;
  const amplitude = Math.max(0, Math.min(Number(settings.amplitude), 10)) * pixelsPerMM;
  const centreX = image.width / 2;
  const centreY = image.height / 2;
  const maxRadius = Math.hypot(centreX, centreY);
  const turns = maxRadius / Math.max(spacing, 0.1);
  const maxTheta = turns * Math.PI * 2;
  const radialRate = spacing / (Math.PI * 2);
  // Four segments per waveform period preserves the two peaks and three
  // baseline crossings at every radius. A fixed angular step makes segments
  // grow with radius, which visibly stretches outer waveform periods.
  const targetSegmentLength = toothWidth / 4;
  const maxPoints = 500_000;
  const commands: string[] = [];
  let arcLength = 0;
  let previousRadius = 0;
  let previousTheta = 0;
  let toothIndex = -1;
  let toothDark = 0;

  for (let theta = 0, index = 0; theta <= maxTheta && index < maxPoints; index++) {
    const radius = (spacing * theta) / (Math.PI * 2);
    const x = centreX + radius * Math.cos(theta);
    const y = centreY + radius * Math.sin(theta);
    if (index > 0) {
      arcLength += Math.hypot(
        radius - previousRadius,
        radius * (theta - previousTheta),
      );
    }
    const nextToothIndex = Math.floor(arcLength / toothWidth);
    if (nextToothIndex !== toothIndex) {
      toothIndex = nextToothIndex;
      // Every cycle is sampled once at its baseline crossing. Its fixed-width
      // bipolar waveform changes only in amplitude as source tone changes.
      toothDark = 1 - luminanceAt(image, x, y) / 255;
    }
    const modulatedRadius =
      radius + amplitude * toothDark * bipolarToothPulse(arcLength / toothWidth);
    const pointX = centreX + modulatedRadius * Math.cos(theta);
    const pointY = centreY + modulatedRadius * Math.sin(theta);
    commands.push(`${index === 0 ? "M" : "L"}${format(pointX)} ${format(pointY)}`);
    previousRadius = radius;
    previousTheta = theta;
    const arcRate = Math.hypot(radialRate, radius);
    theta += Math.min(0.05, targetSegmentLength / Math.max(arcRate, 0.001));
  }

  return commands.join(" ");
}

export const spiralAmplitudeRenderer: BitmapRendererDefinition = {
  id: SPIRAL_AMPLITUDE_RENDERER_ID,
  label: "Spiral amplitude",
  defaults: spiralAmplitudeDefaults,
  fields: [
    { type: "number", key: "spacingMM", label: "Spacing (mm)", ariaLabel: "Spiral spacing", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "toothWidthMM", label: "Tooth width (mm)", ariaLabel: "Sawtooth width", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "amplitude", label: "Amplitude (mm)", ariaLabel: "Bitmap amplitude", min: 0, max: 10, step: 0.1 },
  ],
  render: generateSpiralAmplitudePath,
};