import type { RendererDot, SvgImport, SvgPath } from "../../../../types";
import { useBitmapPluginStore } from "../../store/bitmapPluginStore";
import { coerceSettings } from "./coerceSettings";
import { levelSource, resolveToneSettings, smoothingRadius } from "./toneAdjust";
import { separateCMY, separateCMYK, separateCustomPalette, separateRGB } from "./colourSeparation";
import { findBitmapRenderer, getBitmapRenderer } from "./registry";
import { runRenderer, smoothInWorker } from "./rendererPool";
import type { ValidatedLayer } from "./validatePath";
import type { BitmapRendererDefinition, RendererSource } from "./types";

export function dataUrlFromBytes(bytes: Uint8Array, mimeType: string): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * Decoding a data URL costs an Image load, a canvas draw and a full pixel
 * readback — tens of milliseconds and tens of megabytes for a large photo.
 * A bitmap's source never changes for the life of an import, but every
 * settings change re-renders it, so without this every slider nudge paid for
 * a fresh decode of the same image.
 *
 * One entry: renders come from whichever import is currently selected, so a
 * second slot buys little while each entry holds a whole RGBA readback. The
 * cached ImageData is shared with every caller and must be treated as
 * read-only.
 */
let decodeCache: { dataUrl: string; image: ImageData } | null = null;

/** Drops the cached decode and prepared sources. Exported for tests; both
 * caches self-evict otherwise. */
export function clearBitmapDecodeCache(): void {
  decodeCache = null;
  smoothedCache = null;
  preparedCache = null;
}

async function decodeToImageData(dataUrl: string): Promise<ImageData> {
  if (decodeCache?.dataUrl === dataUrl) return decodeCache.image;
  if (typeof Image === "undefined" || typeof document === "undefined") {
    throw new Error("Bitmap decoding is unavailable in this environment.");
  }
  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not decode bitmap image."));
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) {
    throw new Error("Could not read bitmap image pixels.");
  }
  context.drawImage(image, 0, 0);
  const decoded = context.getImageData(0, 0, canvas.width, canvas.height);
  decodeCache = { dataUrl, image: decoded };
  return decoded;
}

export async function decodeBitmapLuminance(dataUrl: string): Promise<RendererSource> {
  const { data, width, height } = await decodeToImageData(dataUrl);
  const values = new Uint8Array(width * height);
  for (let index = 0; index < values.length; index++) {
    const offset = index * 4;
    const alpha = data[offset + 3] / 255;
    values[index] = Math.round(
      (data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722) * alpha +
        255 * (1 - alpha),
    );
  }
  return { width, height, values };
}

/** Full-colour decode for colour separation — unlike `decodeBitmapLuminance`,
 * keeps R/G/B rather than collapsing to a single tone. Alpha is flattened
 * onto white using the same convention as the luminance decode (transparent
 * = no ink), so a fully-transparent pixel reads as white in every channel. */
export interface BitmapColorData {
  width: number;
  height: number;
  /** Interleaved RGBA, 4 bytes per pixel, alpha already flattened to opaque. */
  rgba: Uint8Array;
}

export async function decodeBitmapColor(dataUrl: string): Promise<BitmapColorData> {
  const { data, width, height } = await decodeToImageData(dataUrl);
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    const alpha = data[offset + 3] / 255;
    rgba[offset] = Math.round(data[offset] * alpha + 255 * (1 - alpha));
    rgba[offset + 1] = Math.round(data[offset + 1] * alpha + 255 * (1 - alpha));
    rgba[offset + 2] = Math.round(data[offset + 2] * alpha + 255 * (1 - alpha));
    rgba[offset + 3] = 255;
  }
  return { width, height, rgba };
}

/**
 * Bump when a change in the shared pipeline around renderers — decoding,
 * settings coercion, separation, dot splitting — alters output for the same
 * inputs. Part of every stamp, so it invalidates all renderers at once.
 *
 * 2: tone shaping (smoothing, auto levels, contrast) runs on the source for
 *    every renderer, with smoothing on by default.
 */
export const BITMAP_PIPELINE_VERSION = 2;

/** What a render records about the code that produced it — compared against
 * the current stamp to spot output made by an older renderer. */
