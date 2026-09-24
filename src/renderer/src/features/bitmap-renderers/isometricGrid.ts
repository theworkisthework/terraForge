import type { BitmapRendererSettings } from "../../../../types";
import type { SpineStrand } from "./toneSpine/engine";
import { renderToneSpine } from "./toneSpine/engine";
import { angleField, DEFAULT_ANGLE_DEG, DEFAULT_ORIGIN_PCT, originFields, waveformField } from "./toneSpine/fields";
import { generateLineFamilyStrands } from "./toneSpine/lineFamily";
import { DEFAULT_WAVEFORM, type WaveformId } from "./toneSpine/waveforms";
import type { BitmapRendererDefinition, RendererContext } from "./types";

export const ISOMETRIC_GRID_RENDERER_ID = "isometric-grid";

export const isometricGridDefaults: BitmapRendererSettings = {
  spacingMM: 3,
  toothWidthMM: 4,
  amplitudeMM: 1,
  waveform: DEFAULT_WAVEFORM,
  angleDeg: DEFAULT_ANGLE_DEG,
  originXPct: DEFAULT_ORIGIN_PCT,
  originYPct: DEFAULT_ORIGIN_PCT,
};

const SIXTY_DEGREES = Math.PI / 3;

/**
 * Three families of parallel lines, each the same `generateLineFamilyStrands`
 * the raster-lines renderer uses for one, run 60° apart around `angleDeg` so
 * they overlap into a triangular grid — every line still carries the same
 * origin-anchored spacing and tone-driven waveform as a single raster family.
 */
export function generateIsometricGridPath({ source, settings, scale, width, height }: RendererContext): string {
  if (!source || width < 1 || height < 1 || source.values.length === 0) return "";

  const pixelsPerMM = 1 / Math.max(scale, 0.001);
  const spacingMM = Math.max(0.1, Math.min(Number(settings.spacingMM), 20));
  const spacing = Math.max(spacingMM * pixelsPerMM, 0.1);
  const toothWidth = Math.max(0.1, Math.min(Number(settings.toothWidthMM), 20)) * pixelsPerMM;
  const amplitude = Math.max(0, Math.min(Number(settings.amplitudeMM), 10)) * pixelsPerMM;
  const waveform = (settings.waveform as WaveformId) ?? DEFAULT_WAVEFORM;
  const angleRad = (Number(settings.angleDeg ?? DEFAULT_ANGLE_DEG) * Math.PI) / 180;
  const originX = (Number(settings.originXPct ?? DEFAULT_ORIGIN_PCT) / 100) * source.width;
  const originY = (Number(settings.originYPct ?? DEFAULT_ORIGIN_PCT) / 100) * source.height;
  const targetSegmentLength = toothWidth / 4;

  const strands: SpineStrand[] = [0, SIXTY_DEGREES, 2 * SIXTY_DEGREES].flatMap((offset) =>
    generateLineFamilyStrands({
      originX,
      originY,
      angleRad: angleRad + offset,
      spacing,
      width: source.width,
      height: source.height,
      targetSegmentLength,
    }),
  );

  return renderToneSpine(strands, { toothWidth, amplitude, waveform, image: source });
}

export const isometricGridRenderer: BitmapRendererDefinition = {
  id: ISOMETRIC_GRID_RENDERER_ID,
  label: "Isometric grid",
  defaults: isometricGridDefaults,
  fields: [
    { type: "number", key: "spacingMM", label: "Line spacing (mm)", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "toothWidthMM", label: "Tooth width (mm)", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "amplitudeMM", label: "Amplitude (mm)", min: 0, max: 10, step: 0.1 },
    waveformField(),
    angleField(),
    ...originFields(),
  ],
  render: generateIsometricGridPath,
};
