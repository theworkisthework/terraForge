import type { BitmapRendererSettings, RendererContext } from "../../../../types";
import { MAX_RENDER_POINTS, type SpineStrand } from "./toneSpine/engine";
import {
  amplitudeField,
  defineToneSpineRenderer,
  spacingField,
  toothWidthField,
  type SpineGeometry,
} from "./toneSpine/defineToneSpineRenderer";

export const SPIRAL_AMPLITUDE_RENDERER_ID = "spiral-amplitude";

/** Safety cap on base points: the render-wide budget, so the spiral is never
 * cut short sooner than any other renderer would be. Only extreme settings
 * (a tooth width of a fraction of a millimetre over a large image) reach it. */
const MAX_SPIRAL_POINTS = MAX_RENDER_POINTS;

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
function spiralStrand({
  originX,
  originY,
  angleRad: baseAngle,
  spacing,
  targetSegmentLength,
  maxRadius,
  warn,
  inkFraction,
}: SpineGeometry): SpineStrand {
  // Rotating an Archimedean spiral by a fraction of a turn moves each turn
  // outward by that fraction of the spacing, so separated inks interleave.
  const angleRad = baseAngle + inkFraction * Math.PI * 2;
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
  // Spiral once stored amplitude under "amplitude", before every renderer
  // settled on "amplitudeMM"; drawings saved then are read under the new key.
  renamedSettings: { amplitude: "amplitudeMM" },
  fields: [
    spacingField("Spacing (mm)", "Spiral spacing"),
    toothWidthField("Tooth width"),
    amplitudeField("Bitmap amplitude"),
  ],
  defaults: { spacingMM: 8, toothWidthMM: 9, amplitudeMM: 10 },
  strands: (geometry) => [spiralStrand(geometry)],
});

export const spiralAmplitudeDefaults: BitmapRendererSettings = spiralAmplitudeRenderer.defaults;

/** One continuous Archimedean spiral, tone-modulated along its length. */
export function generateSpiralAmplitudePath(context: RendererContext): string {
  return spiralAmplitudeRenderer.render(context).layers[0].d;
}
