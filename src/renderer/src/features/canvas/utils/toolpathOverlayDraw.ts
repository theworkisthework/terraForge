import {
  DEFAULT_STROKE_WIDTH_MM,
  type LayerGroup,
  type SvgImport,
} from "../../../../../types";
import { selectionShade, type PageColors } from "../../../utils/paper";
import type { Vp } from "../types";
import { LOD_PX, MM_TO_PX, PAD } from "../constants";
import { scaleHexColor } from "./geometry";
import type { GcodeToolpath } from "../../../utils/gcodeParser";
import type { BitmapPreviewRasterizer } from "../bitmapPreview/previewRasterizer";

export interface ImportPath2DCacheEntry {
  impRef: SvgImport;
  pathsRef: SvgImport["paths"];
  layersRef: SvgImport["layers"];
  outline: Path2D;
  hatch: Path2D;
  outlineByColor: Array<{ color: string | null; path: Path2D }>;
  hatchByColor: Array<{ color: string | null; path: Path2D }>;
}

export interface Path2DTextCache {
  text: string;
  path: Path2D | null;
}

interface DrawImportsLayerParams {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  vp: Vp;
  imports: SvgImport[];
  layerGroups: LayerGroup[];
  selectedImportId: string | null;
  allImportsSelected: boolean;
  selectedGroupId: string | null;
  isBottom: boolean;
  canvasH: number;
  respectSvgColorsOnCanvas: boolean;
  cache: Map<string, ImportPath2DCacheEntry>;
  /** Draws bitmap imports from rasterised images; when absent, ImportLayer's SVG draws them. */
  bitmapPreviews?: BitmapPreviewRasterizer | null;
  /**
   * The shown page: its rectangle in canvas pixels (before the viewport),
   * filled with its paper colour beneath every import, and the pen imports
   * are previewed in. Null when no page is shown.
   */
  page?: (PageColors & { rect: { x: number; y: number; w: number; h: number } }) | null;
}

/** Sets `ctx` to map an import's local (viewBox) coordinates onto the canvas,
 * the same placement ImportLayer gives it in the SVG scene. */
function applyImportTransform(
  ctx: CanvasRenderingContext2D,
  imp: SvgImport,
  vpMatrix: [number, number, number],
  isBottom: boolean,
  canvasH: number,
): { impSX: number; impSY: number } {
  const [vpA, vpE, vpF] = vpMatrix;
  const impSX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
  const impSY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
  const vbX = imp.viewBoxX ?? 0;
  const vbY = imp.viewBoxY ?? 0;
  const left = PAD + imp.x * MM_TO_PX;
  const impTop = isBottom
    ? canvasH - PAD - (imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale)) * MM_TO_PX
    : PAD + (imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale)) * MM_TO_PX;
  const cxSvg = left + (imp.svgWidth * impSX) / 2;
  const cySvg = impTop + (imp.svgHeight * impSY) / 2;
  const deg = imp.rotation ?? 0;
  ctx.setTransform(vpA, 0, 0, vpA, vpE, vpF);
  ctx.translate(cxSvg, cySvg);
  if (deg !== 0) ctx.rotate((deg * Math.PI) / 180);
  ctx.scale(impSX, impSY);
  ctx.translate(-(vbX + imp.svgWidth / 2), -(vbY + imp.svgHeight / 2));
  return { impSX, impSY };
}

/** An import's paths as cached Path2Ds: all outlines and all hatching, and
 * the same split by colour for when SVG colours are shown. Rebuilt only
 * when the import, its paths or its layers change. */
