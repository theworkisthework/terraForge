/** A rectangle in an import's local (source-pixel) coordinates. */
export interface LocalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Draw a region of an import's preview geometry into an image. */
export interface RasterRequest {
  type: "raster";
  id: number;
  /** Which image this fills: `<importId>:overview` or `<importId>:detail`. */
  slot: string;
  geometryKey: string;
  /** Sent only when the worker does not already hold `geometryKey`. */
  layers?: { d: string; color: string | null }[];
  region: LocalRect;
  /** Device pixels per local unit. */
  scale: number;
  /** Stroke width in local units — the pen's real width, so it scales with
   * the drawing like the plot itself rather than staying fixed on screen. */
  lineWidth: number;
  /** Draw a white mask and tint it `color` (single-colour previews). */
  mask: boolean;
  /** Tint colour, or the fallback for layers with no colour of their own. */
  color: string;
  blend: "darken" | "source-over" | "multiply" | "screen";
  /**
   * Fill the image with this paper colour before drawing, so inks combine
   * against it the way they would on the page (multiply on white, screen on
   * black). Absent leaves the image transparent.
   */
  paper?: string;
  /**
   * Draw at this many times the requested resolution, then scale down
   * smoothly: fine dot and line screens otherwise alias against the pixel
   * grid into moiré bands when zoomed out. The worker lowers it to bound the
   * temporary image's size.
   */
  supersample?: number;
}

/** Re-colour a slot's last single-colour mask without re-stroking. */
export interface TintRequest {
  type: "tint";
  id: number;
  slot: string;
  color: string;
}

/** Forget geometry and masks for every key starting with `prefix`. */
export interface DropRequest {
  type: "drop";
  prefix: string;
}

export type RasterWorkerRequest = RasterRequest | TintRequest | DropRequest;

export type RasterReply =
  | { id: number; slot: string; bitmap: ImageBitmap }
  | { id: number; slot: string; error: string };
