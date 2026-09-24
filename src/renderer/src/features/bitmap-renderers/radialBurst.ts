import type { BitmapRendererSettings } from "../../../../types";
import { renderToneSpine, type SpineStrand } from "./toneSpine/engine";
import { angleField, DEFAULT_ANGLE_DEG, DEFAULT_ORIGIN_PCT, originFields, waveformField } from "./toneSpine/fields";
import { clipLineToRect } from "./toneSpine/lineFamily";
import { DEFAULT_WAVEFORM, type WaveformId } from "./toneSpine/waveforms";
import type { BitmapRendererDefinition, RendererContext } from "./types";

export const RADIAL_BURST_RENDERER_ID = "radial-burst";
const DEFAULT_RAY_COUNT = 36;

export const radialBurstDefaults: BitmapRendererSettings = {
  rayCount: DEFAULT_RAY_COUNT,
  toothWidthMM: 4,
  amplitudeMM: 1.5,
  waveform: DEFAULT_WAVEFORM,
  angleDeg: DEFAULT_ANGLE_DEG,
  originXPct: DEFAULT_ORIGIN_PCT,
  originYPct: DEFAULT_ORIGIN_PCT,
};

/**
 * One ray's base points, straight from the origin out to the image edge in
 * direction `dir`, with the tangential (perpendicular-to-ray) direction as
 * its normal — the same "amplitude displaces perpendicular to the spine"
 * convention every other tone-spine renderer uses, applied to a ray instead
 * of a ring or line family. A ray radiating outward with no perpendicular
 * wave would just be a straight spoke; this is what lets tone still modulate
 * it visibly.
 */
function generateRayStrand(
  originX: number,
  originY: number,
  dir: { x: number; y: number },
  normal: { x: number; y: number },
  length: number,
  targetSegmentLength: number,
): SpineStrand {
  const steps = Math.max(1, Math.ceil(length / Math.max(targetSegmentLength, 0.01)));
  const points: SpineStrand = [];
  for (let i = 0; i <= steps; i++) {
    const t = (length * i) / steps;
    points.push({ x: originX + t * dir.x, y: originY + t * dir.y, nx: normal.x, ny: normal.y });
  }
  return points;
}

/**
 * Straight rays fanning out from the origin at `rayCount` evenly spaced
 * angles, each clipped to the image bounds and tone-modulated tangentially —
 * `angleDeg` rotates where the first ray points.
 */
export function generateRadialBurstPath({ source, settings, scale, width, height }: RendererContext): string {
  if (!source || width < 1 || height < 1 || source.values.length === 0) return "";

  const pixelsPerMM = 1 / Math.max(scale, 0.001);
  const rayCount = Math.round(Math.max(3, Math.min(Number(settings.rayCount ?? DEFAULT_RAY_COUNT), 180)));
  const toothWidth = Math.max(0.1, Math.min(Number(settings.toothWidthMM), 20)) * pixelsPerMM;
  const amplitude = Math.max(0, Math.min(Number(settings.amplitudeMM), 10)) * pixelsPerMM;
  const waveform = (settings.waveform as WaveformId) ?? DEFAULT_WAVEFORM;
  const angleRad = (Number(settings.angleDeg ?? DEFAULT_ANGLE_DEG) * Math.PI) / 180;
  const originX = (Number(settings.originXPct ?? DEFAULT_ORIGIN_PCT) / 100) * source.width;
  const originY = (Number(settings.originYPct ?? DEFAULT_ORIGIN_PCT) / 100) * source.height;
  const targetSegmentLength = toothWidth / 4;

  const strands: SpineStrand[] = [];
  for (let i = 0; i < rayCount; i++) {
    const theta = angleRad + (i / rayCount) * Math.PI * 2;
    const dir = { x: Math.cos(theta), y: Math.sin(theta) };
    const normal = { x: -Math.sin(theta), y: Math.cos(theta) };
    const tRange = clipLineToRect({ x: originX, y: originY }, dir, source.width, source.height);
    if (!tRange) continue;
    // Only the outward half from the origin — the family already covers the
    // opposite direction as a separate ray at theta + π.
    const length = Math.max(0, tRange[1]);
    if (length <= 0) continue;
    strands.push(generateRayStrand(originX, originY, dir, normal, length, targetSegmentLength));
  }

  return renderToneSpine(strands, { toothWidth, amplitude, waveform, image: source });
}

export const radialBurstRenderer: BitmapRendererDefinition = {
  id: RADIAL_BURST_RENDERER_ID,
  label: "Radial burst",
  defaults: radialBurstDefaults,
  fields: [
    { type: "number", key: "rayCount", label: "Ray count", min: 3, max: 180, step: 1 },
    { type: "number", key: "toothWidthMM", label: "Tooth width (mm)", min: 0.1, max: 20, step: 0.1 },
    { type: "number", key: "amplitudeMM", label: "Amplitude (mm)", min: 0, max: 10, step: 0.1 },
    waveformField(),
    angleField(),
    ...originFields(),
  ],
  render: generateRadialBurstPath,
};
