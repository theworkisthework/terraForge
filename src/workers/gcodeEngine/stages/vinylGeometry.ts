/**
 * Geometry helpers for drag-knife compensation (see vinylCompensation.ts):
 * cleaning up a subpath before corners are compensated, and the vector
 * arithmetic the compensation uses.
 */
import type { Pt } from "./geometryFlattening";

type Subpath = Pt[];

/** Corners turning less than this are treated as straight and merged. */
const STRAIGHT_MERGE_ANGLE_DEG = 5;

export function mergeShortSegments(subpath: Subpath, bladeOffsetMM: number): Subpath {
  if (subpath.length < 3) {
    return subpath;
  }

  const merged: Pt[] = [subpath[0]];
  for (let index = 1; index < subpath.length - 1; index++) {
    const point = subpath[index];
    const previous = merged[merged.length - 1];
    if (distance(previous, point) < bladeOffsetMM) {
      // Only collapse short near-collinear points. Preserve short curved points
      // so gentle arcs do not collapse into artificial sharp corners.
      const next = subpath[index + 1];
      const incoming = normalize(vectorBetween(previous, point));
      const outgoing = normalize(vectorBetween(point, next));
      const turnDeg = Math.abs(signedAngleDegrees(incoming, outgoing));
      if (turnDeg <= STRAIGHT_MERGE_ANGLE_DEG) {
        continue;
      }
    }
    merged.push(point);
  }

  const finalPoint = subpath[subpath.length - 1];
  if (distance(merged[merged.length - 1], finalPoint) > 0) {
    merged.push(finalPoint);
  }

  return merged;
}

export function dedupeAdjacentPoints(points: Pt[]): Pt[] {
  if (points.length < 2) {
    return points;
  }

  const deduped: Pt[] = [points[0]];
  for (let index = 1; index < points.length; index++) {
    const point = points[index];
    const previous = deduped[deduped.length - 1];
    if (distance(previous, point) > 1e-9) {
      deduped.push(point);
    }
  }
  return deduped;
}

export function estimateEndpointDirection(
  subpath: Subpath,
  side: "start" | "end",
  lookDistance: number,
): Pt {
  const minDistance = Math.max(lookDistance, 1e-6);
  let remaining = minDistance;
  let accumulatedX = 0;
  let accumulatedY = 0;

  const segmentIndexes: number[] = [];
  if (side === "start") {
    for (let index = 0; index < subpath.length - 1; index++) {
      segmentIndexes.push(index);
    }
  } else {
    for (let index = subpath.length - 2; index >= 0; index--) {
      segmentIndexes.push(index);
    }
  }

  for (const index of segmentIndexes) {
    const start = subpath[index];
    const end = subpath[index + 1];
    const vec = vectorBetween(start, end);
    const length = Math.hypot(vec.x, vec.y);
    if (length <= 1e-9) {
      continue;
    }

    const direction = normalize(vec);
    const usedLength = Math.min(length, remaining);
    accumulatedX += direction.x * usedLength;
    accumulatedY += direction.y * usedLength;
    remaining -= usedLength;

    if (remaining <= 1e-9) {
      break;
    }
  }

  const accumulatedLength = Math.hypot(accumulatedX, accumulatedY);
  if (accumulatedLength > 1e-9) {
    return {
      x: accumulatedX / accumulatedLength,
      y: accumulatedY / accumulatedLength,
    };
  }

  // Fallback for degenerate paths with repeated points.
  if (side === "start") {
    for (let index = 0; index < subpath.length - 1; index++) {
      const direction = normalize(
        vectorBetween(subpath[index], subpath[index + 1]),
      );
      if (Math.hypot(direction.x, direction.y) > 0) {
        return direction;
      }
    }
  } else {
    for (let index = subpath.length - 2; index >= 0; index--) {
      const direction = normalize(
        vectorBetween(subpath[index], subpath[index + 1]),
      );
      if (Math.hypot(direction.x, direction.y) > 0) {
        return direction;
      }
    }
  }

  return { x: 0, y: 0 };
}

export function vectorBetween(start: Pt, end: Pt): Pt {
  return { x: end.x - start.x, y: end.y - start.y };
}

export function normalize(vector: Pt): Pt {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
}

export function addScaled(point: Pt, direction: Pt, magnitude: number): Pt {
  return {
    x: point.x + direction.x * magnitude,
    y: point.y + direction.y * magnitude,
  };
}

export function perpendicularToward(direction: Pt, signedAngleDeg: number): Pt {
  return signedAngleDeg >= 0
    ? { x: -direction.y, y: direction.x }
    : { x: direction.y, y: -direction.x };
}

export function signedAngleDegrees(incoming: Pt, outgoing: Pt): number {
  const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
  const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
  return (Math.atan2(cross, dot) * 180) / Math.PI;
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
