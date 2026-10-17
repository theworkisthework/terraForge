import type { BitmapRendererSettings } from "../../../../types";
import {
  amplitudeField,
  defineToneSpineRenderer,
  spacingField,
  toothWidthField,
} from "./toneSpine/defineToneSpineRenderer";
import { generateLineFamilyStrands } from "./toneSpine/lineFamily";
import type { RendererContext } from "./types";

export const RASTER_LINES_RENDERER_ID = "raster-lines";

/**
 * Parallel lines perpendicular to `angleDeg` (0° = horizontal rows, 90° =
 * vertical columns, anything else = diagonal hatching), spaced evenly and
 * anchored so one line passes exactly through the origin point.
 */
export const rasterLinesRenderer = defineToneSpineRenderer({
  id: RASTER_LINES_RENDERER_ID,
  label: "Row & diagonal lines",
  revision: 1,
  fields: [spacingField("Line spacing (mm)"), toothWidthField(), amplitudeField()],
  defaults: { spacingMM: 2, toothWidthMM: 3, amplitudeMM: 1 },
  strands: (geometry) => generateLineFamilyStrands(geometry),
});

export const rasterLinesDefaults: BitmapRendererSettings = rasterLinesRenderer.defaults;

export function generateRasterLinesPath(context: RendererContext): string {
  return rasterLinesRenderer.render(context).layers[0].d;
}