function buildImportPaths(imp: SvgImport): ImportPath2DCacheEntry {
  const hiddenLayerIds = imp.layers
    ? new Set(imp.layers.filter((l) => !l.visible).map((l) => l.id))
    : null;
  const isLayerVisible = (p: (typeof imp.paths)[number]) =>
    !hiddenLayerIds || !p.layer || !hiddenLayerIds.has(p.layer);

  const hasOutline = (p: (typeof imp.paths)[number]) => {
    const importStrokeEnabled = imp.strokeEnabled ?? true;
    const pathStrokeEnabled = p.strokeEnabled ?? true;
    const sourceOutlineVisible =
      typeof p.sourceOutlineVisible === "boolean"
        ? p.sourceOutlineVisible
        : p.outlineVisible !== false;
    const generatedStrokeEnabled =
      p.generatedStrokeEnabled ?? imp.generatedStrokeForNoStroke ?? false;
    return (
      importStrokeEnabled &&
      pathStrokeEnabled &&
      (sourceOutlineVisible || generatedStrokeEnabled)
    );
  };

  const outlineD = imp.paths
    .filter((p) => p.visible && hasOutline(p) && isLayerVisible(p))
    .map((p) => p.d)
    .join(" ");
  const hatchD = imp.paths
    .filter(
      (p) =>
        p.visible &&
        (p.fillEnabled ?? true) &&
        (p.hatchLines?.length ?? 0) > 0 &&
        isLayerVisible(p),
    )
    .flatMap((p) => p.hatchLines!)
    .join(" ");

  const outlineByColorMap = new Map<string | null, string[]>();
  const hatchByColorMap = new Map<string | null, string[]>();
  for (const p of imp.paths) {
    if (!p.visible || !isLayerVisible(p)) continue;

    if (hasOutline(p)) {
      const key = p.strokeColor ?? p.sourceColor ?? null;
      const segs = outlineByColorMap.get(key) ?? [];
      segs.push(p.d);
      outlineByColorMap.set(key, segs);
    }

    if ((p.fillEnabled ?? true) && (p.hatchLines?.length ?? 0) > 0) {
      const key = p.fillColor ?? null;
      const segs = hatchByColorMap.get(key) ?? [];
      segs.push(...(p.hatchLines ?? []));
      hatchByColorMap.set(key, segs);
    }
  }

  const outlineByColor = Array.from(outlineByColorMap.entries()).map(
    ([color, segs]) => ({ color, path: new Path2D(segs.join(" ")) }),
  );
  const hatchByColor = Array.from(hatchByColorMap.entries()).map(
    ([color, segs]) => ({ color, path: new Path2D(segs.join(" ")) }),
  );

  return {
    impRef: imp,
    pathsRef: imp.paths,
    layersRef: imp.layers,
    outline: new Path2D(outlineD),
    hatch: new Path2D(hatchD),
    outlineByColor,
    hatchByColor,
  };
}

function cachedImportPaths(cache: Map<string, ImportPath2DCacheEntry>, imp: SvgImport): ImportPath2DCacheEntry {
  const cached = cache.get(imp.id);
  if (cached && cached.impRef === imp && cached.pathsRef === imp.paths && cached.layersRef === imp.layers) return cached;
  const built = buildImportPaths(imp);
  cache.set(imp.id, built);
  return built;
}

/** Strokes paths in their own colours when SVG colours are shown (falling
 * back to `color` for uncoloured ones), or all at once in `color`. */
function strokePaths(
  ctx: CanvasRenderingContext2D,
  all: Path2D,
  byColor: { color: string | null; path: Path2D }[],
  color: string,
  ownColors: boolean,
): void {
  if (!ownColors) {
    ctx.strokeStyle = color;
    ctx.stroke(all);
    return;
  }
  for (const entry of byColor) {
    ctx.strokeStyle = entry.color ?? color;
    ctx.stroke(entry.path);
  }
}

/**
 * The colours an import's outlines and hatching are drawn in when they have
 * none of their own: on a page, its pen (shaded when selected), as it will
 * be plotted; otherwise the import's group colour, or the default blues.
 */
function importColors(
  selected: boolean,
  groupColor: string | undefined,
  page: { pen: string } | null,
): { outlineColor: string; hatchColor: string } {
  if (page) {
    const pen = selected ? selectionShade(page.pen) : page.pen;
    return { outlineColor: pen, hatchColor: pen };
  }
  if (groupColor) {
    return {
      outlineColor: selected ? scaleHexColor(groupColor, 1.35) : groupColor,
      hatchColor: selected ? groupColor : scaleHexColor(groupColor, 0.65),
    };
  }
  return {
    outlineColor: selected ? "#60a0ff" : "#3a6aaa",
    hatchColor: selected ? "#4a88cc" : "#2a5a8a",
  };
}

