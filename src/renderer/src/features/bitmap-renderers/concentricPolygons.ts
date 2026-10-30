import type { BitmapRendererSettings, RendererContext } from "../../../../types";
import type { SpineStrand } from "./toneSpine/engine";
import {
  amplitudeField,
  defineToneSpineRenderer,
  spacingField,
  toothWidthField,
  type SpineGeometry,
} from "./toneSpine/defineToneSpineRenderer";

export const CONCENTRIC_POLYGONS_RENDERER_ID = "concentric-polygons";

/**
 * One closed regular polygon's base points, circumradius `radius`, centred
 * at the origin. Each edge's outward normal is the direction from the centre
 * to that edge's midpoint — exact for a regular polygon, and the natural
 * generalization of a circle's radial normal to straight edges.
 */
function polygonStrand(
  radius: number,
  sides: number,
  { originX, originY, angleRad, targetSegmentLength }: SpineGeometry,
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
        x: originX + a.x + t * (b.x - a.x),
        y: originY + a.y + t * (b.y - a.y),
        nx: normal.x,
        ny: normal.y,
      });
    }
  }
  if (points.length > 0) points.push({ ...points[0] });
  return points;
}

/**
 * Concentric regular polygons (triangle up to 12-gon), out to the far image
 * corner — each polygon its own strand. `angleDeg` rotates every polygon's
 * vertex phase.
 *
 * Spaced so the gap between neighbouring polygons' parallel edges — what the
 * eye reads as line spacing — is `spacingMM`. Stepping the circumradius by
 * the spacing instead left edges only `spacing · cos(π/n)` apart: half the
 * setting for triangles.
 */
export const concentricPolygonsRenderer = defineToneSpineRenderer({
  id: CONCENTRIC_POLYGONS_RENDERER_ID,
  label: "Concentric polygons",
  // 2: spaced edge-to-edge rather than corner-to-corner.
  revision: 2,
  fields: [
    spacingField("Ring spacing (mm)"),
    toothWidthField(),
    amplitudeField(),
    { type: "number", key: "sides", label: "Sides", min: 3, max: 12, step: 1 },
  ],
  defaults: { spacingMM: 4, toothWidthMM: 6, amplitudeMM: 1.5, sides: 6 },
  *strands(geometry, settings) {
    const sides = Math.round(settings.sides as number);
    // Circumradius per unit of apothem (the centre-to-edge distance).
    const step = geometry.spacing / Math.cos(Math.PI / sides);
    // Separated inks sit a fraction of the spacing further out each, so
    // their polygons interleave.
    const first = step * (1 + geometry.inkFraction);
    for (let radius = first; radius * Math.cos(Math.PI / sides) <= geometry.maxRadius; radius += step) {
      yield polygonStrand(radius, sides, geometry);
    }
  },
});

export const concentricPolygonsDefaults: BitmapRendererSettings = concentricPolygonsRenderer.defaults;

export function generateConcentricPolygonsPath(context: RendererContext): string {
  return concentricPolygonsRenderer.render(context).layers[0].d;
}
