import type { BitmapRendererSettings, RendererContext } from "../../../../types";
import type { SpineStrand } from "./toneSpine/engine";
import {
  amplitudeField,
  defineToneSpineRenderer,
  spacingField,
  toothWidthField,
} from "./toneSpine/defineToneSpineRenderer";

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
 * Concentric rectangles shaped like the image and rotated by `angleDeg`
 * around the origin, each its own strand, out until one covers the whole
 * image.
 *
 * Each box is `spacingMM` larger than the one inside it on all four sides —
 * the family of inward offsets of the image's own rectangle — so the line
 * spacing reads the same horizontally and vertically. Scaling boxes by the
 * image's aspect instead kept the setting on one axis only: a portrait three
 * times taller than wide got gaps three times the setting vertically.
 */
export const concentricBoxesRenderer = defineToneSpineRenderer({
  id: CONCENTRIC_BOXES_RENDERER_ID,
  label: "Concentric boxes",
  // 2: equal spacing on all four sides, rather than aspect-scaled boxes.
  revision: 2,
  fields: [spacingField("Box spacing (mm)"), toothWidthField(), amplitudeField()],
  defaults: { spacingMM: 4, toothWidthMM: 6, amplitudeMM: 1.5 },
  *strands({ originX, originY, spacing, angleRad, targetSegmentLength, width, height, inkFraction }) {
    // The innermost "box" is the line the image's offsets shrink to: as long
    // as the image's longer side exceeds its shorter one.
    const baseHalfWidth = Math.max(0, (width - height) / 2);
    const baseHalfHeight = Math.max(0, (height - width) / 2);

    // How large a box must be to contain the whole image: the image corners'
    // furthest reach along each of the box's own (rotated) axes.
    const corners = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: 0, y: height },
      { x: width, y: height },
    ].map(({ x, y }) => rotate(x - originX, y - originY, -angleRad));
    const coverHalfWidth = Math.max(...corners.map((c) => Math.abs(c.x)));
    const coverHalfHeight = Math.max(...corners.map((c) => Math.abs(c.y)));

    // Separated inks sit a fraction of the spacing further out each, so
    // their boxes interleave.
    for (let k = 1; ; k++) {
      const halfWidth = baseHalfWidth + (k + inkFraction) * spacing;
      const halfHeight = baseHalfHeight + (k + inkFraction) * spacing;
      yield boxStrand(originX, originY, halfWidth, halfHeight, angleRad, targetSegmentLength);
      if (halfWidth >= coverHalfWidth && halfHeight >= coverHalfHeight) break;
    }
  },
});

export const concentricBoxesDefaults: BitmapRendererSettings = concentricBoxesRenderer.defaults;

export function generateConcentricBoxesPath(context: RendererContext): string {
  return concentricBoxesRenderer.render(context).layers[0].d;
}