export function drawImportsLayer({
  ctx,
  dpr,
  vp,
  imports,
  layerGroups,
  selectedImportId,
  allImportsSelected,
  selectedGroupId,
  isBottom,
  canvasH,
  respectSvgColorsOnCanvas,
  cache,
  bitmapPreviews,
  page = null,
}: DrawImportsLayerParams): void {
  const vpA = vp.zoom * dpr;
  const vpE = vp.panX * dpr;
  const vpF = vp.panY * dpr;

  if (page) {
    ctx.save();
    ctx.setTransform(vpA, 0, 0, vpA, vpE, vpF);
    ctx.fillStyle = page.paper;
    ctx.fillRect(page.rect.x, page.rect.y, page.rect.w, page.rect.h);
    ctx.restore();
  }

  const groupColorMap = new Map<string, string>();
  for (const g of layerGroups) {
    for (const id of g.importIds) {
      groupColorMap.set(id, g.color);
    }
  }

  for (const id of cache.keys()) {
    if (!imports.some((imp) => imp.id === id)) cache.delete(id);
  }
  bitmapPreviews?.prune(new Set(imports.map((imp) => imp.id)));

  const isSelected = (imp: SvgImport) =>
    allImportsSelected ||
    imp.id === selectedImportId ||
    (!!selectedGroupId && !!layerGroups.find((g) => g.id === selectedGroupId)?.importIds.includes(imp.id));

  for (const imp of imports) {
    if (!imp.visible) continue;
    // A bitmap's preview (and source image) are drawn from rasterised images
    // — never as the generic vector outline below, which would draw a
    // colour-separated bitmap's ink paths a second time with no way to hide
    // them. Without a rasteriser, ImportLayer's SVG draws them instead.
    if (imp.kind === "bitmap") {
      if (bitmapPreviews) {
        ctx.save();
        applyImportTransform(ctx, imp, [vpA, vpE, vpF], isBottom, canvasH);
        bitmapPreviews.draw(ctx, imp, isSelected(imp), page && { paper: page.paper, pen: page.pen });
        ctx.restore();
      }
      continue;
    }

    const impCache = cachedImportPaths(cache, imp);
    const isImpSelected = isSelected(imp);

    ctx.save();
    applyImportTransform(ctx, imp, [vpA, vpE, vpF], isBottom, canvasH);
    ctx.setLineDash([]);

    const { outlineColor, hatchColor } = importColors(isImpSelected, groupColorMap.get(imp.id), page);

    // The pen's real width, in local units: the transform scales it with the
    // drawing, so zoomed out shows the coverage the plot will have rather
    // than lines many times heavier than the pen. Hatching is drawn by the
    // same pen, so at the same width.
    const mmPerUnit = Math.sqrt(Math.abs((imp.scaleX ?? imp.scale) * (imp.scaleY ?? imp.scale))) || 1;
    ctx.lineWidth = (imp.strokeWidthMM ?? DEFAULT_STROKE_WIDTH_MM) / mmPerUnit;
    strokePaths(ctx, impCache.outline, impCache.outlineByColor, outlineColor, respectSvgColorsOnCanvas);
    strokePaths(ctx, impCache.hatch, impCache.hatchByColor, hatchColor, respectSvgColorsOnCanvas);
    ctx.restore();
  }
}

interface DrawToolpathLayerParams {
  ctx: CanvasRenderingContext2D;
  gcodeToolpath: GcodeToolpath;
  toolpathSelected: boolean;
  useMetadataColors?: boolean;
  /**
   * The shown page's pen: cuts are drawn in it rather than the default cyan
   * when not coloured by their source colours (`useMetadataColors`) — G-code
   * itself has no colour, and a plotter draws the whole file with one pen.
   */
  penColor?: string | null;
  toolpathOpacity: number;
  plotProgressCuts: string | null;
  plotProgressRapids: string | null;
  ppCutsCache: Path2DTextCache;
  ppRapidsCache: Path2DTextCache;
  transform: { a: number; d: number; e: number; f: number; sx: number };
  physW: number;
  physH: number;
  vpZoom: number;
  bedXMin: number;
  bedXMax: number;
  bedYMin: number;
  bedYMax: number;
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function rapidStrokeFromCutColor(color: string): string {
  return isHexColor(color) ? scaleHexColor(color, 1.15) : color;
}

function strokePlotProgressHalo(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  pxPerMm: number,
  kind: "cut" | "rapid",
): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (kind === "cut") {
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.226)";
    ctx.lineWidth = 3.3 / pxPerMm;
    ctx.setLineDash([]);
    ctx.shadowColor = "rgba(255, 255, 255, 0.264)";
    ctx.shadowBlur = 4.95;
  } else {
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(251, 191, 36, 0.1625)";
    ctx.lineWidth = 1.75 / pxPerMm;
    ctx.setLineDash([2 / pxPerMm, 1 / pxPerMm]);
    ctx.shadowColor = "rgba(251, 191, 36, 0.2)";
    ctx.shadowBlur = 3;
  }

  ctx.stroke(path);

  if (kind === "cut") {
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(34, 211, 238, 0.124)";
    ctx.lineWidth = 1.925 / pxPerMm;
    ctx.shadowColor = "rgba(34, 211, 238, 0.192)";
    ctx.shadowBlur = 2.75;
    ctx.stroke(path);
  }

  ctx.restore();
}

