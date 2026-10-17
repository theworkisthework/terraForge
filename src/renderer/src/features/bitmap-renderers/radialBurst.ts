import type { BitmapRendererSettings } from "../../../../types";
import type { SpineStrand } from "./toneSpine/engine";
import {
  amplitudeField,
  defineToneSpineRenderer,
  spacingField,
  toothWidthField,
} from "./toneSpine/defineToneSpineRenderer";
import { clipLineToRect } from "./toneSpine/lineFamily";
import type { RendererContext } from "./types";

export const RADIAL_BURST_RENDERER_ID = "radial-burst";

/** Rays at the innermost level. Few enough that the clear centre they leave
 * is small; enough that the burst reads as a burst before any branching. */
const INNER_RAYS = 8;

/**
 * One ray's base points, straight out from the origin between radii `from`
 * and `to` in direction `dir`, with the tangential (perpendicular-to-ray)
 * direction as its normal — the same "amplitude displaces perpendicular to
 * the spine" convention every other tone-spine renderer uses. A ray with no
 * perpendicular wave would just be a straight spoke; this is what lets tone
 * modulate it visibly.
 */
function rayStrand(
  originX: number,
  originY: number,
  theta: number,
  from: number,
  to: number,
  targetSegmentLength: number,
): SpineStrand {
  const dir = { x: Math.cos(theta), y: Math.sin(theta) };
  const normal = { x: -dir.y, y: dir.x };
  const steps = Math.max(1, Math.ceil((to - from) / Math.max(targetSegmentLength, 0.01)));
  const points: SpineStrand = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps;
    points.push({ x: originX + t * dir.x, y: originY + t * dir.y, nx: normal.x, ny: normal.y });
  }
  return points;
}

/** `value` with its lowest `bits` bits reversed — the order that spreads
 * successive insertions evenly around a circle rather than in one sweep. */
function bitReverse(value: number, bits: number): number {
  let reversed = 0;
  for (let i = 0; i < bits; i++) reversed |= ((value >> i) & 1) << (bits - 1 - i);
  return reversed;
}

/**
 * Rays fanning out from the origin, adding rays as they spread so the gap
 * between neighbours stays close to `spacingMM` at every radius.
 *
 * A fixed number of rays cannot work for a burst: rays diverge, so any count
 * that reads well at the edge of the image piles into a solid blot at the
 * centre, and any count that suits the centre leaves the edges tens of
 * millimetres apart — far wider than the amplitude, so tone barely shows.
 *
 * Instead, `INNER_RAYS` rays start where they are one spacing apart (leaving
 * a small clear centre rather than a pile-up). Beyond that, a new ray starts
 * midway between two existing ones each time the circumference has grown by
 * one more spacing, keeping the average gap at one spacing. The new rays of
 * each doubling are added in bit-reversed order, so they spread evenly round
 * the circle; adding them all at once at each doubling instead banded the
 * render into visible rings, dense just after each doubling and sparse just
 * before the next. `angleDeg` rotates the whole burst.
 */
export const radialBurstRenderer = defineToneSpineRenderer({
  id: RADIAL_BURST_RENDERER_ID,
  label: "Radial burst",
  // 2: rays added as they spread, at a set spacing, replacing a fixed count.
  revision: 2,
  fields: [spacingField("Ray spacing (mm)"), toothWidthField(), amplitudeField()],
  defaults: { spacingMM: 3, toothWidthMM: 4, amplitudeMM: 1.5 },
  *strands({ originX, originY, angleRad, spacing, targetSegmentLength, width, height, maxRadius }) {
    // The radius at which `rays` rays are exactly one spacing apart.
    const radiusFor = (rays: number) => (rays * spacing) / (2 * Math.PI);

    const ray = (theta: number, start: number) => {
      const range = clipLineToRect({ x: originX, y: originY }, { x: Math.cos(theta), y: Math.sin(theta) }, width, height);
      if (!range) return null;
      // Outward from the origin only, from where this ray starts to the image
      // edge (an origin outside the image starts at the edge instead).
      const from = Math.max(start, range[0]);
      const to = range[1];
      return to > from ? rayStrand(originX, originY, theta, from, to, targetSegmentLength) : null;
    };

    for (let i = 0; i < INNER_RAYS; i++) {
      const strand = ray(angleRad + (i / INNER_RAYS) * Math.PI * 2, radiusFor(INNER_RAYS));
      if (strand) yield strand;
    }
    // Each level doubles the rays: `existing` rays gain one midway between
    // each pair, the m-th of them starting once there is room for it.
    for (let existing = INNER_RAYS, bits = Math.log2(INNER_RAYS); radiusFor(existing) < maxRadius; existing *= 2, bits++) {
      for (let m = 0; m < existing; m++) {
        const slot = bitReverse(m, bits);
        const strand = ray(angleRad + ((2 * slot + 1) / (2 * existing)) * Math.PI * 2, radiusFor(existing + m + 1));
        if (strand) yield strand;
      }
    }
  },
});

export const radialBurstDefaults: BitmapRendererSettings = radialBurstRenderer.defaults;

export function generateRadialBurstPath(context: RendererContext): string {
  return radialBurstRenderer.render(context).layers[0].d;
}
