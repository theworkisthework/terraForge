import type { BitmapRendererSettings } from "../../../../types";
import {
  amplitudeField,
  defineToneSpineRenderer,
  spacingField,
  toothWidthField,
} from "./toneSpine/defineToneSpineRenderer";
import { generateLineFamilyStrands } from "./toneSpine/lineFamily";
import type { RendererContext } from "./types";

export const ISOMETRIC_GRID_RENDERER_ID = "isometric-grid";

const SIXTY_DEGREES = Math.PI / 3;

/**
 * Three families of parallel lines, each the same `generateLineFamilyStrands`
 * the raster-lines renderer uses for one, run 60° apart around `angleDeg` so
 * they overlap into a triangular grid — every line still carries the same
 * origin-anchored spacing and tone-driven waveform as a single raster family.
 */
export const isometricGridRenderer = defineToneSpineRenderer({
  id: ISOMETRIC_GRID_RENDERER_ID,
  label: "Isometric grid",
  revision: 1,
  fields: [spacingField("Line spacing (mm)"), toothWidthField(), amplitudeField()],
  defaults: { spacingMM: 3, toothWidthMM: 4, amplitudeMM: 1 },
  strands: (geometry) =>
    [0, SIXTY_DEGREES, 2 * SIXTY_DEGREES].flatMap((offset) =>
      generateLineFamilyStrands({ ...geometry, angleRad: geometry.angleRad + offset }),
    ),
});

export const isometricGridDefaults: BitmapRendererSettings = isometricGridRenderer.defaults;

export function generateIsometricGridPath(context: RendererContext): string {
  return isometricGridRenderer.render(context).layers[0].d;
}
