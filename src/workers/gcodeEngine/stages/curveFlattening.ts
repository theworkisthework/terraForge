import { arcToBeziers, cubicBezier, quadBezier, type Pt } from "./geometryFlattening";

/** Values per argument group of each curve command. */
export const CURVE_GROUP_SIZE: Record<string, number> = { C: 6, S: 4, Q: 4, T: 2, A: 7 };

/**
 * One argument group of an absolute curve command (C, S, Q, T or A),
 * flattened from the current point: the points to draw (possibly none), the
 * curve's end, and the control point a following S or T reflects. After an
 * arc that is the point the pen ended at, which only the caller knows (it
 * may skip points), so it is returned as null.
 */
export function flattenCurveGroup(
  type: string,
  a: number[],
  i: number,
  from: { x: number; y: number; cpX: number; cpY: number },
): { points: Pt[]; endX: number; endY: number; cpX: number | null; cpY: number | null } {
  const { x, y } = from;
  switch (type) {
    case "C":
      return {
        points: cubicBezier(x, y, a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5]),
        endX: a[i + 4],
        endY: a[i + 5],
        cpX: a[i + 2],
        cpY: a[i + 3],
      };
    case "S": {
      const c1x = 2 * x - from.cpX;
      const c1y = 2 * y - from.cpY;
      return {
        points: cubicBezier(x, y, c1x, c1y, a[i], a[i + 1], a[i + 2], a[i + 3]),
        endX: a[i + 2],
        endY: a[i + 3],
        cpX: a[i],
        cpY: a[i + 1],
      };
    }
    case "Q":
      return {
        points: quadBezier(x, y, a[i], a[i + 1], a[i + 2], a[i + 3]),
        endX: a[i + 2],
        endY: a[i + 3],
        cpX: a[i],
        cpY: a[i + 1],
      };
    case "T": {
      const cpX = 2 * x - from.cpX;
      const cpY = 2 * y - from.cpY;
      return { points: quadBezier(x, y, cpX, cpY, a[i], a[i + 1]), endX: a[i], endY: a[i + 1], cpX, cpY };
    }
    default:
      return {
        points: arcToBeziers(x, y, a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5], a[i + 6]),
        endX: a[i + 5],
        endY: a[i + 6],
        cpX: null,
        cpY: null,
      };
  }
}
