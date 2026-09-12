import type { SvgImport, SvgPath } from "../../../../../types";
import { useBitmapPluginStore } from "../../store/bitmapPluginStore";
import { separateCMY, separateCMYK, separateCustomPalette, separateRGB } from "./colourSeparation";
import { findBitmapRenderer, getBitmapRenderer } from "./registry";
import type { BitmapLuminance } from "./types";

export function dataUrlFromBytes(bytes: Uint8Array, mimeType: string): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function decodeToImageData(dataUrl: string): Promise<ImageData> {
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
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export async function decodeBitmapLuminance(dataUrl: string): Promise<BitmapLuminance> {
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
 * Turns a bitmap import into plottable geometry: either the legacy single
 * path (`bitmapSeparationMode` "none"/unset — today's behavior, unchanged)
 * or, when colour separation is active, one synthesized `SvgPath` per ink
 * channel, tagged with that ink's colour so the existing colour-group/
 * layer-group machinery (built for SVG imports) picks them up unmodified.
 *
 * The renderer itself never changes between these two cases — separation is
 * a fan-out one level above `render()`, not a different rendering mode.
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
    const luminance = await decodeBitmapLuminance(bitmap.bitmapDataUrl);
    const path = await renderer.render(luminance, settings, baseScale);
    return { bitmapRendererPath: path, paths: [] };
  }

  const colorData = await decodeBitmapColor(bitmap.bitmapDataUrl);
  const channels =
    mode === "rgb" ? separateRGB(colorData)
    : mode === "cmy" ? separateCMY(colorData)
    : mode === "cmyk" ? separateCMYK(colorData)
    : separateCustomPalette(colorData, bitmap.bitmapSeparationPalette ?? []);

  const paths = await Promise.all(
    channels.map(async (channel, index): Promise<SvgPath> => ({
      id: `${bitmap.id}-ink-${index}`,
      d: await renderer.render(channel.luminance, settings, baseScale),
      svgSource: "",
      visible: true,
      label: channel.label,
      hasFill: false,
      strokeColor: channel.color,
      sourceColor: channel.color,
      sourceOutlineVisible: true,
      outlineVisible: true,
    })),
  );

  return { bitmapRendererPath: "", paths };
}