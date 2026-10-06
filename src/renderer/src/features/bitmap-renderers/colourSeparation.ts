import type { RendererSource } from "./types";
import type { BitmapColorData } from "./bitmapImage";

export interface SeparatedChannel {
  label: string;
  color: string;
  luminance: RendererSource;
}

export interface CustomPaletteSwatch {
  label: string;
  color: string;
}

/**
 * Renderers read `RendererSource` as standard photographic luminance — 0 is
 * black/needs-ink, 255 is white/no-ink (see spiralAmplitude's `luminanceAt`).
 * Separation instead reasons in ink "density" (0 = no ink, 255 = full ink)
 * since that's how each mode below is naturally expressed, so every mode
 * converts through this at the end to hand renderers the convention they
 * already expect — unmodified, whether in-tree or an external plugin.
 *
 * Inverts in place and hands back the same buffer. Each caller builds its
 * density array purely to convert it, and at full-resolution these arrays are
 * megabytes each — a separate output buffer per channel doubled the memory a
 * separation touched for no gain. The density array must not be read after
 * being passed here.
 */
function densityToLuminanceInPlace(
  density: Uint8Array,
  width: number,
  height: number,
): RendererSource {
  for (let i = 0; i < density.length; i++) density[i] = 255 - density[i];
  return { width, height, values: density };
}

/** Each primary is its own ink; density = how much of that primary is present. */
export function separateRGB(image: BitmapColorData): SeparatedChannel[] {
  const pixelCount = image.width * image.height;
  const channels: [string, string, number][] = [
    ["Red", "#ff0000", 0],
    ["Green", "#00ff00", 1],
    ["Blue", "#0000ff", 2],
  ];
  return channels.map(([label, color, offset]) => {
    const density = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) density[i] = image.rgba[i * 4 + offset];
    return { label, color, luminance: densityToLuminanceInPlace(density, image.width, image.height) };
  });
}

/** Standard subtractive complement of RGB: density(C) = 255-R, etc. */
export function separateCMY(image: BitmapColorData): SeparatedChannel[] {
  const pixelCount = image.width * image.height;
  const cyan = new Uint8Array(pixelCount);
  const magenta = new Uint8Array(pixelCount);
  const yellow = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const r = image.rgba[offset];
    const g = image.rgba[offset + 1];
    const b = image.rgba[offset + 2];
    cyan[i] = 255 - r;
    magenta[i] = 255 - g;
    yellow[i] = 255 - b;
  }
  return [
    { label: "Cyan", color: "#00ffff", luminance: densityToLuminanceInPlace(cyan, image.width, image.height) },
    { label: "Magenta", color: "#ff00ff", luminance: densityToLuminanceInPlace(magenta, image.width, image.height) },
    { label: "Yellow", color: "#ffff00", luminance: densityToLuminanceInPlace(yellow, image.width, image.height) },
  ];
}

/** CMY plus a naive 100% under-colour-removal black: K = min(C,M,Y), then
 * subtract K from each of C/M/Y. A simple, well-known approximation — not a
 * colour-managed separation. */
export function separateCMYK(image: BitmapColorData): SeparatedChannel[] {
  const pixelCount = image.width * image.height;
  const cyan = new Uint8Array(pixelCount);
  const magenta = new Uint8Array(pixelCount);
  const yellow = new Uint8Array(pixelCount);
  const black = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const cRaw = 255 - image.rgba[offset];
    const mRaw = 255 - image.rgba[offset + 1];
    const yRaw = 255 - image.rgba[offset + 2];
    const k = Math.min(cRaw, mRaw, yRaw);
    black[i] = k;
    cyan[i] = cRaw - k;
    magenta[i] = mRaw - k;
    yellow[i] = yRaw - k;
  }
  return [
    { label: "Cyan", color: "#00ffff", luminance: densityToLuminanceInPlace(cyan, image.width, image.height) },
    { label: "Magenta", color: "#ff00ff", luminance: densityToLuminanceInPlace(magenta, image.width, image.height) },
    { label: "Yellow", color: "#ffff00", luminance: densityToLuminanceInPlace(yellow, image.width, image.height) },
    { label: "Black", color: "#000000", luminance: densityToLuminanceInPlace(black, image.width, image.height) },
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
      luminance: densityToLuminanceInPlace(density, image.width, image.height),
    };
  });
}
