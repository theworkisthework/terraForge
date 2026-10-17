import type { BitmapRendererSettings } from "../../../../types";
import type { SpineStrand } from "./toneSpine/engine";
import {
  amplitudeField,
  defineToneSpineRenderer,
  spacingField,
  toothWidthField,
} from "./toneSpine/defineToneSpineRenderer";
import type { RendererContext } from "./types";

export const CONCENTRIC_BOXES_RENDERER_ID = "concentric-boxes";

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
function boxStrand(
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
export const concentricBoxesRenderer = defineToneSpineRenderer({
  id: CONCENTRIC_BOXES_RENDERER_ID,
  label: "Concentric boxes",
  revision: 1,
  fields: [spacingField("Box spacing (mm)"), toothWidthField(), amplitudeField()],
  defaults: { spacingMM: 4, toothWidthMM: 6, amplitudeMM: 1.5 },
  *strands({ originX, originY, spacing, angleRad, targetSegmentLength, maxRadius, width, height }) {
    const aspect = height / width;
    for (let k = 1; ; k++) {
      const halfWidth = k * spacing;
      const halfHeight = k * spacing * aspect;
      if (Math.hypot(halfWidth, halfHeight) > maxRadius) break;
      yield boxStrand(originX, originY, halfWidth, halfHeight, angleRad, targetSegmentLength);
    }
  },
});

export const concentricBoxesDefaults: BitmapRendererSettings = concentricBoxesRenderer.defaults;

export function generateConcentricBoxesPath(context: RendererContext): string {
  return concentricBoxesRenderer.render(context).layers[0].d;
}
