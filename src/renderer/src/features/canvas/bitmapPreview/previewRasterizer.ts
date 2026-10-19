import type { SvgImport, SvgPath } from "../../../../../types";
import { isLightPaper, selectionShade, type PageColors } from "../../../utils/paper";
import type { LocalRect, RasterReply, RasterRequest, RasterWorkerRequest } from "./rasterProtocol";

/**
 * Draws bitmap-import previews from images instead of live vector paths.
 *
 * A dense render is hundreds of thousands of segments. Stroked as a path —
 * the SVG preview this replaces — every pan, zoom step and drag move made the
 * browser re-rasterise all of it, at half a second or more a frame. Here the
 * geometry is drawn once, in a worker, into an image; each frame just draws
 * that image, which costs the same however dense the render is.
 *
 * Two images per import:
 * - an overview of the whole import, capped in size, always available — drawn
 *   scaled during a zoom until something sharper arrives;
 * - a detail image of the visible region at exact screen resolution, made
 *   once the view settles, for when the overview is too coarse to be sharp.
 *
 * The preview keeps the SVG version's look: strokes a constant width on
 * screen, ink layers combined with "darken", the whole preview at its opacity.
 */

/** Longest side of an overview image, in device pixels. */
const OVERVIEW_MAX_SIDE = 2048;
/** Largest detail image, in device pixels (~24M ≈ 96MB of RGBA). */
const MAX_DETAIL_PIXELS = 24_000_000;
/** Extra margin around the visible region, so a short pan needs no new image. */
const DETAIL_MARGIN = 0.25;
/** How far the screen scale may drift from an image's before it is redrawn. */
const SCALE_TOLERANCE = 1.3;
/** Drawn at this many times the needed resolution, then scaled down smoothly
 * — fine screens otherwise alias into moiré bands when zoomed out. */
const SUPERSAMPLE = 2;
/** Quiet period after a zoom or pan before sharper images are requested. */
const VIEW_SETTLE_MS = 120;

const SELECTED_COLOR = "#60a0ff";
const UNSELECTED_COLOR = "#3a6aaa";
const DEFAULT_STROKE_WIDTH_MM = 0.5;

interface Tile {
  bitmap: ImageBitmap;
  region: LocalRect;
  scale: number;
  geometryKey: string;
  styleKey: string;
  color: string;
}

interface Wanted {
  region: LocalRect;
  scale: number;
}

interface Slot {
  name: "overview" | "detail";
  tile: Tile | null;
  pending: (Omit<Tile, "bitmap"> & { id: number }) | null;
}

interface Geometry {
  key: string;
  layers: { d: string; color: string | null }[];
  mask: boolean;
  /** Some layer has no colour of its own, so draws in the fallback colour. */
  usesFallback: boolean;
  /** For separated inks: the paper they are drawn on and how they combine there. */
  paper: { color: string; blend: "multiply" | "screen" } | null;
  /** The import fields the geometry was built from, compared by identity. */
  inputs: unknown[];
}

interface ImportState {
  id: string;
  geometry: Geometry | null;
  overview: Slot;
  detail: Slot;
  settleTimer: ReturnType<typeof setTimeout> | null;
  /** The last view this import was drawn in, for requests made once it settles. */
  lastDraw: {
    transform: DOMMatrix;
    width: number;
    height: number;
    imp: SvgImport;
    selected: boolean;
    page: PageColors | null;
  } | null;
}

/**
 * Separated inks are previewed the way they will combine on the page:
 * transparent inks on light paper filter the light, which multiplying
 * approximates; light inks on dark paper add light, which screening does.
 * The paper is the page's when one is shown, and otherwise what the mode
 * assumes. Anything else (a single-colour preview, or a plugin's coloured
 * layers without separation) is drawn without paper, as before.
 */
function paperFor(imp: SvgImport, page: PageColors | null): Geometry["paper"] {
  const mode = imp.bitmapSeparationMode ?? "none";
  if (mode === "none") return null;
  const color = page?.paper ?? (mode === "rgb" ? "#000000" : "#ffffff");
  return { color, blend: isLightPaper(color) ? "multiply" : "screen" };
}