const MAX_CUT_CALLS = 500_000;
const MAX_RAPID_CALLS = 150_000;

/** What drawing a toolpath needs: where, what, and the visible area (in mm,
 * padded) outside which paths are skipped. Moves shorter than the level of
 * detail are merged into the next. */
interface ToolpathView {
  ctx: CanvasRenderingContext2D;
  toolpath: GcodeToolpath;
  pxPerMm: number;
  lodMm2: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function outsideView(view: ToolpathView, minX: number, maxX: number, minY: number, maxY: number): boolean {
  return maxX < view.left || minX > view.right || maxY < view.top || minY > view.bottom;
}

/** Strokes the given cut paths in one style; returns how many line
 * segments it drew, capped at MAX_CUT_CALLS. */
function drawCutPaths(view: ToolpathView, pathIndexes: number[], strokeStyle: string): number {
  const { ctx, pxPerMm, lodMm2 } = view;
  let cutCalls = 0;
  ctx.beginPath();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1.5 / pxPerMm;
  ctx.setLineDash([]);

  for (const index of pathIndexes) {
    if (cutCalls >= MAX_CUT_CALLS) break;
    const path = view.toolpath.cutPaths[index];
    if (!path || path.length < 4) continue;

    let pMinX = path[0],
      pMaxX = path[0],
      pMinY = path[1],
      pMaxY = path[1];
    for (let i = 2; i < path.length; i += 2) {
      if (path[i] < pMinX) pMinX = path[i];
      else if (path[i] > pMaxX) pMaxX = path[i];
      if (path[i + 1] < pMinY) pMinY = path[i + 1];
      else if (path[i + 1] > pMaxY) pMaxY = path[i + 1];
    }
    if (outsideView(view, pMinX, pMaxX, pMinY, pMaxY)) continue;

    ctx.moveTo(path[0], path[1]);
    let lastX = path[0],
      lastY = path[1];
    for (let i = 2; i < path.length && cutCalls < MAX_CUT_CALLS; i += 2) {
      const nx = path[i],
        ny = path[i + 1];
      const dx = nx - lastX,
        dy = ny - lastY;
      if (dx * dx + dy * dy >= lodMm2) {
        ctx.lineTo(nx, ny);
        lastX = nx;
        lastY = ny;
        cutCalls++;
      }
    }
  }

  if (cutCalls > 0) ctx.stroke();
  return cutCalls;
}

/** Strokes the given rapid segments, dashed, in one style; returns how many
 * it drew, capped at MAX_RAPID_CALLS. */
function drawRapidSegments(view: ToolpathView, segmentIndexes: number[], strokeStyle: string): number {
  const { ctx, pxPerMm, lodMm2 } = view;
  const rapids = view.toolpath.rapidPaths;
  let rapidCalls = 0;
  ctx.beginPath();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 0.5 / pxPerMm;
  ctx.setLineDash([2 / pxPerMm, 1 / pxPerMm]);

  for (const segIndex of segmentIndexes) {
    if (rapidCalls >= MAX_RAPID_CALLS) break;
    const i = segIndex * 4;
    if (i + 3 >= rapids.length) continue;

    const x0 = rapids[i],
      y0 = rapids[i + 1],
      x1 = rapids[i + 2],
      y1 = rapids[i + 3];
    if (outsideView(view, x0 < x1 ? x0 : x1, x0 > x1 ? x0 : x1, y0 < y1 ? y0 : y1, y0 > y1 ? y0 : y1)) continue;
    const dx = x1 - x0,
      dy = y1 - y0;
    if (dx * dx + dy * dy >= lodMm2) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      rapidCalls++;
    }
  }

  if (rapidCalls > 0) ctx.stroke();
  return rapidCalls;
}

/**
 * Indexes grouped by the style they are drawn in. Per-item colours are used
 * only when there is one per item and at least one is set; otherwise every
 * item is drawn in `fallback`.
 */
