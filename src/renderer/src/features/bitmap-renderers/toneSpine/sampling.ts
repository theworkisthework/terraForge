import type { RendererSource } from "../../../../../types";

/**
 * Every tone-spine renderer samples the same way: bilinear-interpolated,
 * with white (no ink) outside the source bounds. Bilinear rather than
 * nearest-pixel gives smoother tone transitions as a point sweeps across the
 * image — nearest-pixel sampling reads as blocky/noisy next to a hard
 * tonal edge in the source photo, especially now that tone is sampled
 * continuously along a spine rather than once per waveform cycle. At an
 * exact integer coordinate this degenerates to the same value nearest-pixel
 * sampling would give.
 *
 * A spine's extent (a spiral's circular radius, a box's rotated corners,
 * ...) commonly exceeds a rectangular source bitmap, so a tap outside the
 * bounds must not repeat edge pixels into that area — white gives an
 * unmodulated baseline there instead.
 */
export function luminanceAt(image: RendererSource, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;

  const sample = (sx: number, sy: number): number => {
    if (sx < 0 || sx >= image.width || sy < 0 || sy >= image.height) return 255;
    return image.values[sy * image.width + sx] ?? 255;
  };

  const topLeft = sample(x0, y0);
  const topRight = sample(x0 + 1, y0);
  const bottomLeft = sample(x0, y0 + 1);
  const bottomRight = sample(x0 + 1, y0 + 1);

  const top = topLeft + (topRight - topLeft) * fx;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * fx;
  return top + (bottom - top) * fy;
}
