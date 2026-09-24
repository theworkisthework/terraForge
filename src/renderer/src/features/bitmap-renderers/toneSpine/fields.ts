import type {
  BitmapRendererFieldSchema,
  BitmapRendererNumberFieldSchema,
  BitmapRendererSelectFieldSchema,
} from "../../../../../types";
import { WAVEFORM_OPTIONS } from "./waveforms";

/** The waveform picker every tone-spine renderer shares. */
export function waveformField(): BitmapRendererSelectFieldSchema {
  return { type: "select", key: "waveform", label: "Waveform", options: WAVEFORM_OPTIONS };
}

/** Rotates a spine's start angle / orientation around its origin. */
export function angleField(): BitmapRendererNumberFieldSchema {
  return { type: "number", key: "angleDeg", label: "Angle (°)", min: 0, max: 360, step: 1 };
}

/** Where a spine is centred/anchored, as a percentage of the image bounds
 * (50/50 is the image centre). Returned as a pair so callers can spread it
 * directly into a `fields` array alongside the angle and waveform fields. */
export function originFields(): BitmapRendererFieldSchema[] {
  return [
    { type: "number", key: "originXPct", label: "Origin X (%)", min: 0, max: 100, step: 1 },
    { type: "number", key: "originYPct", label: "Origin Y (%)", min: 0, max: 100, step: 1 },
  ];
}

export const DEFAULT_ANGLE_DEG = 0;
export const DEFAULT_ORIGIN_PCT = 50;