export function bitmapRendererStamp(renderer: Pick<BitmapRendererDefinition, "id" | "version">): string {
  return `${BITMAP_PIPELINE_VERSION}/${renderer.id}@${renderer.version}`;
}

export interface MaterializedBitmap {
  /** Legacy single-path fast path — populated only when separation is inactive ("none"). */
  bitmapRendererPath: string;
  /** One synthesized path per ink channel — populated only when separation is active. */
  paths: SvgPath[];
  /** `bitmapRendererStamp` of the renderer that produced this output. */
  rendererVersion?: string;
  /** Notes the renderer reported about this output. */
  warnings?: string[];
}

type MaterializableBitmap = Pick<
  SvgImport,
  | "id"
  | "bitmapDataUrl"
  | "bitmapRendererId"
  | "bitmapRendererSettings"
  | "bitmapBaseScale"
  | "bitmapSeparationMode"
  | "bitmapSeparationPalette"
  | "bitmapTone"
>;

/**
 * Identifies the inputs that determine a bitmap's rendered output, so the
 * panel can tell "already rendered with exactly these settings" apart from
 * "needs rendering". Without it, merely selecting a bitmap layer re-ran the
 * renderer and wrote the result back, which for a plugin means a sandbox
 * round trip and a document marked dirty for no change at all.
 *
 * `bitmapDataUrl` is fixed for the life of an import, so its length stands in
 * for the image rather than hashing megabytes on every check. Settings keys
 * are sorted so that a bag rebuilt in a different order still compares equal.
 */
export function bitmapRenderSignature(bitmap: MaterializableBitmap): string {
  const settings = bitmap.bitmapRendererSettings ?? {};
  return JSON.stringify([
    bitmap.bitmapDataUrl?.length ?? 0,
    bitmap.bitmapRendererId ?? "",
    Object.keys(settings)
      .sort()
      .map((key) => [key, settings[key]]),
    bitmap.bitmapBaseScale ?? null,
    bitmap.bitmapSeparationMode ?? "none",
    bitmap.bitmapSeparationPalette ?? [],
    // Appended only once set, so every drawing saved before tone existed
    // keeps the signature it was stored with — otherwise all of them would
    // count as having changed settings, and re-render unasked on open.
    ...(bitmap.bitmapTone ? [Object.entries(bitmap.bitmapTone).sort(([a], [b]) => a.localeCompare(b))] : []),
  ]);
}

/** One ink layer of a renderer's output, as a path the rest of the app understands. */
function inkPath(
  importId: string,
  suffix: string,
  d: string,
  label: string | undefined,
  color: string | undefined,
): SvgPath {
  return {
    id: `${importId}-ink-${suffix}`,
    d,
    svgSource: "",
    visible: true,
    label: label ?? `Layer ${suffix}`,
    hasFill: false,
    strokeColor: color,
    sourceColor: color,
    sourceOutlineVisible: true,
    outlineVisible: true,
  };
}

/**
 * One `SvgPath` per dot a renderer returned, each fillable and plot-tappable
 * at the point the renderer gave for it — so the existing hatch-fill and
 * plot-points features work on dots unmodified. `idPrefix` keeps one ink's
 * or layer's dots apart from another's; `color`/`label` tag each dot with its
 * ink, the same way `inkPath` tags a whole layer.
 */
export function dotPaths(
  importId: string,
  dots: RendererDot[],
  options: { idPrefix?: string; color?: string; label?: string } = {},
): SvgPath[] {
  const { idPrefix = "dot", color, label } = options;
  return dots.map((dot, index) => ({
    id: `${importId}-${idPrefix}-${index}`,
    d: dot.d,
    svgSource: "",
    visible: true,
    hasFill: true,
    fillColor: color,
    strokeColor: color,
    sourceColor: color,
    sourceOutlineVisible: true,
    outlineVisible: true,
    label,
    pointTap: { x: dot.x, y: dot.y },
  }));
}

/** The stroked part and the dots of one validated layer, as document paths.
 * `ids` names the stroke (`ink-<stroke>`) and prefixes the dots. */
