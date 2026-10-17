import type {
  BitmapRendererFieldSchema,
  BitmapRendererNumberFieldSchema,
  BitmapRendererSettings,
  RendererContext,
} from "../../../../../types";
import { coerceSettings } from "../coerceSettings";
import {
  angleField,
  clipToImageField,
  DEFAULT_ANGLE_DEG,
  DEFAULT_CLIP_TO_IMAGE,
  DEFAULT_ORIGIN_PCT,
  DEFAULT_PEAK_CLIP_PCT,
  originFields,
  peakClipField,
} from "../sharedFields";
import type { BitmapRendererDefinition } from "../types";
import { renderToneSpine, TONE_SPINE_ENGINE_VERSION, type SpineStrand } from "./engine";
import { waveformField } from "./fields";
import { DEFAULT_WAVEFORM, type WaveformId } from "./waveforms";

/**
 * Everything a tone-spine renderer's strand generator needs, already
 * converted from the user's mm/percent/degree settings into source pixels and
 * radians — so a generator is pure geometry.
 */
export interface SpineGeometry {
  /** Source image size, in pixels. */
  width: number;
  height: number;
  pixelsPerMM: number;
  /** Gap between neighbouring strands, in pixels — for renderers with a `spacingMM` field. */
  spacing: number;
  /** Where base points should sit along a strand: a quarter tooth apart, so
   * every waveform period keeps its peaks and baseline crossings. */
  targetSegmentLength: number;
  originX: number;
  originY: number;
  angleRad: number;
  /** Distance from the origin to the farthest image corner — how far a
   * pattern radiating from the origin must reach to cover the image. */
  maxRadius: number;
  /** Reports something the user should know about this render — e.g. a
   * generator stopping at its own size cap. */
  warn(message: string): void;
}

/** What a tone-spine renderer returns: always a single stroked layer. */
export interface ToneSpineResult {
  layers: [{ d: string }];
  warnings: string[];
}

const TRUNCATED_WARNING =
  "Output was cut short at the point limit. Increase the spacing or tooth width to draw the whole image.";

/** The standard spacing control, with a label naming what is being spaced. */
export function spacingField(label: string, ariaLabel?: string): BitmapRendererNumberFieldSchema {
  return { type: "number", key: "spacingMM", label, ariaLabel, min: 0.1, max: 50, step: 0.1 };
}

export function toothWidthField(ariaLabel?: string): BitmapRendererNumberFieldSchema {
  return { type: "number", key: "toothWidthMM", label: "Tooth width (mm)", ariaLabel, min: 0.1, max: 50, step: 0.1 };
}

export function amplitudeField(key = "amplitudeMM", ariaLabel?: string): BitmapRendererNumberFieldSchema {
  return { type: "number", key, label: "Amplitude (mm)", ariaLabel, min: 0, max: 50, step: 0.1 };
}

/** Removes `ariaLabel: undefined` so field objects stay identical to hand-written ones. */
function withoutUndefined<T extends object>(field: T): T {
  return Object.fromEntries(Object.entries(field).filter(([, value]) => value !== undefined)) as T;
}

export interface ToneSpineRendererSpec {
  id: string;
  label: string;
  /**
   * The renderer's own part of its `version`; the engine's version is added
   * automatically. Bump it when this renderer's strands change shape.
   */
  revision: number;
  /** This renderer's own leading controls (spacing, tooth width, amplitude,
   * and anything specific such as sides) in display order. The waveform,
   * angle, origin, clip and peak-clip controls every tone-spine renderer
   * shares are appended. */
  fields: BitmapRendererFieldSchema[];
  /** Defaults for `fields`; the shared controls' defaults are added. */
  defaults: BitmapRendererSettings;
  /** Settings key holding the amplitude in mm. */
  amplitudeKey?: string;
  /** The renderer's base curves, which the engine then tone-modulates. */
  strands(geometry: SpineGeometry, settings: BitmapRendererSettings): Iterable<SpineStrand>;
}

/**
 * Builds a complete tone-spine renderer from just its strand generator and
 * its own controls. The shared parts — controls, defaults, settings parsing,
 * unit conversion and the engine call — live here once rather than in every
 * renderer. Settings are coerced against the renderer's own schema, so a
 * renderer called directly (tests, tools) is as safe as one called through
 * the pipeline, and no generator ever sees an out-of-range value.
 */
export function defineToneSpineRenderer(
  spec: ToneSpineRendererSpec,
): BitmapRendererDefinition & { render: (context: RendererContext) => ToneSpineResult } {
  const amplitudeKey = spec.amplitudeKey ?? "amplitudeMM";
  const fields: BitmapRendererFieldSchema[] = [
    ...spec.fields.map(withoutUndefined),
    waveformField(),
    angleField(),
    ...originFields(),
    clipToImageField(),
    peakClipField(),
  ];
  const defaults: BitmapRendererSettings = {
    ...spec.defaults,
    waveform: DEFAULT_WAVEFORM,
    angleDeg: DEFAULT_ANGLE_DEG,
    originXPct: DEFAULT_ORIGIN_PCT,
    originYPct: DEFAULT_ORIGIN_PCT,
    clipToImage: DEFAULT_CLIP_TO_IMAGE,
    peakClipPct: DEFAULT_PEAK_CLIP_PCT,
  };

  const render = ({ source, settings: rawSettings, scale, width, height }: RendererContext): ToneSpineResult => {
    // A tone spine traces tone, so it has nothing to draw without a source.
    if (!source || width < 1 || height < 1 || source.values.length === 0) return { layers: [{ d: "" }], warnings: [] };
    const warnings: string[] = [];

    const settings = coerceSettings(fields, defaults, rawSettings);
    const pixelsPerMM = 1 / Math.max(scale, 0.001);
    const toothWidth = (settings.toothWidthMM as number) * pixelsPerMM;
    const originX = ((settings.originXPct as number) / 100) * source.width;
    const originY = ((settings.originYPct as number) / 100) * source.height;

    const geometry: SpineGeometry = {
      width: source.width,
      height: source.height,
      pixelsPerMM,
      spacing: Math.max(((settings.spacingMM as number | undefined) ?? 0) * pixelsPerMM, 0.1),
      targetSegmentLength: toothWidth / 4,
      originX,
      originY,
      angleRad: ((settings.angleDeg as number) * Math.PI) / 180,
      maxRadius: Math.max(
        Math.hypot(originX, originY),
        Math.hypot(source.width - originX, originY),
        Math.hypot(originX, source.height - originY),
        Math.hypot(source.width - originX, source.height - originY),
      ),
      warn: (message) => warnings.push(message),
    };

    const { d, truncated } = renderToneSpine(spec.strands(geometry, settings), {
      toothWidth,
      amplitude: (settings[amplitudeKey] as number) * pixelsPerMM,
      waveform: settings.waveform as WaveformId,
      image: source,
      clipToImage: settings.clipToImage as boolean,
      peakClipPct: settings.peakClipPct as number,
    });
    if (truncated) warnings.push(TRUNCATED_WARNING);
    return { layers: [{ d }], warnings };
  };

  return {
    id: spec.id,
    label: spec.label,
    version: `tone-spine-${TONE_SPINE_ENGINE_VERSION}.${spec.revision}`,
    defaults,
    fields,
    render,
  };
}
