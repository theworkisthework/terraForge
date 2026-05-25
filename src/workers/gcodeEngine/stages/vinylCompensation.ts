import type { Pt } from "./geometryFlattening";

type Subpath = Pt[];

interface VinylCompensationSettings {
  bladeOffsetMM: number;
  cornerAngleThresholdDeg: number;
  microJogMagnitudeMM: number;
}

export function applyVinylCompensation(
  subpaths: Subpath[],
  settings: VinylCompensationSettings,
): Subpath[] {
  if (settings.bladeOffsetMM <= 0) {
    return subpaths;
  }

  return subpaths
    .map((subpath) => compensateSubpath(subpath, settings))
    .filter((subpath): subpath is Subpath => subpath.length >= 2);
}

function compensateSubpath(
  subpath: Subpath,
  settings: VinylCompensationSettings,
): Subpath {
  const merged = mergeShortSegments(subpath, settings.bladeOffsetMM);
  if (merged.length < 2) {
    return [];
  }

  // For very short paths (less than blade offset), return unchanged
  // to avoid degenerate geometry with overshoots larger than the path itself
  if (merged.length === 2) {
    const pathLength = distance(merged[0], merged[1]);
    if (pathLength < settings.bladeOffsetMM) {
      return merged; // Pass through without compensation
    }
  }

  // Detect if path is closed (start point == end point)
  const isClosed =
    merged.length >= 3 && distance(merged[0], merged[merged.length - 1]) < 1e-9;

  const result: Pt[] = [merged[0]];

  // Helper function to apply full corner compensation (swivel/micro-jog/backtrack)
  // Returns moves AFTER the corner point if angle exceeds threshold, else returns empty
  const getCornerCompensationMoves = (
    previous: Pt,
    corner: Pt,
    next: Pt,
  ): Pt[] => {
    const incoming = normalize(vectorBetween(previous, corner));
    const outgoing = normalize(vectorBetween(corner, next));
    const signedAngleDeg = signedAngleDegrees(incoming, outgoing);
    const absoluteAngleDeg = Math.abs(signedAngleDeg);

    if (absoluteAngleDeg < settings.cornerAngleThresholdDeg) {
      return []; // No special compensation, just the corner itself
    }

    const overshootDistance = settings.bladeOffsetMM;
    const swivelPoint = addScaled(corner, incoming, overshootDistance);
    const moves: Pt[] = [swivelPoint];

    if (settings.microJogMagnitudeMM > 0) {
      const jogNormal = perpendicularToward(incoming, signedAngleDeg);
      moves.push(
        addScaled(swivelPoint, jogNormal, settings.microJogMagnitudeMM),
      );
    }

    moves.push(corner);
    return moves;
  };

  if (merged.length === 2) {
    // For 2-point paths
    const vec = vectorBetween(merged[0], merged[1]);
    const vecMagnitude = Math.hypot(vec.x, vec.y);

    if (vecMagnitude > settings.bladeOffsetMM * 0.5) {
      // Path long enough for meaningful overshoot
      const dir = normalize(vec);
      result.push(addScaled(merged[0], dir, settings.bladeOffsetMM));
      result.push(merged[1]);
      result.push(addScaled(merged[1], dir, settings.bladeOffsetMM));
    } else {
      // Very short path: just add end point to preserve the path
      result.push(merged[1]);
    }
  } else {
    // For 3+ point paths

    if (isClosed) {
      // For closed paths, treat the start point as a corner with full compensation
      const compensationMoves = getCornerCompensationMoves(
        merged[merged.length - 2], // incoming from second-to-last
        merged[0], // corner at start
        merged[1], // outgoing to second point
      );
      if (compensationMoves.length > 0) {
        result.push(...compensationMoves);
      } else {
        // Start is below threshold: just add forward offset
        const firstDir = normalize(vectorBetween(merged[0], merged[1]));
        result.push(addScaled(merged[0], firstDir, settings.bladeOffsetMM));
      }
    } else {
      // For open paths, just add forward offset from start
      const firstDir = normalize(vectorBetween(merged[0], merged[1]));
      result.push(addScaled(merged[0], firstDir, settings.bladeOffsetMM));
    }

    // Process interior corners (1 to length-2)
    for (let index = 1; index < merged.length - 1; index++) {
      const previous = merged[index - 1];
      const corner = merged[index];
      const next = merged[index + 1];

      // Get compensation moves if angle exceeds threshold
      const compensationMoves = getCornerCompensationMoves(
        previous,
        corner,
        next,
      );

      if (compensationMoves.length > 0) {
        // Compensation applies: push swivel + micro-jog + backtrack to corner
        result.push(...compensationMoves);
      } else {
        // No compensation: just push the corner as-is
        result.push(corner);
      }
    }

    // For open paths, add forward offset before end point.
    // For closed paths, close the loop by adding the closing point (same coords as start).
    // The start-of-path compensation handles blade orientation at the corner; this segment
    // completes the physical cut from the last interior corner back to the start point.
    if (!isClosed) {
      const last = merged[merged.length - 1];
      const beforeLast = merged[merged.length - 2];
      const lastDir = normalize(vectorBetween(beforeLast, last));
      result.push(last);
      result.push(addScaled(last, lastDir, settings.bladeOffsetMM));
    } else {
      // Close the path: travel from the last corner back to the start point.
      result.push(merged[merged.length - 1]);
    }
  }

  return dedupeAdjacentPoints(result);
}

function mergeShortSegments(subpath: Subpath, bladeOffsetMM: number): Subpath {
  if (subpath.length < 3) {
    return subpath;
  }

  const merged: Pt[] = [subpath[0]];
  for (let index = 1; index < subpath.length - 1; index++) {
    const point = subpath[index];
    const previous = merged[merged.length - 1];
    if (distance(previous, point) < bladeOffsetMM) {
      continue;
    }
    merged.push(point);
  }

  const finalPoint = subpath[subpath.length - 1];
  if (distance(merged[merged.length - 1], finalPoint) > 0) {
    merged.push(finalPoint);
  }

  return merged;
}

function dedupeAdjacentPoints(points: Pt[]): Pt[] {
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

function vectorBetween(start: Pt, end: Pt): Pt {
  return { x: end.x - start.x, y: end.y - start.y };
}

function normalize(vector: Pt): Pt {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
}

function addScaled(point: Pt, direction: Pt, magnitude: number): Pt {
  return {
    x: point.x + direction.x * magnitude,
    y: point.y + direction.y * magnitude,
  };
}

function perpendicularToward(direction: Pt, signedAngleDeg: number): Pt {
  return signedAngleDeg >= 0
    ? { x: -direction.y, y: direction.x }
    : { x: direction.y, y: -direction.x };
}

function signedAngleDegrees(incoming: Pt, outgoing: Pt): number {
  const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
  const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
  return (Math.atan2(cross, dot) * 180) / Math.PI;
}

function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