function layerPaths(
  importId: string,
  ids: { stroke: string; dots: string },
  layer: ValidatedLayer,
  label: string | undefined,
  color: string | undefined,
): SvgPath[] {
  return [
    ...(layer.d ? [inkPath(importId, ids.stroke, layer.d, label, color)] : []),
    ...dotPaths(importId, layer.dots, { idPrefix: ids.dots, color, label }),
  ];
}

/**
 * Turns a bitmap import into plottable geometry, in one of two shapes:
 * - Legacy single path: no separation, and the renderer returned one
 *   unnamed stroke and no dots — the original, and still the common, case.
 * - `SvgPath`s otherwise: one per stroked layer (per ink under separation)
 *   and one per dot, tagged with label and colour so the existing
 *   colour-group/layer-group machinery built for SVG imports picks them up
 *   unmodified.
 *
 * The renderer itself never changes between these cases — separation is a
 * fan-out one level above `render()`, not a different rendering mode.
 */
export async function materializeBitmapLayers(
  bitmap: MaterializableBitmap,
  options: { signal?: AbortSignal } = {},
): Promise<MaterializedBitmap> {
  if (!bitmap.bitmapDataUrl) return { bitmapRendererPath: "", paths: [] };

  const pluginManifests = useBitmapPluginStore.getState().plugins;
  // An unset id is a legacy/new-import case where defaulting to
  // spiral-amplitude is correct; a *set but unresolvable* id (e.g. an
  // uninstalled plugin) must fail loudly rather than silently render with a
  // different renderer than the one the import was created with.
  const renderer = bitmap.bitmapRendererId
    ? findBitmapRenderer(bitmap.bitmapRendererId, pluginManifests)
    : getBitmapRenderer(undefined, pluginManifests);
  if (!renderer) {
    throw new Error(`Bitmap renderer "${bitmap.bitmapRendererId}" is not installed.`);
  }

  return {
    ...(await renderWith(renderer, bitmap, bitmap.bitmapDataUrl, options.signal)),
    rendererVersion: bitmapRendererStamp(renderer),
  };
}

/** One tone-shaped source a renderer runs against — the whole image, or one
 * ink channel of a colour separation. */
interface PreparedSource {
  label: string;
  color: string;
  source: RendererSource;
}

/**
 * Decoding to tone, separating into inks and tone-shaping are a full pass
 * (or several) over the image — the blur alone is hundreds of milliseconds
 * on a large photo — yet none of it depends on the renderer or its settings,
 * which is what nearly every re-render changes. One entry, for the same
 * reason as `decodeCache`; the sources are shared and must be treated as
 * read-only by every renderer.
 */
let preparedCache: { dataUrl: string; key: string; sources: PreparedSource[] } | null = null;

/**
 * The step below `preparedCache`: sources decoded, separated and smoothed,
 * but not yet levelled. Smoothing is the costly part of tone shaping, so a
 * change to auto levels or contrast alone reuses this and pays only for a
 * lookup pass.
 */
let smoothedCache: { dataUrl: string; key: string; sources: PreparedSource[] } | null = null;

async function smoothedSources(
  bitmap: MaterializableBitmap,
  dataUrl: string,
  smoothingMM: number,
  signal: AbortSignal | undefined,
): Promise<PreparedSource[]> {
  const baseScale = bitmap.bitmapBaseScale ?? 25.4 / 96;
  const mode = bitmap.bitmapSeparationMode ?? "none";
  const key = JSON.stringify([mode, mode === "custom" ? bitmap.bitmapSeparationPalette ?? [] : null, smoothingMM, baseScale]);
  if (smoothedCache?.dataUrl === dataUrl && smoothedCache.key === key) return smoothedCache.sources;

  // The blur runs in the worker pool; with no blur to do, skip the trip.
  const smooth = (source: RendererSource) =>
    smoothingRadius(smoothingMM, 1 / baseScale) < 1
      ? Promise.resolve(source)
      : smoothInWorker(source, smoothingMM, 1 / baseScale, signal);
  let sources: PreparedSource[];
  if (mode === "none") {
    sources = [{ label: "", color: "", source: await smooth(await decodeBitmapLuminance(dataUrl)) }];
  } else {
    const colorData = await decodeBitmapColor(dataUrl);
    const channels =
      mode === "rgb" ? separateRGB(colorData)
      : mode === "cmy" ? separateCMY(colorData)
      : mode === "cmyk" ? separateCMYK(colorData)
      : separateCustomPalette(colorData, bitmap.bitmapSeparationPalette ?? []);
    sources = await Promise.all(
      channels.map(async ({ label, color, luminance }) => ({ label, color, source: await smooth(luminance) })),
    );
  }

  smoothedCache = { dataUrl, key, sources };
  return sources;
}

