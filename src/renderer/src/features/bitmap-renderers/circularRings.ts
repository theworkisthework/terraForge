import type { BitmapRendererSettings, RendererContext } from "../../../../types";
import type { SpineStrand } from "./toneSpine/engine";
import {
  amplitudeField,
  defineToneSpineRenderer,
  spacingField,
  toothWidthField,
  type SpineGeometry,
} from "./toneSpine/defineToneSpineRenderer";

export const CIRCULAR_RINGS_RENDERER_ID = "circular-rings";

/**
 * One closed ring's base points, radial-outward normal. `angleRad` rotates
 * where each ring's tooth pattern starts — a ring has no inherent "start" the
 * way a spiral's radial growth does, so this is the natural stand-in.
 */
function ringStrand(radius: number, { originX, originY, angleRad, targetSegmentLength }: SpineGeometry): SpineStrand {
  const circumference = 2 * Math.PI * radius;
  const steps = Math.max(8, Math.ceil(circumference / Math.max(targetSegmentLength, 0.01)));
  const points: SpineStrand = [];
  for (let i = 0; i <= steps; i++) {
    const theta = angleRad + (i / steps) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    points.push({ x: originX + radius * cos, y: originY + radius * sin, nx: cos, ny: sin });
  }
  return points;
}

/** Concentric closed circles spaced evenly outward from the origin, each ring
 * its own strand, out to the far corner of the image. */
export const circularRingsRenderer = defineToneSpineRenderer({
  id: CIRCULAR_RINGS_RENDERER_ID,
  label: "Circular tone rings",
  revision: 1,
  fields: [spacingField("Ring spacing (mm)"), toothWidthField(), amplitudeField()],
  defaults: { spacingMM: 4, toothWidthMM: 6, amplitudeMM: 1.5 },
  *strands(geometry) {
    // Separated inks start a fraction of the spacing further out each, so
    // their rings interleave (rotating a ring would change nothing).
    const first = geometry.spacing * (1 + geometry.inkFraction);
    for (let radius = first; radius <= geometry.maxRadius; radius += geometry.spacing) {
      yield ringStrand(radius, geometry);
    }
  },
});

export const circularRingsDefaults: BitmapRendererSettings = circularRingsRenderer.defaults;

export function generateCircularRingsPath(context: RendererContext): string {
  return circularRingsRenderer.render(context).layers[0].d;
}
