/**
 * Web Worker that draws bitmap-import previews into images — see
 * `previewRasterizer.ts` for why and when.
 *
 *   IN  → RasterRequest | TintRequest | DropRequest
 *   OUT ← RasterReply
 *
 * Geometry is parsed into Path2D once per `geometryKey` and kept, so each
 * later request (a new zoom, a new visible region) only re-strokes. A
 * single-colour preview is drawn as a white mask and kept, so a colour change
 * (selecting the import) is a cheap re-tint rather than a re-stroke.
 */
import type { RasterReply, RasterWorkerRequest } from "./rasterProtocol";

interface Geometry {
  layers: { path: Path2D; color: string | null }[];
}

const geometries = new Map<string, Geometry>();
/** Largest temporary supersampled image, in pixels (~256MB of RGBA). */
const MAX_SUPERSAMPLED_PIXELS = 64_000_000;
/** Per slot: the last single-colour mask, kept for re-tinting. */
const masks = new Map<string, OffscreenCanvas>();

function tint(mask: OffscreenCanvas, color: string): ImageBitmap {
  const canvas = new OffscreenCanvas(mask.width, mask.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.transferToImageBitmap();
}

function reply(message: RasterReply, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(message, transfer);
}

self.onmessage = (event: MessageEvent<RasterWorkerRequest>) => {
  const request = event.data;

  if (request.type === "drop") {
    for (const key of [...geometries.keys()]) if (key.startsWith(request.prefix)) geometries.delete(key);
    for (const key of [...masks.keys()]) if (key.startsWith(request.prefix)) masks.delete(key);
    return;
  }

  try {
    if (request.type === "tint") {
      const mask = masks.get(request.slot);
      if (!mask) return reply({ id: request.id, slot: request.slot, error: "No mask to tint." });
      const bitmap = tint(mask, request.color);
      return reply({ id: request.id, slot: request.slot, bitmap }, [bitmap]);
    }

    if (request.layers) {
      geometries.set(request.geometryKey, {
        layers: request.layers.map(({ d, color }) => ({ path: new Path2D(d), color })),
      });
    }
    const geometry = geometries.get(request.geometryKey);
    if (!geometry) return reply({ id: request.id, slot: request.slot, error: "Unknown geometry." });

    const { region, scale } = request;
    const width = Math.max(1, Math.round(region.w * scale));
    const height = Math.max(1, Math.round(region.h * scale));
    // Supersample, but keep the temporary image to a sane size.
    const supersample = Math.max(1, Math.min(request.supersample ?? 1, Math.sqrt(MAX_SUPERSAMPLED_PIXELS / (width * height))));
    const drawScale = scale * supersample;
    const big = new OffscreenCanvas(Math.max(1, Math.round(width * supersample)), Math.max(1, Math.round(height * supersample)));
    const bigCtx = big.getContext("2d")!;
    if (request.paper) {
      bigCtx.fillStyle = request.paper;
      bigCtx.fillRect(0, 0, big.width, big.height);
    }
    bigCtx.setTransform(drawScale, 0, 0, drawScale, -region.x * drawScale, -region.y * drawScale);
    // The pen's real width, in local units: the transform scales it with the
    // drawing, so a zoomed-out preview shows the coverage the plot will have.
    bigCtx.lineWidth = request.lineWidth;
    bigCtx.globalCompositeOperation = request.blend;
    for (const layer of geometry.layers) {
      bigCtx.strokeStyle = request.mask ? "#ffffff" : (layer.color ?? request.color);
      bigCtx.stroke(layer.path);
    }

    let canvas = big;
    if (big.width !== width || big.height !== height) {
      canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(big, 0, 0, width, height);
    }

    if (request.mask) {
      masks.set(request.slot, canvas);
      const bitmap = tint(canvas, request.color);
      return reply({ id: request.id, slot: request.slot, bitmap }, [bitmap]);
    }
    masks.delete(request.slot);
    const bitmap = canvas.transferToImageBitmap();
    reply({ id: request.id, slot: request.slot, bitmap }, [bitmap]);
  } catch (err) {
    reply({ id: request.id, slot: request.slot, error: err instanceof Error ? err.message : String(err) });
  }
};
