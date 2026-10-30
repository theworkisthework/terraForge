import type { Pt } from "./geometryFlattening";
import {
  mergeShortSegments,
  dedupeAdjacentPoints,
  estimateEndpointDirection,
  vectorBetween,
  normalize,
  addScaled,
  perpendicularToward,
  signedAngleDegrees,
  distance,
} from "./vinylGeometry";

type Subpath = Pt[];

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
