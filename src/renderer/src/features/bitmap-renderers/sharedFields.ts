import type { BitmapRendererFieldSchema, BitmapRendererNumberFieldSchema } from "../../../../types";

/** Rotates a renderer's pattern — a spine's start angle, a halftone screen
 * angle — around its origin. Generic across every renderer family. */
export function angleField(): BitmapRendererNumberFieldSchema {
  return { type: "number", key: "angleDeg", label: "Angle (°)", min: 0, max: 360, step: 1 };
}

/** Where a renderer's pattern is centred/anchored, as a percentage of the
 * image bounds (50/50 is the image centre). Returned as a pair so callers
 * can spread it directly into a `fields` array. */
export function originFields(): BitmapRendererFieldSchema[] {
  return [
    { type: "number", key: "originXPct", label: "Origin X (%)", min: 0, max: 100, step: 1 },
    { type: "number", key: "originYPct", label: "Origin Y (%)", min: 0, max: 100, step: 1 },
  ];
}

export const DEFAULT_ANGLE_DEG = 0;
export const DEFAULT_ORIGIN_PCT = 50;
