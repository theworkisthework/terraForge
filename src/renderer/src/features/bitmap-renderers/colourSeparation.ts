import type { BitmapLuminance } from "./types";
import type { BitmapColorData } from "./bitmapImage";

export interface SeparatedChannel {
  label: string;
  color: string;
  luminance: BitmapLuminance;
}

export interface CustomPaletteSwatch {
  label: string;
  color: string;
}

/**
 * Renderers read `BitmapLuminance` as standard photographic luminance — 0 is
 * black/needs-ink, 255 is white/no-ink (see spiralAmplitude's `luminanceAt`).
 * Separation instead reasons in ink "density" (0 = no ink, 255 = full ink)
 * since that's how each mode below is naturally expressed, so every mode
 * converts through this at the end to hand renderers the convention they
 * already expect — unmodified, whether in-tree or an external plugin.
 */
function densityToLuminance(density: Uint8Array, width: number, height: number): BitmapLuminance {
  const values = new Uint8Array(density.length);
  for (let i = 0; i < density.length; i++) values[i] = 255 - density[i];
  return { width, height, values };
}

function extractChannel(rgba: Uint8Array, pixelCount: number, channelOffset: number): Uint8Array {
  const out = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) out[i] = rgba[i * 4 + channelOffset];
  return out;
}

/** Each primary is its own ink; density = how much of that primary is present. */
export function separateRGB(image: BitmapColorData): SeparatedChannel[] {
  const pixelCount = image.width * image.height;
  const channels: [string, string, number][] = [
    ["Red", "#ff0000", 0],
    ["Green", "#00ff00", 1],
    ["Blue", "#0000ff", 2],
  ];
  return channels.map(([label, color, offset]) => ({
    label,
    color,
    luminance: densityToLuminance(extractChannel(image.rgba, pixelCount, offset), image.width, image.height),
  }));
}

/** Standard subtractive complement of RGB: density(C) = 255-R, etc. */
export function separateCMY(image: BitmapColorData): SeparatedChannel[] {
  const pixelCount = image.width * image.height;
  const r = extractChannel(image.rgba, pixelCount, 0);
  const g = extractChannel(image.rgba, pixelCount, 1);
  const b = extractChannel(image.rgba, pixelCount, 2);
  const cyan = new Uint8Array(pixelCount);
  const magenta = new Uint8Array(pixelCount);
  const yellow = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    cyan[i] = 255 - r[i];
    magenta[i] = 255 - g[i];
    yellow[i] = 255 - b[i];
  }
  return [
    { label: "Cyan", color: "#00ffff", luminance: densityToLuminance(cyan, image.width, image.height) },
    { label: "Magenta", color: "#ff00ff", luminance: densityToLuminance(magenta, image.width, image.height) },
    { label: "Yellow", color: "#ffff00", luminance: densityToLuminance(yellow, image.width, image.height) },
  ];
}

/** CMY plus a naive 100% under-colour-removal black: K = min(C,M,Y), then
 * subtract K from each of C/M/Y. A simple, well-known approximation — not a
 * colour-managed separation. */
export function separateCMYK(image: BitmapColorData): SeparatedChannel[] {
  const pixelCount = image.width * image.height;
  const r = extractChannel(image.rgba, pixelCount, 0);
  const g = extractChannel(image.rgba, pixelCount, 1);
  const b = extractChannel(image.rgba, pixelCount, 2);
  const cyan = new Uint8Array(pixelCount);
  const magenta = new Uint8Array(pixelCount);
  const yellow = new Uint8Array(pixelCount);
  const black = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const cRaw = 255 - r[i];
    const mRaw = 255 - g[i];
    const yRaw = 255 - b[i];
    const k = Math.min(cRaw, mRaw, yRaw);
    black[i] = k;
    cyan[i] = cRaw - k;
    magenta[i] = mRaw - k;
    yellow[i] = yRaw - k;
  }
  return [
    { label: "Cyan", color: "#00ffff", luminance: densityToLuminance(cyan, image.width, image.height) },
    { label: "Magenta", color: "#ff00ff", luminance: densityToLuminance(magenta, image.width, image.height) },
    { label: "Yellow", color: "#ffff00", luminance: densityToLuminance(yellow, image.width, image.height) },
    { label: "Black", color: "#000000", luminance: densityToLuminance(black, image.width, image.height) },
  ];
}

const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 * 255);

function parseHexColor(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((c) => c + c).join("")
    : normalized;
  const num = parseInt(expanded, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Assigns each pixel a per-swatch ink density proportional to how close its
 * colour is to that swatch (closer = more ink), independently per swatch.
 * A simple proximity model, not a solved multi-ink mixing optimisation —
 * intentionally so; see the plan for why this stays simple in the first pass.
 */
export function separateCustomPalette(
  image: BitmapColorData,
  palette: CustomPaletteSwatch[],
): SeparatedChannel[] {
  const pixelCount = image.width * image.height;
  return palette.map((swatch) => {
    const [sr, sg, sb] = parseHexColor(swatch.color);
    const density = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      const dr = image.rgba[offset] - sr;
      const dg = image.rgba[offset + 1] - sg;
      const db = image.rgba[offset + 2] - sb;
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      density[i] = Math.max(0, Math.round(255 * (1 - distance / MAX_RGB_DISTANCE)));
    }
    return {
      label: swatch.label,
      color: swatch.color,
      luminance: densityToLuminance(density, image.width, image.height),
    };
  });
}
