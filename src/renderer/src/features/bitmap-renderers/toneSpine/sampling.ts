import type { RendererSource } from "../../../../../types";

/**
 * Every tone-spine renderer samples the same way: nearest-pixel, with white
 * (no ink) outside the source bounds. A spine's extent (a spiral's circular
 * radius, a box's rotated corners, ...) commonly exceeds a rectangular
 * source bitmap, so out-of-bounds must not repeat edge pixels — white gives
 * an unmodulated baseline there instead.
 */
export function luminanceAt(image: RendererSource, x: number, y: number): number {
  const sampleX = Math.round(x);
  const sampleY = Math.round(y);
  if (sampleX < 0 || sampleX >= image.width || sampleY < 0 || sampleY >= image.height) {
    return 255;
  }
  return image.values[sampleY * image.width + sampleX] ?? 255;
}