/** Which of a bitmap's separated-ink paths its preview shows. Mirrors the
 * outline-visibility rules `vectorObjectsForImport`/`drawImportsLayer` apply
 * to regular SVG paths, so a separated bitmap's ink-channel "By Colour"
 * show/hide toggles (which set `strokeEnabled`, not `visible`) affect the
 * preview instead of being silently ignored. */
export function isInkPathVisible(imp: SvgImport, path: SvgPath): boolean {
  if (path.visible === false) return false;
  if ((imp.strokeEnabled ?? true) === false) return false;
  if ((path.strokeEnabled ?? true) === false) return false;
  const sourceOutlineVisible =
    typeof path.sourceOutlineVisible === "boolean" ? path.sourceOutlineVisible : path.outlineVisible !== false;
  const generatedStrokeEnabled = path.generatedStrokeEnabled ?? imp.generatedStrokeForNoStroke ?? false;
  return sourceOutlineVisible || generatedStrokeEnabled;
}

function sameInputs(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function intersect(a: LocalRect, b: LocalRect): LocalRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

function contains(outer: LocalRect, inner: LocalRect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

function sameRect(a: LocalRect, b: LocalRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** The part of the canvas (0..width, 0..height device px) in local units. */
function visibleLocalRect(transform: DOMMatrix, width: number, height: number): LocalRect {
  const inverse = transform.inverse();
  const corners = [
    inverse.transformPoint({ x: 0, y: 0 }),
    inverse.transformPoint({ x: width, y: 0 }),
    inverse.transformPoint({ x: 0, y: height }),
    inverse.transformPoint({ x: width, y: height }),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export class BitmapPreviewRasterizer {
  private worker: Worker | null = null;
  private readonly imports = new Map<string, ImportState>();
  private readonly workerGeometry = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly sourceImages = new Map<string, { dataUrl: string; bitmap: ImageBitmap | null }>();
  private nextId = 1;
  private nextGeometry = 1;

  /** Whether this environment can rasterise off-thread; when not, the SVG preview is used. */
  static isSupported(): boolean {
    return (
      typeof Worker !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      typeof createImageBitmap !== "undefined" &&
      typeof DOMMatrix !== "undefined"
    );
  }

  /** Called whenever a new image is ready, so the canvas can redraw. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Draws `imp`'s source image (when shown) and preview. `ctx` must already
   * be transformed into the import's local coordinates, exactly as its
   * vector paths would be. `page` is the shown page's paper and pen, if any.
   */
  draw(ctx: CanvasRenderingContext2D, imp: SvgImport, selected: boolean, page: PageColors | null = null): void {
    const bounds = { x: imp.viewBoxX ?? 0, y: imp.viewBoxY ?? 0, w: imp.svgWidth, h: imp.svgHeight };

    if (imp.bitmapDataUrl && imp.bitmapSourceVisible !== false) {
      const source = this.sourceImage(imp.id, imp.bitmapDataUrl);
      if (source) {
        ctx.save();
        ctx.globalAlpha = imp.bitmapOpacity ?? 0.25;
        ctx.drawImage(source, bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.restore();
      }
    }

    if (imp.bitmapPreviewVisible === false) return;
    const state = this.stateFor(imp.id);
    this.updateGeometry(state, imp, page);
    if (!state.geometry) return;

    state.lastDraw = { transform: ctx.getTransform(), width: ctx.canvas.width, height: ctx.canvas.height, imp, selected, page };
    this.request(state, false);

    const { overview, detail } = state;
    ctx.save();
    ctx.globalAlpha = imp.bitmapPreviewOpacity ?? 1;
    ctx.imageSmoothingEnabled = true;
    if (overview.tile) {
      ctx.save();
      if (detail.tile) {
        // Leave the detail image's area to the detail image, so a preview at
        // reduced opacity is not drawn twice there.
        const clip = new Path2D();
        clip.rect(overview.tile.region.x, overview.tile.region.y, overview.tile.region.w, overview.tile.region.h);
        clip.rect(detail.tile.region.x, detail.tile.region.y, detail.tile.region.w, detail.tile.region.h);
        ctx.clip(clip, "evenodd");
      }
      const { bitmap, region } = overview.tile;
      ctx.drawImage(bitmap, region.x, region.y, region.w, region.h);
      ctx.restore();
    }
    if (detail.tile) {
      const { bitmap, region } = detail.tile;
      ctx.drawImage(bitmap, region.x, region.y, region.w, region.h);
    }
    ctx.restore();
  }

  /** Forgets every import not in `liveIds`, freeing its images. */
  prune(liveIds: Set<string>): void {
    for (const [id, state] of this.imports) {
      if (liveIds.has(id)) continue;
      if (state.settleTimer) clearTimeout(state.settleTimer);
      state.overview.tile?.bitmap.close();
      state.detail.tile?.bitmap.close();
      this.imports.delete(id);
      this.post({ type: "drop", prefix: `${id}#` });
      this.post({ type: "drop", prefix: `${id}:` });
      for (const key of [...this.workerGeometry]) if (key.startsWith(`${id}#`)) this.workerGeometry.delete(key);
    }
    for (const id of [...this.sourceImages.keys()]) {
      if (!liveIds.has(id)) {
        this.sourceImages.get(id)?.bitmap?.close();
        this.sourceImages.delete(id);
      }
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private sourceImage(id: string, dataUrl: string): ImageBitmap | null {
    const entry = this.sourceImages.get(id);
    if (entry?.dataUrl === dataUrl) return entry.bitmap;
    entry?.bitmap?.close();
    const fresh = { dataUrl, bitmap: null as ImageBitmap | null };
    this.sourceImages.set(id, fresh);
    // Decoded through an <img> rather than fetch(): the renderer's CSP allows
    // data: URLs as images but not as fetch targets.
    const element = new Image();
    element.src = dataUrl;
    void element
      .decode()
      .then(() => createImageBitmap(element))
      .then((bitmap) => {
        if (this.sourceImages.get(id) !== fresh) return bitmap.close();
        fresh.bitmap = bitmap;
        this.notify();
      })
      .catch(() => {});
    return null;
  }

  private stateFor(id: string): ImportState {
    let state = this.imports.get(id);
    if (!state) {
      state = {
        id,
        geometry: null,
        overview: { name: "overview", tile: null, pending: null },
        detail: { name: "detail", tile: null, pending: null },
        settleTimer: null,
        lastDraw: null,
      };
      this.imports.set(id, state);
    }
    return state;
  }

  private updateGeometry(state: ImportState, imp: SvgImport, page: PageColors | null): void {
    // `paths` only matters when it holds the preview (separated inks, dots);
    // a single-path preview must not be redrawn because an empty array was
    // replaced by another empty array.
    const inputs =
      imp.paths.length > 0
        ? [imp.paths, imp.strokeEnabled, imp.generatedStrokeForNoStroke, imp.bitmapSeparationMode, page?.paper]
        : [imp.bitmapRendererPath];
    if (state.geometry && sameInputs(state.geometry.inputs, inputs)) return;

    let layers: Geometry["layers"] = [];
    let mask = false;
    if (imp.paths.length > 0) {
      // Consecutive paths of one ink become one layer: a halftone is a path
      // per dot, and one stroke of a few large paths is far cheaper to draw
      // than hundreds of thousands of small ones.
      for (const path of imp.paths) {
        if (!isInkPathVisible(imp, path)) continue;
        const color = path.strokeColor ?? path.sourceColor ?? null;
        const last = layers[layers.length - 1];
        if (last && last.color === color) last.d += ` ${path.d}`;
        else layers.push({ d: path.d, color });
      }
    } else if (imp.bitmapRendererPath) {
      layers = [{ d: imp.bitmapRendererPath, color: null }];
      mask = true;
    }

    const previous = state.geometry;
    if (previous) {
      this.post({ type: "drop", prefix: previous.key });
      this.workerGeometry.delete(previous.key);
    }
    state.geometry =
      layers.length > 0
        ? {
            key: `${state.id}#${this.nextGeometry++}#`,
            layers,
            mask,
            usesFallback: !mask && layers.some((layer) => layer.color === null),
            paper: paperFor(imp, page),
            inputs,
          }
        : null;
    if (!state.geometry) {
      // Nothing to show any more: drop the images rather than leave a stale preview.
      state.overview.tile?.bitmap.close();
      state.detail.tile?.bitmap.close();
      state.overview.tile = state.detail.tile = null;
    }
  }

  /** The tint for a single-colour preview, and the fallback colour otherwise:
   * the page's pen when a page is shown, shaded when selected. */
  private colorFor(selected: boolean, page: PageColors | null): string {
    if (page) return selected ? selectionShade(page.pen) : page.pen;
    return selected ? SELECTED_COLOR : UNSELECTED_COLOR;
  }

  private styleKey(geometry: Geometry, lineWidth: number, color: string): string {
    // A single-colour preview is tinted, so its colour is not part of the
    // drawn shape; a layered one only depends on it for uncoloured layers.
    return `${lineWidth}|${geometry.mask ? "mask" : "inks"}|${geometry.paper?.blend ?? ""}|${geometry.usesFallback ? color : ""}`;
  }

  /**
   * Decides which images the last-drawn view needs and asks for them. A new
   * geometry or style is wanted straight away; a sharper image for a changed
   * view only once the view has stopped changing.
   */
  private request(state: ImportState, settled: boolean): void {
    const view = state.lastDraw;
    const geometry = state.geometry;
    if (!view || !geometry) return;

    const { transform, width, height, imp, selected, page } = view;
    const bounds = { x: imp.viewBoxX ?? 0, y: imp.viewBoxY ?? 0, w: imp.svgWidth, h: imp.svgHeight };
    const screenScale = Math.sqrt(Math.abs(transform.a * transform.d - transform.b * transform.c));
    // The pen's real width in local units (source pixels), so the preview's
    // ink coverage matches the plot's at every zoom — a fixed on-screen width
    // drew lines many times too thick when zoomed out, darkening the preview.
    const mmPerUnit = Math.sqrt(Math.abs((imp.scaleX ?? imp.scale) * (imp.scaleY ?? imp.scale))) || 1;
    const lineWidth = (imp.strokeWidthMM ?? DEFAULT_STROKE_WIDTH_MM) / mmPerUnit;
    const color = this.colorFor(selected, page);
    const styleKey = this.styleKey(geometry, lineWidth, color);

    // Overview: the whole import, as sharp as the screen needs, up to a cap.
    const overviewCap = OVERVIEW_MAX_SIDE / Math.max(bounds.w, bounds.h);
    const overviewScale = Math.min(screenScale, overviewCap);
    const overviewWanted: Wanted = { region: bounds, scale: overviewScale };

    // Detail: only once the overview's cap makes it too coarse for the zoom.
    let detailWanted: Wanted | null = null;
    const visible = intersect(visibleLocalRect(transform, width, height), bounds);
    if (visible && screenScale > overviewCap * 1.25) {
      const marginX = visible.w * DETAIL_MARGIN;
      const marginY = visible.h * DETAIL_MARGIN;
      let region = intersect({ x: visible.x - marginX, y: visible.y - marginY, w: visible.w + 2 * marginX, h: visible.h + 2 * marginY }, bounds)!;
      if (region.w * region.h * screenScale * screenScale > MAX_DETAIL_PIXELS) region = visible;
      const scale = Math.min(screenScale, Math.sqrt(MAX_DETAIL_PIXELS / (region.w * region.h)));
      detailWanted = { region, scale };
    } else if (state.detail.tile || state.detail.pending) {
      // Zoomed out far enough for the overview alone.
      state.detail.tile?.bitmap.close();
      state.detail.tile = null;
      state.detail.pending = null;
    }

    // Wanted at once: an overview when there is none (nothing to show
    // otherwise), or any image whose content — not view — has changed. A
    // detail image that does not exist yet is a view matter, so it waits for
    // the view to settle like any other sharpening.
    const changedNow = (slot: Slot) => {
      const current = slot.pending ?? slot.tile;
      if (!current) return slot.name === "overview";
      return current.geometryKey !== geometry.key || current.styleKey !== styleKey;
    };
    const outOfView = (slot: Slot, wanted: Wanted) => {
      const current = slot.pending ?? slot.tile;
      if (!current) return true;
      const ratio = current.scale / wanted.scale;
      if (slot.name === "overview") return ratio < 1 / 1.5; // too coarse; larger than needed is fine
      return ratio < 1 / SCALE_TOLERANCE || ratio > SCALE_TOLERANCE || !contains(current.region, visible ?? wanted.region);
    };

    for (const [slot, wanted] of [
      [state.overview, overviewWanted],
      [state.detail, detailWanted],
    ] as const) {
      if (!wanted) continue;
      if (changedNow(slot)) {
        this.send(state, slot, geometry, wanted, styleKey, lineWidth, color);
      } else if (outOfView(slot, wanted)) {
        if (settled) this.send(state, slot, geometry, wanted, styleKey, lineWidth, color);
        else this.settleLater(state);
      } else if (geometry.mask && slot.tile && !slot.pending && slot.tile.color !== color) {
        this.tint(state, slot, color);
      }
    }
  }

  private settleLater(state: ImportState): void {
    if (state.settleTimer) clearTimeout(state.settleTimer);
    state.settleTimer = setTimeout(() => {
      state.settleTimer = null;
      this.request(state, true);
    }, VIEW_SETTLE_MS);
  }

  private send(
    state: ImportState,
    slot: Slot,
    geometry: Geometry,
    wanted: Wanted,
    styleKey: string,
    lineWidth: number,
    color: string,
  ): void {
    const current = slot.pending;
    if (current && current.geometryKey === geometry.key && current.styleKey === styleKey && current.scale === wanted.scale && sameRect(current.region, wanted.region)) {
      return;
    }
    const id = this.nextId++;
    const request: RasterRequest = {
      type: "raster",
      id,
      slot: `${state.id}:${slot.name}`,
      geometryKey: geometry.key,
      layers: this.workerGeometry.has(geometry.key) ? undefined : geometry.layers,
      region: wanted.region,
      scale: wanted.scale,
      lineWidth,
      mask: geometry.mask,
      color,
      blend: geometry.mask ? "source-over" : (geometry.paper?.blend ?? "darken"),
      paper: geometry.paper?.color,
      supersample: SUPERSAMPLE,
    };
    this.workerGeometry.add(geometry.key);
    slot.pending = { id, region: wanted.region, scale: wanted.scale, geometryKey: geometry.key, styleKey, color };
    this.post(request);
  }

  private tint(state: ImportState, slot: Slot, color: string): void {
    const tile = slot.tile!;
    const id = this.nextId++;
    slot.pending = { id, region: tile.region, scale: tile.scale, geometryKey: tile.geometryKey, styleKey: tile.styleKey, color };
    this.post({ type: "tint", id, slot: `${state.id}:${slot.name}`, color });
  }

  private onReply(reply: RasterReply): void {
    const [importId, name] = reply.slot.split(":");
    const state = this.imports.get(importId);
    const slot = state ? (name === "overview" ? state.overview : state.detail) : null;
    if (!slot || slot.pending?.id !== reply.id) {
      if ("bitmap" in reply) reply.bitmap.close();
      return;
    }
    const pending = slot.pending;
    slot.pending = null;
    if ("error" in reply) return;
    slot.tile?.bitmap.close();
    slot.tile = { ...pending, bitmap: reply.bitmap };
    this.notify();
  }

  private post(message: RasterWorkerRequest): void {
    if (!this.worker) {
      this.worker = new Worker(new URL("./previewRasterWorker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event: MessageEvent<RasterReply>) => this.onReply(event.data);
    }
    this.worker.postMessage(message);
  }
}

let instance: BitmapPreviewRasterizer | null | undefined;

/** The shared rasteriser, or null where off-thread rasterising is unavailable. */
export function bitmapPreviewRasterizer(): BitmapPreviewRasterizer | null {
  if (instance === undefined) instance = BitmapPreviewRasterizer.isSupported() ? new BitmapPreviewRasterizer() : null;
  return instance;
}
