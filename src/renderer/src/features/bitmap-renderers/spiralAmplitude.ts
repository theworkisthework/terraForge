import type { BitmapRendererSettings } from "../../../../types";
import type { SpineStrand } from "./toneSpine/engine";
import {
  amplitudeField,
  defineToneSpineRenderer,
  spacingField,
  toothWidthField,
  type SpineGeometry,
} from "./toneSpine/defineToneSpineRenderer";
import { luminanceAt } from "./toneSpine/sampling";
import { bipolarToothPulse } from "./toneSpine/waveforms";
import type { RendererContext, RendererSource, BitmapRendererDefinition } from "./types";

export const SPIRAL_AMPLITUDE_RENDERER_ID = "spiral-amplitude";

export type { RendererSource, RendererContext, BitmapRendererDefinition };

// Re-exported for the existing unit tests and any other module that imported
// these directly from this file before they moved into the shared engine.
export { bipolarToothPulse, luminanceAt };

/** Safety cap on base points, ahead of the engine's own per-strand cap. */
const MAX_SPIRAL_POINTS = 500_000;

/**
 * Base points of one continuous Archimedean spiral centred at the origin,
 * with the outward radial direction as each point's normal — the unmodulated
 * curve the engine displaces tone-driven amplitude along. `angleRad` rotates
 * the spiral's start direction; the spiral still begins at radius 0, so this
 * only changes which way it initially unwinds.
 *
 * A fixed angular step would make segments grow with radius, visibly
 * stretching outer waveform periods, so the step is chosen per point to keep
 * every segment near `targetSegmentLength`.
 */
function spiralStrand({ originX, originY, angleRad, spacing, targetSegmentLength, maxRadius, warn }: SpineGeometry): SpineStrand {
  const maxTheta = (maxRadius / spacing) * Math.PI * 2;
  const radialRate = spacing / (Math.PI * 2);
  const points: SpineStrand = [];

  for (let theta = 0, index = 0; theta <= maxTheta && index < MAX_SPIRAL_POINTS; index++) {
    const radius = (spacing * theta) / (Math.PI * 2);
    const cos = Math.cos(theta + angleRad);
    const sin = Math.sin(theta + angleRad);
    points.push({ x: originX + radius * cos, y: originY + radius * sin, nx: cos, ny: sin });
    const arcRate = Math.hypot(radialRate, radius);
    theta += Math.min(0.05, targetSegmentLength / Math.max(arcRate, 0.001));
  }
  if (points.length >= MAX_SPIRAL_POINTS) {
    warn("The spiral was cut short before reaching the image edge. Increase the spacing or tooth width.");
  }

  return points;
}

export const spiralAmplitudeRenderer = defineToneSpineRenderer({
  id: SPIRAL_AMPLITUDE_RENDERER_ID,
  label: "Spiral amplitude",
  revision: 1,
  // Spiral predates the `amplitudeMM` key every later renderer uses.
  amplitudeKey: "amplitude",
  fields: [
    spacingField("Spacing (mm)", "Spiral spacing"),
    toothWidthField("Tooth width"),
    amplitudeField("amplitude", "Bitmap amplitude"),
  ],
  defaults: { spacingMM: 8, toothWidthMM: 9, amplitude: 10 },
  strands: (geometry) => [spiralStrand(geometry)],
});

export const spiralAmplitudeDefaults: BitmapRendererSettings = spiralAmplitudeRenderer.defaults;

/** One continuous Archimedean spiral, tone-modulated along its length. */
export function generateSpiralAmplitudePath(context: RendererContext): string {
  return spiralAmplitudeRenderer.render(context).layers[0].d;
}
