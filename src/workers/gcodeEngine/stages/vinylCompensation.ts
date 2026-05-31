import type { Pt } from "./geometryFlattening";

type Subpath = Pt[];

const STRAIGHT_MERGE_ANGLE_DEG = 5;
const MIN_SEGMENT_LENGTH_FACTOR = 1;
const CURVE_CONTINUATION_RATIO = 0.3;
const MIN_NEIGHBOR_CURVE_TURN_DEG = 4;

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
    previousPrevious?: Pt,
    nextNext?: Pt,
  ): Pt[] => {
    const incomingVector = vectorBetween(previous, corner);
    const outgoingVector = vectorBetween(corner, next);
    const incomingLength = Math.hypot(incomingVector.x, incomingVector.y);
    const outgoingLength = Math.hypot(outgoingVector.x, outgoingVector.y);

    // Very short adjacent segments are usually curve tessellation artifacts.
    // Skipping compensation here avoids introducing synthetic kinks on gentle arcs.
    if (
      incomingLength < settings.bladeOffsetMM * MIN_SEGMENT_LENGTH_FACTOR &&
      outgoingLength < settings.bladeOffsetMM * MIN_SEGMENT_LENGTH_FACTOR
    ) {
      return [];
    }

    const incoming = normalize(incomingVector);
    const outgoing = normalize(outgoingVector);
    const signedAngleDeg = signedAngleDegrees(incoming, outgoing);
    const absoluteAngleDeg = Math.abs(signedAngleDeg);

    if (absoluteAngleDeg < settings.cornerAngleThresholdDeg) {
      return []; // No special compensation, just the corner itself
    }

    // If adjacent turns continue the same signed curvature, this point is likely
    // a tessellated curve sample rather than an isolated sharp corner.
    const continuationThreshold = Math.max(
      MIN_NEIGHBOR_CURVE_TURN_DEG,
      absoluteAngleDeg * CURVE_CONTINUATION_RATIO,
    );

    let continuesCurveFromPrevious = false;
    if (previousPrevious) {
      const prevIncoming = normalize(vectorBetween(previousPrevious, previous));
      const prevOutgoing = normalize(vectorBetween(previous, corner));
      const prevTurnDeg = signedAngleDegrees(prevIncoming, prevOutgoing);
      continuesCurveFromPrevious =
        Math.sign(prevTurnDeg) === Math.sign(signedAngleDeg) &&
        Math.abs(prevTurnDeg) >= continuationThreshold;
    }

    let continuesCurveToNext = false;
    if (nextNext) {
      const nextIncoming = normalize(vectorBetween(corner, next));
      const nextOutgoing = normalize(vectorBetween(next, nextNext));
      const nextTurnDeg = signedAngleDegrees(nextIncoming, nextOutgoing);
      continuesCurveToNext =
        Math.sign(nextTurnDeg) === Math.sign(signedAngleDeg) &&
        Math.abs(nextTurnDeg) >= continuationThreshold;
    }

    const hasPreviousNeighborTurn = previousPrevious !== undefined;
    const hasNextNeighborTurn = nextNext !== undefined;

    // A tessellated bezier curve has consistent same-direction turns on both
    // sides of every sample point. A true corner is an isolated direction
    // change — neighbours have essentially zero turn (straight segments).
    // Suppress compensation whenever both neighbours confirm the same curvature
    // direction, regardless of segment length.
    if (continuesCurveFromPrevious && continuesCurveToNext) {
      return [];
    }

    // Near subpath boundaries only one neighbour is available. Suppress only
    // for moderate turns (not sharp corners) where that one side clearly shows
    // the same curvature direction.
    const isModerateTurn =
      absoluteAngleDeg <= settings.cornerAngleThresholdDeg * 3;
    if (isModerateTurn) {
      if (continuesCurveFromPrevious && !hasNextNeighborTurn) {
        return [];
      }
      if (continuesCurveToNext && !hasPreviousNeighborTurn) {
        return [];
      }
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
        merged.length > 3 ? merged[merged.length - 3] : undefined,
        merged.length > 3 ? merged[2] : undefined,
      );
      if (compensationMoves.length > 0) {
        result.push(...compensationMoves);
      } else {
        // Start is below threshold: just add forward offset
        const firstDir = estimateEndpointDirection(
          merged,
          "start",
          settings.bladeOffsetMM,
        );
        result.push(addScaled(merged[0], firstDir, settings.bladeOffsetMM));
      }
    } else {
      // For open paths, just add forward offset from start
      const firstDir = estimateEndpointDirection(
        merged,
        "start",
        settings.bladeOffsetMM,
      );
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
        index >= 2 ? merged[index - 2] : undefined,
        index + 2 < merged.length ? merged[index + 2] : undefined,
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
      const lastDir = estimateEndpointDirection(
        merged,
        "end",
        settings.bladeOffsetMM,
      );
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

function estimateEndpointDirection(
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
