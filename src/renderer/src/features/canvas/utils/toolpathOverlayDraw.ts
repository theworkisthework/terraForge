import {
  DEFAULT_STROKE_WIDTH_MM,
  type LayerGroup,
  type SvgImport,
} from "../../../../../types";
import type { Vp } from "../types";
import { LOD_PX, MM_TO_PX, PAD } from "../constants";
import { scaleHexColor } from "./geometry";
import type { GcodeToolpath } from "../../../utils/gcodeParser";

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
}: DrawImportsLayerParams): void {
  const vpA = vp.zoom * dpr;
  const vpE = vp.panX * dpr;
  const vpF = vp.panY * dpr;

  const groupColorMap = new Map<string, string>();
  for (const g of layerGroups) {
    for (const id of g.importIds) {
      groupColorMap.set(id, g.color);
    }
  }

  for (const id of cache.keys()) {
    if (!imports.some((imp) => imp.id === id)) cache.delete(id);
  }

  for (const imp of imports) {
    if (!imp.visible) continue;

    let impCache = cache.get(imp.id);
    if (
      !impCache ||
      impCache.impRef !== imp ||
      impCache.pathsRef !== imp.paths ||
      impCache.layersRef !== imp.layers
    ) {
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

      impCache = {
        impRef: imp,
        pathsRef: imp.paths,
        layersRef: imp.layers,
        outline: new Path2D(outlineD),
        hatch: new Path2D(hatchD),
        outlineByColor,
        hatchByColor,
      };
      cache.set(imp.id, impCache);
    }

    const impSX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
    const impSY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
    const vbX = imp.viewBoxX ?? 0;
    const vbY = imp.viewBoxY ?? 0;
    const left = PAD + imp.x * MM_TO_PX;
    const impTop = isBottom
      ? canvasH -
        PAD -
        (imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale)) * MM_TO_PX
      : PAD + (imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale)) * MM_TO_PX;
    const bboxW = imp.svgWidth * impSX;
    const bboxH = imp.svgHeight * impSY;
    const cxSvg = left + bboxW / 2;
    const cySvg = impTop + bboxH / 2;
    const deg = imp.rotation ?? 0;
    const avgImpScale = Math.sqrt(Math.abs(impSX) * Math.abs(impSY)) * vp.zoom;
    const isImpSelected =
      allImportsSelected ||
      imp.id === selectedImportId ||
      (!!selectedGroupId &&
        !!layerGroups
          .find((g) => g.id === selectedGroupId)
          ?.importIds.includes(imp.id));

    ctx.save();
    ctx.setTransform(vpA, 0, 0, vpA, vpE, vpF);
    ctx.translate(cxSvg, cySvg);
    if (deg !== 0) ctx.rotate((deg * Math.PI) / 180);
    ctx.scale(impSX, impSY);
    ctx.translate(-(vbX + imp.svgWidth / 2), -(vbY + imp.svgHeight / 2));
    ctx.setLineDash([]);

    const groupColor = groupColorMap.get(imp.id);
    const outlineColor = groupColor
      ? isImpSelected
        ? scaleHexColor(groupColor, 1.35)
        : groupColor
      : isImpSelected
        ? "#60a0ff"
        : "#3a6aaa";
    const hatchColor = groupColor
      ? isImpSelected
        ? groupColor
        : scaleHexColor(groupColor, 0.65)
      : isImpSelected
        ? "#4a88cc"
        : "#2a5a8a";

    ctx.lineWidth =
      ((imp.strokeWidthMM ?? DEFAULT_STROKE_WIDTH_MM) * MM_TO_PX) / avgImpScale;
    if (respectSvgColorsOnCanvas) {
      for (const entry of impCache.outlineByColor) {
        ctx.strokeStyle = entry.color ?? outlineColor;
        ctx.stroke(entry.path);
      }
    } else {
      ctx.strokeStyle = outlineColor;
      ctx.stroke(impCache.outline);
    }

    ctx.lineWidth =
      ((imp.strokeWidthMM ?? DEFAULT_STROKE_WIDTH_MM) * 0.5 * MM_TO_PX) /
      avgImpScale;
    if (respectSvgColorsOnCanvas) {
      for (const entry of impCache.hatchByColor) {
        ctx.strokeStyle = entry.color ?? hatchColor;
        ctx.stroke(entry.path);
      }
    } else {
      ctx.strokeStyle = hatchColor;
      ctx.stroke(impCache.hatch);
    }
    ctx.restore();
  }
}

