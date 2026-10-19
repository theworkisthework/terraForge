import type { BitmapColorData } from "./bitmapImage";
import type { RendererSource, SvgImport } from "../../../../types";
import { unmixInks, type InkColour } from "./inkUnmixing";

export type SeparationMode = NonNullable<SvgImport["bitmapSeparationMode"]>;

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
 * black/needs-ink, 255 is white/no-ink (see `toneSpine/sampling`'s `luminanceAt`).
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

/**
 * Red, green and blue as light inks on dark paper — additive, like light:
 * each ink's density is how much of its primary the pixel has, so white
 * gets all three at full strength and black gets none. Right for light,
 * metallic or gel inks on black card; on white paper it inverts the image,
 * which is what `separateRGBOnWhite` is for.
 */
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

/**
 * Red, green and blue pens on white paper, solved by ink unmixing (see
 * `inkUnmixing.ts`): the mix of the three that, multiplied onto white, comes
 * closest to each pixel. On paper a pen works by absorbing light — a red pen
 * reflects red and absorbs green and blue — so white needs no ink, a pure red
 * only the red pen, and black any two pens at full strength.
 *
 * Red, green and blue pens cannot mix every colour on paper: a yellow, for
 * instance, comes out as a dull mix of red and green. For the widest range on
 * white paper, CMY/CMYK remain the better choice.
 */
export function separateRGBOnWhite(image: BitmapColorData): SeparatedChannel[] {
  return separateCustomPalette(image, [
    { label: "Red", color: "#ff0000" },
    { label: "Green", color: "#00ff00" },
    { label: "Blue", color: "#0000ff" },
  ]);
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

function parseHexColor(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((c) => c + c).join("")
    : normalized;
  const num = parseInt(expanded, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Any set of pens on white paper, solved by ink unmixing (see
 * `inkUnmixing.ts`): for each pixel, how much of each pen to lay down so that
 * together they look most like it. White gets no ink, a colour one pen can
 * draw gets that pen, and a colour no mix can reach gets the nearest mix
 * there is.
 */
export function separateCustomPalette(
  image: BitmapColorData,
  palette: CustomPaletteSwatch[],
  paper = "#ffffff",
): SeparatedChannel[] {
  const coverages = unmixInks(image.rgba, image.width * image.height, palette.map((swatch) => inkColour(swatch.color)), inkColour(paper));
  return palette.map((swatch, index) => ({
    label: swatch.label,
    color: swatch.color,
    luminance: densityToLuminanceInPlace(coverages[index], image.width, image.height),
  }));
}

function inkColour(hex: string): InkColour {
  return parseHexColor(hex).map((v) => v / 255) as unknown as InkColour;
}

/** The paper each mode is made for, when no page says otherwise. */
export function defaultPaperFor(mode: Exclude<SeparationMode, "none">): string {
  return mode === "rgb" ? "#000000" : "#ffffff";
}

/** The pens each mode separates into. */
function inksFor(mode: Exclude<SeparationMode, "none">, palette: CustomPaletteSwatch[]): CustomPaletteSwatch[] {
  const rgb = [
    { label: "Red", color: "#ff0000" },
    { label: "Green", color: "#00ff00" },
    { label: "Blue", color: "#0000ff" },
  ];
  const cmy = [
    { label: "Cyan", color: "#00ffff" },
    { label: "Magenta", color: "#ff00ff" },
    { label: "Yellow", color: "#ffff00" },
  ];
  if (mode === "rgb" || mode === "rgb-white") return rgb;
  if (mode === "cmy") return cmy;
  if (mode === "cmyk") return [...cmy, { label: "Black", color: "#000000" }];
  return palette;
}

/**
 * Separates an image into the inks of `mode`, for `paper` (by default, the
 * paper the mode is made for). On its own paper each mode keeps its exact
 * formula; on any other paper — cream stock, black card — the mode's pens
 * are unmixed against it, so the inks make up for the paper's own colour,
 * and on dark paper light pens add light where the image is bright.
 */
export function separateColours(
  image: BitmapColorData,
  mode: Exclude<SeparationMode, "none">,
  palette: CustomPaletteSwatch[] = [],
  paper: string = defaultPaperFor(mode),
): SeparatedChannel[] {
  if (paper.toLowerCase() !== defaultPaperFor(mode)) return separateCustomPalette(image, inksFor(mode, palette), paper);
  return mode === "rgb" ? separateRGB(image)
    : mode === "rgb-white" ? separateRGBOnWhite(image)
    : mode === "cmy" ? separateCMY(image)
    : mode === "cmyk" ? separateCMYK(image)
    : separateCustomPalette(image, palette);
}
