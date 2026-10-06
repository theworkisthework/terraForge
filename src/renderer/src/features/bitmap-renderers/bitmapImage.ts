import type { SvgImport, SvgPath } from "../../../../types";
import { useBitmapPluginStore } from "../../store/bitmapPluginStore";
import { separateCMY, separateCMYK, separateCustomPalette, separateRGB } from "./colourSeparation";
import { findBitmapRenderer, getBitmapRenderer } from "./registry";
import { validateRendererOutput } from "./validatePath";
import type { RendererSource } from "./types";

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

/** Drops the cached decode. Exported for tests; the cache self-evicts otherwise. */
export function clearBitmapDecodeCache(): void {
  decodeCache = null;
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

export interface MaterializedBitmap {
  /** Legacy single-path fast path — populated only when separation is inactive ("none"). */
  bitmapRendererPath: string;
  /** One synthesized path per ink channel — populated only when separation is active. */
  paths: SvgPath[];
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
 * Splits a dot-producing renderer's output into one `SvgPath` per dot, each
 * fillable and plot-tappable at its own centre — see
 * `BitmapRendererDefinition.producesDots`. Splits on subpath boundaries
 * (`M`) rather than parsing the path grammar: valid because a `producesDots`
 * renderer emits only closed `M...L...Z` polylines, never curves or arcs.
 * Each dot's centre is the mean of its own vertices, which is exact for an
 * evenly-sampled circle — the symmetric points average to the true centre —
 * so no separate centroid geometry is needed.
 *
 * `idPrefix` distinguishes one channel's dots from another's when a
 * colour-separated render calls this once per channel (default `"dot"` for
 * the single-channel case); `color`/`label` tag each dot with its ink, the
 * same way `inkPath` tags a whole separated layer.
 */
export function splitDotPaths(
  importId: string,
  d: string,
  options: { idPrefix?: string; color?: string; label?: string } = {},
): SvgPath[] {
  const { idPrefix = "dot", color, label } = options;
  const subpaths = d.split(/(?=M)/).map((s) => s.trim()).filter(Boolean);
  return subpaths.map((subpath, index) => {
    const coords = (subpath.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let i = 0; i + 1 < coords.length; i += 2) {
      sumX += coords[i];
      sumY += coords[i + 1];
      count++;
    }
    return {
      id: `${importId}-${idPrefix}-${index}`,
      d: subpath,
      svgSource: "",
      visible: true,
      hasFill: true,
      fillColor: color,
      strokeColor: color,
      sourceColor: color,
      sourceOutlineVisible: true,
      outlineVisible: true,
      label,
      pointTap: count > 0 ? { x: sumX / count, y: sumY / count } : undefined,
    };
  });
}

/**
 * Turns a bitmap import into plottable geometry. Three shapes, depending on
 * the renderer and whether colour separation is active:
 * - Legacy single path: no separation, and the renderer's output is one
 *   continuous stroke (`producesDots` unset) — today's original behaviour.
 * - One `SvgPath` per ink channel: separation active, non-dot renderer —
 *   tagged with that ink's colour so the existing colour-group/layer-group
 *   machinery (built for SVG imports) picks them up unmodified.
 * - One `SvgPath` per dot (optionally further split per ink channel under
 *   separation): a `producesDots` renderer, via `splitDotPaths` — each dot
 *   independently fillable and plot-tappable.
 *
 * The renderer itself never changes between these cases — separation and dot
 * splitting are both a fan-out one level above `render()`, not a different
 * rendering mode.
 */
export async function materializeBitmapLayers(bitmap: MaterializableBitmap): Promise<MaterializedBitmap> {
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

  const settings = { ...renderer.defaults, ...bitmap.bitmapRendererSettings };
  const baseScale = bitmap.bitmapBaseScale ?? 25.4 / 96;
  const mode = bitmap.bitmapSeparationMode ?? "none";

  if (mode === "none") {
    const source = await decodeBitmapLuminance(bitmap.bitmapDataUrl);
    const layers = validateRendererOutput(
      await renderer.render({
        width: source.width,
        height: source.height,
        scale: baseScale,
        settings,
        source,
      }),
      renderer.id,
    );

    // A renderer that returned one unnamed path keeps the single-path
    // representation; one that returned named layers is projected the same
    // way a colour separation is, so multi-pen output needs no special case
    // anywhere downstream.
    if (layers.length === 1 && layers[0].label === undefined && layers[0].color === undefined) {
      if (renderer.producesDots) {
        return { bitmapRendererPath: "", paths: splitDotPaths(bitmap.id, layers[0].d) };
      }
      return { bitmapRendererPath: layers[0].d, paths: [] };
    }
    return {
      bitmapRendererPath: "",
      paths: layers.map((layer, index) => inkPath(bitmap.id, `${index}`, layer.d, layer.label, layer.color)),
    };
  }

  const colorData = await decodeBitmapColor(bitmap.bitmapDataUrl);
  const channels =
    mode === "rgb" ? separateRGB(colorData)
    : mode === "cmy" ? separateCMY(colorData)
    : mode === "cmyk" ? separateCMYK(colorData)
    : separateCustomPalette(colorData, bitmap.bitmapSeparationPalette ?? []);

  const perChannel = await Promise.all(
    channels.map(async (channel, index) => ({
      channel,
      index,
      layers: validateRendererOutput(
        await renderer.render({
          width: channel.luminance.width,
          height: channel.luminance.height,
          scale: baseScale,
          settings,
          source: channel.luminance,
        }),
        renderer.id,
      ),
    })),
  );

  // A dot-producing renderer's per-channel output still needs splitting into
  // individually fillable/tappable dots, exactly as the non-separated case
  // does — just tagged with that channel's colour and label, and namespaced
  // per channel so two channels' dots never collide on id.
  if (renderer.producesDots) {
    const dotPaths = perChannel.flatMap(({ channel, index, layers }) =>
      layers.flatMap((layer, layerIndex) =>
        splitDotPaths(bitmap.id, layer.d, {
          idPrefix: layers.length === 1 ? `ink-${index}` : `ink-${index}-${layerIndex}`,
          color: layer.color ?? channel.color,
          label: layer.label ? `${channel.label} · ${layer.label}` : channel.label,
        }),
      ),
    );
    return { bitmapRendererPath: "", paths: dotPaths };
  }

  // A renderer may itself split a channel into several layers, so the ink
  // channel and the renderer's own layer both contribute to the name and
  // colour — the channel says which ink, the layer says which part of it.
  const paths = perChannel.flatMap(({ channel, index, layers }) =>
    layers.map((layer, layerIndex) =>
      inkPath(
        bitmap.id,
        layers.length === 1 ? `${index}` : `${index}-${layerIndex}`,
        layer.d,
        layer.label ? `${channel.label} · ${layer.label}` : channel.label,
        layer.color ?? channel.color,
      ),
    ),
  );

  return { bitmapRendererPath: "", paths };
}