interface DrawToolpathLayerParams {
  ctx: CanvasRenderingContext2D;
  gcodeToolpath: GcodeToolpath;
  toolpathSelected: boolean;
  useMetadataColors?: boolean;
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

export function drawToolpathLayer({
  ctx,
  gcodeToolpath,
  toolpathSelected,
  useMetadataColors = true,
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
  const MAX_CUT_CALLS = 500_000;
  const MAX_RAPID_CALLS = 150_000;

  ctx.save();
  ctx.setTransform(a, 0, 0, d, e, f);

  ctx.beginPath();
  ctx.rect(bedXMin, bedYMin, bedXMax - bedXMin, bedYMax - bedYMin);
  ctx.clip();

  ctx.globalAlpha = Math.max(0.1, Math.min(1, toolpathOpacity));

  const pxPerMm = Math.abs(sx * vpZoom);
  const lodMm = LOD_PX / pxPerMm;
  const lodMm2 = lodMm * lodMm;

  const VP_PAD_MM = 20;
  const vpL = Math.min((0 - e) / a, (physW - e) / a) - VP_PAD_MM;
  const vpR = Math.max((0 - e) / a, (physW - e) / a) + VP_PAD_MM;
  const vpT = Math.min((0 - f) / d, (physH - f) / d) - VP_PAD_MM;
  const vpB = Math.max((0 - f) / d, (physH - f) / d) + VP_PAD_MM;

  const drawCutPaths = (pathIndexes: number[], strokeStyle: string): number => {
    let cutCalls = 0;
    ctx.beginPath();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.5 / pxPerMm;
    ctx.setLineDash([]);

    for (const index of pathIndexes) {
      if (cutCalls >= MAX_CUT_CALLS) break;
      const path = gcodeToolpath.cutPaths[index];
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
      if (pMaxX < vpL || pMinX > vpR || pMaxY < vpT || pMinY > vpB) continue;

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
  };

  const drawRapidSegments = (
    segmentIndexes: number[],
    strokeStyle: string,
  ): number => {
    let rapidCalls = 0;
    ctx.beginPath();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 0.5 / pxPerMm;
    ctx.setLineDash([2 / pxPerMm, 1 / pxPerMm]);

    for (const segIndex of segmentIndexes) {
      if (rapidCalls >= MAX_RAPID_CALLS) break;
      const i = segIndex * 4;
      if (i + 3 >= gcodeToolpath.rapidPaths.length) continue;

      const x0 = gcodeToolpath.rapidPaths[i],
        y0 = gcodeToolpath.rapidPaths[i + 1],
        x1 = gcodeToolpath.rapidPaths[i + 2],
        y1 = gcodeToolpath.rapidPaths[i + 3];
      const rMinX = x0 < x1 ? x0 : x1,
        rMaxX = x0 > x1 ? x0 : x1;
      const rMinY = y0 < y1 ? y0 : y1,
        rMaxY = y0 > y1 ? y0 : y1;
      if (rMaxX < vpL || rMinX > vpR || rMaxY < vpT || rMinY > vpB) continue;
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
  };

  if (gcodeToolpath.cutPaths.length > 0) {
    const defaultCutColor = toolpathSelected ? "#38bdf8" : "#0ea5e9";
    const cutPathColors = useMetadataColors
      ? gcodeToolpath.cutPathColors
      : null;
    const usePerPathColors =
      !!cutPathColors &&
      cutPathColors.length === gcodeToolpath.cutPaths.length &&
      cutPathColors.some((value) => !!value);

    if (!usePerPathColors) {
      const allIndexes = gcodeToolpath.cutPaths.map((_, idx) => idx);
      drawCutPaths(allIndexes, defaultCutColor);
    } else {
      const byColor = new Map<string, number[]>();
      for (let i = 0; i < gcodeToolpath.cutPaths.length; i++) {
        const key = cutPathColors[i] ?? defaultCutColor;
        const bucket = byColor.get(key) ?? [];
        bucket.push(i);
        byColor.set(key, bucket);
      }

      let remainingCalls = MAX_CUT_CALLS;
      for (const [strokeStyle, indexes] of byColor.entries()) {
        if (remainingCalls <= 0) break;
        const before = remainingCalls;
        const used = drawCutPaths(indexes, strokeStyle);
        remainingCalls = Math.max(0, before - used);
      }
    }
  }

  const rp = gcodeToolpath.rapidPaths;
  if (rp.length >= 4) {
    const defaultRapidColor = "#4a5568";
    const rapidColors = useMetadataColors ? gcodeToolpath.rapidColors : null;
    const rapidSegmentCount = rp.length / 4;
    const useRapidColors =
      !!rapidColors &&
      rapidColors.length === rapidSegmentCount &&
      rapidColors.some((value) => !!value);

    if (!useRapidColors) {
      const allSegmentIndexes = Array.from(
        { length: rapidSegmentCount },
        (_, idx) => idx,
      );
      drawRapidSegments(allSegmentIndexes, defaultRapidColor);
    } else {
      const byColor = new Map<string, number[]>();
      for (let i = 0; i < rapidSegmentCount; i++) {
        const key = rapidColors[i]
          ? rapidStrokeFromCutColor(rapidColors[i])
          : defaultRapidColor;
        const bucket = byColor.get(key) ?? [];
        bucket.push(i);
        byColor.set(key, bucket);
      }

      let remainingCalls = MAX_RAPID_CALLS;
      for (const [strokeStyle, indexes] of byColor.entries()) {
        if (remainingCalls <= 0) break;
        const before = remainingCalls;
        const used = drawRapidSegments(indexes, strokeStyle);
        remainingCalls = Math.max(0, before - used);
      }
    }
  }

  if (plotProgressRapids) {
    if (ppRapidsCache.text !== plotProgressRapids) {
      try {
        ppRapidsCache.text = plotProgressRapids;
        ppRapidsCache.path = new Path2D(plotProgressRapids);
      } catch {
        ppRapidsCache.text = plotProgressRapids;
        ppRapidsCache.path = null;
      }
    }
    if (ppRapidsCache.path) {
      strokePlotProgressHalo(ctx, ppRapidsCache.path, pxPerMm, "rapid");
    }
  }

  if (plotProgressCuts) {
    if (ppCutsCache.text !== plotProgressCuts) {
      try {
        ppCutsCache.text = plotProgressCuts;
        ppCutsCache.path = new Path2D(plotProgressCuts);
      } catch {
        ppCutsCache.text = plotProgressCuts;
        ppCutsCache.path = null;
      }
    }
    if (ppCutsCache.path) {
      strokePlotProgressHalo(ctx, ppCutsCache.path, pxPerMm, "cut");
    }
  }

  ctx.restore();
}