function colorBuckets(
  count: number,
  colors: Array<string | null> | null | undefined,
  styleOf: (color: string | null) => string,
  fallback: string,
): Map<string, number[]> {
  const usable = !!colors && colors.length === count && colors.some((value) => !!value);
  if (!usable) return new Map([[fallback, Array.from({ length: count }, (_, i) => i)]]);
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const key = styleOf(colors[i]);
    const bucket = buckets.get(key) ?? [];
    bucket.push(i);
    buckets.set(key, bucket);
  }
  return buckets;
}

/** Draws each bucket in turn until `budget` line segments have been drawn. */
function drawWithinBudget(
  buckets: Map<string, number[]>,
  budget: number,
  draw: (indexes: number[], style: string) => number,
): void {
  let remaining = budget;
  for (const [style, indexes] of buckets) {
    if (remaining <= 0) break;
    remaining = Math.max(0, remaining - draw(indexes, style));
  }
}

/** The Path2D for a plot-progress string, rebuilt only when it changes;
 * null if the string is not valid path data. */
function cachedPath(cache: Path2DTextCache, text: string): Path2D | null {
  if (cache.text !== text) {
    cache.text = text;
    try {
      cache.path = new Path2D(text);
    } catch {
      cache.path = null;
    }
  }
  return cache.path;
}

export function drawToolpathLayer({
  ctx,
  gcodeToolpath,
  toolpathSelected,
  useMetadataColors = true,
  penColor = null,
  toolpathOpacity,
  plotProgressCuts,
  plotProgressRapids,
  ppCutsCache,
  ppRapidsCache,
  transform,
  physW,
  physH,
  vpZoom,
  bedXMin,
  bedXMax,
  bedYMin,
  bedYMax,
}: DrawToolpathLayerParams): void {
  const { a, d, e, f, sx } = transform;

  ctx.save();
  ctx.setTransform(a, 0, 0, d, e, f);

  ctx.beginPath();
  ctx.rect(bedXMin, bedYMin, bedXMax - bedXMin, bedYMax - bedYMin);
  ctx.clip();

  ctx.globalAlpha = Math.max(0.1, Math.min(1, toolpathOpacity));

  const pxPerMm = Math.abs(sx * vpZoom);
  const lodMm = LOD_PX / pxPerMm;
  const VP_PAD_MM = 20;
  const view: ToolpathView = {
    ctx,
    toolpath: gcodeToolpath,
    pxPerMm,
    lodMm2: lodMm * lodMm,
    left: Math.min((0 - e) / a, (physW - e) / a) - VP_PAD_MM,
    right: Math.max((0 - e) / a, (physW - e) / a) + VP_PAD_MM,
    top: Math.min((0 - f) / d, (physH - f) / d) - VP_PAD_MM,
    bottom: Math.max((0 - f) / d, (physH - f) / d) + VP_PAD_MM,
  };

  if (gcodeToolpath.cutPaths.length > 0) {
    const defaultCutColor = penColor
      ? toolpathSelected
        ? selectionShade(penColor)
        : penColor
      : toolpathSelected
        ? "#38bdf8"
        : "#0ea5e9";
    const buckets = colorBuckets(
      gcodeToolpath.cutPaths.length,
      useMetadataColors ? gcodeToolpath.cutPathColors : null,
      (color) => color ?? defaultCutColor,
      defaultCutColor,
    );
    drawWithinBudget(buckets, MAX_CUT_CALLS, (indexes, style) => drawCutPaths(view, indexes, style));
  }

  const rapidSegmentCount = gcodeToolpath.rapidPaths.length / 4;
  if (gcodeToolpath.rapidPaths.length >= 4) {
    const defaultRapidColor = "#4a5568";
    const buckets = colorBuckets(
      rapidSegmentCount,
      useMetadataColors ? gcodeToolpath.rapidColors : null,
      (color) => (color ? rapidStrokeFromCutColor(color) : defaultRapidColor),
      defaultRapidColor,
    );
    drawWithinBudget(buckets, MAX_RAPID_CALLS, (indexes, style) => drawRapidSegments(view, indexes, style));
  }

  const rapidsDone = plotProgressRapids ? cachedPath(ppRapidsCache, plotProgressRapids) : null;
  if (rapidsDone) strokePlotProgressHalo(ctx, rapidsDone, pxPerMm, "rapid");
  const cutsDone = plotProgressCuts ? cachedPath(ppCutsCache, plotProgressCuts) : null;
  if (cutsDone) strokePlotProgressHalo(ctx, cutsDone, pxPerMm, "cut");

  ctx.restore();
}
