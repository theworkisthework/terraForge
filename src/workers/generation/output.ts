/**
 * The G-code generator's output types, and the `;@tf` metadata markers it
 * writes so a loaded toolpath can be coloured, layered and dip-mapped.
 */
import type { Subpath } from "../gcodeEngine";

export type GcodeGenerationStage =
  | "preparing"
  | "optimizing"
  | "joining"
  | "postprocessing"
  | "emitting";

export function fmtSeconds(n: number): string {
  return n
    .toFixed(3)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

export interface TravelSubpath {
  points: Subpath;
  layer?: string;
  color?: string;
}

export interface TravelPoint {
  point: { x: number; y: number };
  layer?: string;
  color?: string;
  repeats: number;
}

export interface ToolpathMetadata {
  color?: string;
  layer?: string;
  dip?: string;
}

export function encodeMarkerValue(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

export function metadataKey(meta: ToolpathMetadata): string {
  return [meta.color ?? "", meta.layer ?? "", meta.dip ?? ""].join("|");
}

export function emitTfMarker(lines: string[], meta: ToolpathMetadata): void {
  const tokens = [";@tf", "v=1"];
  if (meta.color) tokens.push(`color=${encodeMarkerValue(meta.color)}`);
  if (meta.layer) tokens.push(`layer=${encodeMarkerValue(meta.layer)}`);
  if (meta.dip) tokens.push(`dip=${encodeMarkerValue(meta.dip)}`);
  lines.push(tokens.join(" "));
}
