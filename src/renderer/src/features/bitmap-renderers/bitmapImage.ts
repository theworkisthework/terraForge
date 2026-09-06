import type { SvgImport } from "../../../../../types";
import { getBitmapRenderer } from "./registry";
import type { BitmapLuminance } from "./spiralAmplitude";

export function dataUrlFromBytes(bytes: Uint8Array, mimeType: string): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export async function decodeBitmapLuminance(dataUrl: string): Promise<BitmapLuminance> {
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
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const values = new Uint8Array(canvas.width * canvas.height);
  for (let index = 0; index < values.length; index++) {
    const offset = index * 4;
    const alpha = rgba[offset + 3] / 255;
    values[index] = Math.round(
      (rgba[offset] * 0.2126 + rgba[offset + 1] * 0.7152 + rgba[offset + 2] * 0.0722) * alpha +
        255 * (1 - alpha),
    );
  }
  return { width: canvas.width, height: canvas.height, values };
}

export async function materializeBitmapPath(
  bitmap: Pick<
    SvgImport,
    | "bitmapDataUrl"
    | "bitmapRendererId"
    | "bitmapRendererSettings"
    | "bitmapBaseScale"
  >,
): Promise<string> {
  if (!bitmap.bitmapDataUrl) return "";
  const renderer = getBitmapRenderer(bitmap.bitmapRendererId);
  const luminance = await decodeBitmapLuminance(bitmap.bitmapDataUrl);
  return renderer.render(
    luminance,
    { ...renderer.defaults, ...bitmap.bitmapRendererSettings },
    bitmap.bitmapBaseScale ?? 25.4 / 96,
  );
}