async function preparedSources(
  bitmap: MaterializableBitmap,
  dataUrl: string,
  signal: AbortSignal | undefined,
): Promise<PreparedSource[]> {
  const tone = resolveToneSettings(bitmap);
  const key = JSON.stringify([
    bitmap.bitmapSeparationMode ?? "none",
    bitmap.bitmapSeparationMode === "custom" ? bitmap.bitmapSeparationPalette ?? [] : null,
    tone,
    bitmap.bitmapBaseScale ?? 25.4 / 96,
  ]);
  if (preparedCache?.dataUrl === dataUrl && preparedCache.key === key) return preparedCache.sources;

  const smoothed = await smoothedSources(bitmap, dataUrl, tone.smoothingMM, signal);
  const sources = smoothed.map((channel) => ({ ...channel, source: levelSource(channel.source, tone) }));
  preparedCache = { dataUrl, key, sources };
  return sources;
}

/** The rendering half of `materializeBitmapLayers`, once a renderer is resolved. */
async function renderWith(
  renderer: BitmapRendererDefinition,
  bitmap: MaterializableBitmap,
  dataUrl: string,
  signal: AbortSignal | undefined,
): Promise<MaterializedBitmap> {
  const settings = coerceSettings(renderer.fields, renderer.defaults, bitmap.bitmapRendererSettings);
  const baseScale = bitmap.bitmapBaseScale ?? 25.4 / 96;
  const mode = bitmap.bitmapSeparationMode ?? "none";

  const render = async (source: RendererSource) => {
    const context = { width: source.width, height: source.height, scale: baseScale, settings, source };
    return runRenderer(renderer, context, signal);
  };

  if (mode === "none") {
    const [{ source }] = await preparedSources(bitmap, dataUrl, signal);
    const { layers, warnings } = await render(source);

    // One unnamed stroke keeps the single-path representation; anything else
    // is projected the same way a colour separation is, so multi-pen and dot
    // output need no special case anywhere downstream.
    const [only] = layers;
    if (layers.length === 1 && only.label === undefined && only.color === undefined && only.dots.length === 0) {
      return { bitmapRendererPath: only.d, paths: [], warnings };
    }
    return {
      bitmapRendererPath: "",
      paths: layers.flatMap((layer, index) =>
        layerPaths(
          bitmap.id,
          { stroke: `${index}`, dots: layers.length === 1 ? "dot" : `dot-${index}` },
          layer,
          layer.label,
          layer.color,
        ),
      ),
      warnings,
    };
  }

  const channels = await preparedSources(bitmap, dataUrl, signal);
  const suffixFor = (layerCount: number, index: number, layerIndex: number) =>
    layerCount === 1 ? `${index}` : `${index}-${layerIndex}`;
  const perChannel = await Promise.all(channels.map((channel) => render(channel.source)));

  // A renderer may itself split a channel into several layers, so the ink
  // channel and the renderer's own layer both contribute to the name and
  // colour — the channel says which ink, the layer says which part of it.
  const paths = perChannel.flatMap(({ layers }, index) =>
    layers.flatMap((layer, layerIndex) =>
      layerPaths(
        bitmap.id,
        // Namespaced per ink so two channels' paths never collide on id.
        { stroke: suffixFor(layers.length, index, layerIndex), dots: `ink-${suffixFor(layers.length, index, layerIndex)}` },
        layer,
        layer.label ? `${channels[index].label} · ${layer.label}` : channels[index].label,
        layer.color ?? channels[index].color,
      ),
    ),
  );
  const warnings = [
    ...new Set(perChannel.flatMap(({ warnings }, index) => warnings.map((warning) => `${channels[index].label}: ${warning}`))),
  ];

  return { bitmapRendererPath: "", paths, warnings };
}
