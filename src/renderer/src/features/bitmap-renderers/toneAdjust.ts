import type { BitmapRendererFieldSchema, BitmapRendererSettings, RendererSource, SvgImport } from "../../../../types";
import { coerceSettings } from "./coerceSettings";

/**
 * Tone shaping applied to the source image once, before any renderer sees it
 * — so every renderer, in-tree or plugin, gets the same controls, and none of
 * them has to implement them. Stored on the import (`SvgImport.bitmapTone`)
 * rather than in the renderer's settings bag, so switching renderer keeps the
 * tone and a plugin's own setting keys can never collide with these.
 */
export interface ToneSettings {
  /** Stretch tone to this image's own dark/light range (robust percentiles). */
  autoLevels: boolean;
  /** Push tone away from (above 1) or toward (below 1) mid-grey. */
  contrast: number;
  /** Blur size in mm (roughly the Gaussian sigma), damping grain and
   * single-pixel noise. 0 = off. */
  smoothingMM: number;
}

export const TONE_DEFAULTS: ToneSettings = {
  autoLevels: false,
  contrast: 1,
  smoothingMM: 0.5,
};

export const TONE_FIELDS: BitmapRendererFieldSchema[] = [
  { type: "boolean", key: "autoLevels", label: "Auto levels" },
  { type: "number", key: "contrast", label: "Contrast", min: 0.1, max: 3, step: 0.05 },
  { type: "number", key: "smoothingMM", label: "Smoothing (mm)", min: 0, max: 5, step: 0.1 },
];

/**
 * The tone settings an import renders with. Before tone was a pipeline step,
 * the tone-spine renderers kept `autoLevels`/`contrast` in their own settings
 * bag, so a drawing saved then is read from there until the user edits tone
 * and an explicit `bitmapTone` is written.
 */
export function resolveToneSettings(
  imp: Pick<SvgImport, "bitmapTone" | "bitmapRendererSettings">,
): ToneSettings {
  const legacy = imp.bitmapRendererSettings ?? {};
  const saved: Record<string, unknown> = imp.bitmapTone ?? {
    autoLevels: legacy.autoLevels,
    contrast: legacy.contrast,
  };
  return coerceSettings(TONE_FIELDS, TONE_DEFAULTS as unknown as BitmapRendererSettings, saved) as unknown as ToneSettings;
}

/** Fraction of pixels ignored at each end when finding the auto-levels
 * range, so a single dust speck or specular highlight cannot pin it. */
const LEVELS_CLIP_FRACTION = 0.005;

/** The luminance range auto levels stretches to 0–255, from a histogram. */
function levelsRange(values: Uint8Array): { low: number; high: number } {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < values.length; i++) histogram[values[i]]++;
  const clip = Math.floor(values.length * LEVELS_CLIP_FRACTION);

  let low = 0;
  for (let seen = 0; low < 255; low++) {
    seen += histogram[low];
    if (seen > clip) break;
  }
  let high = 255;
  for (let seen = 0; high > 0; high--) {
    seen += histogram[high];
    if (seen > clip) break;
  }
  return { low, high };
}

/**
 * One box-blur pass along rows (`stride` 1) or columns (`stride` width),
 * with the window shrunk at the image edges rather than padded — padding
 * with white would lighten every border, padding with the edge pixel would
 * over-weight it.
 */
function boxBlurPass(
  input: Float32Array,
  output: Float32Array,
  lines: number,
  length: number,
  lineStep: number,
  stride: number,
  radius: number,
): void {
  for (let line = 0; line < lines; line++) {
    const base = line * lineStep;
    let sum = 0;
    let count = 0;
    for (let i = 0; i <= Math.min(radius, length - 1); i++) {
      sum += input[base + i * stride];
      count++;
    }
    for (let i = 0; i < length; i++) {
      output[base + i * stride] = sum / count;
      const leaving = i - radius;
      const entering = i + radius + 1;
      if (leaving >= 0) {
        sum -= input[base + leaving * stride];
        count--;
      }
      if (entering < length) {
        sum += input[base + entering * stride];
        count++;
      }
    }
  }
}

/** Three box-blur passes per axis: a close, linear-time Gaussian stand-in. */
function blur(values: Float32Array, width: number, height: number, radius: number): Float32Array {
  let current: Float32Array = values;
  let scratch: Float32Array = new Float32Array(values.length);
  for (let pass = 0; pass < 3; pass++) {
    boxBlurPass(current, scratch, height, width, width, 1, radius);
    [current, scratch] = [scratch, current];
    boxBlurPass(current, scratch, width, height, 1, width, radius);
    [current, scratch] = [scratch, current];
  }
  return current;
}

/** The blur radius, in source pixels, a smoothing setting comes to; below 1 there is no blur. */
export function smoothingRadius(smoothingMM: number, pixelsPerMM: number): number {
  return Math.round(smoothingMM * pixelsPerMM);
}

/**
 * The smoothing half of tone shaping: a blur sized in mm. `pixelsPerMM`
 * converts it into source pixels; three passes of a box of radius r spread
 * like a Gaussian with sigma ≈ r, so the setting reads as that sigma. Returns
 * the input unchanged below one pixel of blur, and never mutates it.
 *
 * Kept separate from `levelSource` because it is by far the costlier half —
 * hundreds of milliseconds on a large photo against a single lookup pass —
 * so the pipeline caches its result and re-runs only levels and contrast
 * when those alone change.
 */
export function smoothSource(source: RendererSource, smoothingMM: number, pixelsPerMM: number): RendererSource {
  const radius = smoothingRadius(smoothingMM, pixelsPerMM);
  if (radius < 1) return source;
  const blurred = blur(Float32Array.from(source.values), source.width, source.height, radius);
  const values = new Uint8Array(blurred.length);
  for (let i = 0; i < blurred.length; i++) values[i] = Math.round(blurred[i]);
  return { width: source.width, height: source.height, values };
}

/**
 * The levels half of tone shaping: auto levels, then contrast, folded into a
 * single lookup table since both are per-value. Returns the input unchanged
 * when both are neutral, and never mutates it.
 */
export function levelSource(source: RendererSource, { autoLevels, contrast }: Pick<ToneSettings, "autoLevels" | "contrast">): RendererSource {
  if (!autoLevels && contrast === 1) return source;

  const { low, high } = autoLevels ? levelsRange(source.values) : { low: 0, high: 255 };
  const span = high > low ? high - low : 0;
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    // A flat image has no range to stretch, so it is left as it is.
    const levelled = span ? Math.min(1, Math.max(0, (v - low) / span)) : v / 255;
    const contrasted = Math.min(1, Math.max(0, (levelled - 0.5) * contrast + 0.5));
    lut[v] = Math.round(contrasted * 255);
  }

  const values = new Uint8Array(source.values.length);
  for (let i = 0; i < values.length; i++) values[i] = lut[source.values[i]];
  return { width: source.width, height: source.height, values };
}

/**
 * Applies tone shaping to a renderer's source: blur first (so auto levels
 * measures the image, not its noise), then auto levels, then contrast.
 * Returns the input unchanged when every setting is neutral, and never
 * mutates it otherwise.
 */
export function prepareSource(source: RendererSource, tone: ToneSettings, pixelsPerMM: number): RendererSource {
  return levelSource(smoothSource(source, tone.smoothingMM, pixelsPerMM), tone);
}
