import type {
  InkServiceStationAction,
  InkServiceStationType,
} from "../../../../../types";

export function defaultStationActionForType(
  type: InkServiceStationType,
): InkServiceStationAction | undefined {
  if (type === "prime") {
    return {
      kind: "prime-press",
      zDepthMM: 1,
      pressCount: 3,
    };
  }
  if (type === "dip" || type === "wash") {
    return {
      kind: "brush-motion",
      zDepthMM: 2,
      pattern: type === "wash" ? "circular" : "back-forth",
      repetitions: 3,
      distanceMM: 2,
    };
  }
  return undefined;
}
