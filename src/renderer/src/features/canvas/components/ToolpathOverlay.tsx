/**
 * ToolpathOverlay - canvas-based rendering of G-code toolpaths and SVG imports.
 *
 * Renders a <canvas> element positioned absolutely behind the SVG layer.
 * Uses Path2D caching, RAF debouncing, and LOD (level-of-detail) culling to
 * handle dense G-code files without blocking the browser.
 *
 * Why canvas over SVG for toolpaths:
 *   • No per-element DOM layout or style-cascade overhead
 *   • No vectorEffect="non-scaling-stroke" re-computation on every zoom/pan
 *   • LOD: sub-pixel segments are skipped based on current zoom level
 *   • RAF debouncing: rapid pan/zoom events collapse into one repaint per frame
 */
import { useRef, useEffect } from "react";
import { MM_TO_PX, PAD, LOD_PX } from "../constants";
import { scaleHexColor } from "../utils/geometry";
import type { Vp } from "../types";
import type { SvgImport, LayerGroup } from "../../../../../types";
import type { GcodeToolpath } from "../../../utils/gcodeParser";
import { DEFAULT_STROKE_WIDTH_MM } from "../../../../../types";

export interface ToolpathOverlayProps {
  vp: Vp;
  containerSize: { w: number; h: number };
  isCenter: boolean;
  isBottom: boolean;
  isRight: boolean;
  bedW: number;
  bedH: number;
  bedXMin: number;
  bedXMax: number;
  bedYMin: number;
  bedYMax: number;
  /** Canvas height in SVG pixels (bedH * MM_TO_PX + PAD * 2) */
  canvasH: number;
  imports: SvgImport[];
  selectedImportId: string | null;
  allImportsSelected: boolean;
  selectedGroupId: string | null;
  layerGroups: LayerGroup[];
  gcodeToolpath: GcodeToolpath | null;
  toolpathSelected: boolean;
  plotProgressCuts: string | null;
  plotProgressRapids: string | null;
}

export function ToolpathOverlay({
  vp,
  containerSize,
  isCenter,
  isBottom,
  isRight,
  bedW,
  bedH,
  bedXMin,
  bedXMax,
  bedYMin,
  bedYMax,
  canvasH,
  imports,
  selectedImportId,
  allImportsSelected,
  selectedGroupId,
  layerGroups,
  gcodeToolpath,
  toolpathSelected,
  plotProgressCuts,
  plotProgressRapids,
}: ToolpathOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Cache of combined Path2D geometry per import, keyed by import ID.
  // Invalidated when imp.paths reference changes (immer creates a new array on
  // any mutation). Two entries per import: outline strokes + hatch lines.
  const importPath2DCacheRef = useRef(
    new Map<
      string,
      {
        pathsRef: SvgImport["paths"];
        layersRef: SvgImport["layers"];
        outline: Path2D;
        hatch: Path2D;
      }
    >(),
  );

  // Lazy Path2D cache for the two live plot-progress overlay strings.
  // Using a ref-held object avoids stale-closure issues while still preventing
  // Path2D reconstruction on every viewport change (only on string change).
  const ppCutsPath2DRef = useRef<{ text: string; path: Path2D | null }>({
    text: "",
    path: null,
  });
  const ppRapidsPath2DRef = useRef<{ text: string; path: Path2D | null }>({
    text: "",
    path: null,
  });

  useEffect(() => {
    let rafId: number | null = null;

    const draw = () => {
      rafId = null;
      const canvas = canvasRef.current;
      if (!canvas || containerSize.w === 0 || containerSize.h === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Resize backing store for current container dimensions + DPR.
      // Cap at 8192 px to avoid allocating beyond typical GPU texture limits.
      const dpr = window.devicePixelRatio || 1;
      const physW = Math.min(Math.round(containerSize.w * dpr), 8192);
      const physH = Math.min(Math.round(containerSize.h * dpr), 8192);
      if (canvas.width !== physW || canvas.height !== physH) {
        canvas.width = physW;
        canvas.height = physH;
      }
      ctx.clearRect(0, 0, physW, physH);

      // ── Transform: G-code mm → physical canvas pixels ──────────────────────
      // Computed before the toolpath guard so the bed background is always
      // painted. The SVG bed <rect> uses fill="none", allowing the canvas layer
      // to show through and provide the dark bed background.
      const tx = isCenter
        ? PAD + (bedW / 2) * MM_TO_PX
        : isRight
          ? PAD + bedW * MM_TO_PX
          : PAD;
      const ty = isCenter
        ? PAD + (bedH / 2) * MM_TO_PX
        : isBottom
          ? PAD + bedH * MM_TO_PX
          : PAD;
      const sx = isRight ? -MM_TO_PX : MM_TO_PX;
      const sy = isCenter || isBottom ? -MM_TO_PX : MM_TO_PX;

      // Canvas CTM (G-code mm → buffer pixels).
      const a = sx * vp.zoom * dpr;
      const d = sy * vp.zoom * dpr;
      const e = (tx * vp.zoom + vp.panX) * dpr;
      const f = (ty * vp.zoom + vp.panY) * dpr;

      // Always paint the bed background — visible with or without a toolpath.
      ctx.save();
      ctx.setTransform(a, 0, 0, d, e, f);
      ctx.fillStyle =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--tf-bg-terminal")
          .trim() || "#0d1117";
      ctx.fillRect(bedXMin, bedYMin, bedXMax - bedXMin, bedYMax - bedYMin);
      ctx.restore();

      // ── SVG imports (canvas-rendered to avoid SVG DOM layout cost) ────────────
      // Paths are rendered here; invisible hit-area rects remain in the SVG
      // for drag/click interaction.  Combined Path2D per import is built once
      // and cached; rebuilt only when imp.paths reference changes.
      {
        const vpA = vp.zoom * dpr;
        const vpE = vp.panX * dpr;
        const vpF = vp.panY * dpr;
        // Build a fast importId → group colour lookup used for stroke colours below.
        const groupColorMap = new Map<string, string>();
        for (const g of layerGroups) {
          for (const id of g.importIds) {
            groupColorMap.set(id, g.color);
          }
        }
        // Prune cache entries for imports that no longer exist.
        for (const id of importPath2DCacheRef.current.keys()) {
          if (!imports.some((imp) => imp.id === id))
            importPath2DCacheRef.current.delete(id);
        }
        for (const imp of imports) {
          if (!imp.visible) continue;
          // Build or retrieve combined Path2D objects for this import.
          let impCache = importPath2DCacheRef.current.get(imp.id);
          if (
            !impCache ||
            impCache.pathsRef !== imp.paths ||
            impCache.layersRef !== imp.layers
          ) {
            // Paths whose layer is tracked and hidden should not be drawn.
            const hiddenLayerIds = imp.layers
              ? new Set(imp.layers.filter((l) => !l.visible).map((l) => l.id))
              : null;
            const isLayerVisible = (p: (typeof imp.paths)[number]) =>
              !hiddenLayerIds || !p.layer || !hiddenLayerIds.has(p.layer);
            const outlineD = imp.paths
              .filter(
                (p) =>
                  p.visible && p.outlineVisible !== false && isLayerVisible(p),
              )
              .map((p) => p.d)
              .join(" ");
            const hatchD = imp.paths
              .filter(
                (p) =>
                  p.visible &&
                  (p.hatchLines?.length ?? 0) > 0 &&
                  isLayerVisible(p),
              )
              .flatMap((p) => p.hatchLines!)
              .join(" ");
            impCache = {
              pathsRef: imp.paths,
              layersRef: imp.layers,
              outline: new Path2D(outlineD),
              hatch: new Path2D(hatchD),
            };
            importPath2DCacheRef.current.set(imp.id, impCache);
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
            : PAD +
              (imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale)) * MM_TO_PX;
          const bboxW = imp.svgWidth * impSX;
          const bboxH = imp.svgHeight * impSY;
          const cxSvg = left + bboxW / 2;
          const cySvg = impTop + bboxH / 2;
          const deg = imp.rotation ?? 0;
          // Effective pixels-per-user-unit: used to emulate non-scaling-stroke.
          const avgImpScale =
            Math.sqrt(Math.abs(impSX) * Math.abs(impSY)) * vp.zoom;
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
          // Outline paths — use group colour when assigned, otherwise default blue
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
          ctx.strokeStyle = outlineColor;
          ctx.lineWidth =
            ((imp.strokeWidthMM ?? DEFAULT_STROKE_WIDTH_MM) * MM_TO_PX) /
            avgImpScale;
          ctx.stroke(impCache.outline);
          // Hatch fill lines
          ctx.strokeStyle = hatchColor;
          ctx.lineWidth =
            ((imp.strokeWidthMM ?? DEFAULT_STROKE_WIDTH_MM) * 0.5 * MM_TO_PX) /
            avgImpScale;
          ctx.stroke(impCache.hatch);
          ctx.restore();
        }
      }

      if (!gcodeToolpath) return;

      // Safety draw-call budgets — viewport culling below means these are
      // only reached if an extraordinary number of paths land inside the
      // visible area simultaneously (i.e. fully zoomed-out on a dense file).
      const MAX_CUT_CALLS = 500_000;
      const MAX_RAPID_CALLS = 150_000;

      ctx.save();
      ctx.setTransform(a, 0, 0, d, e, f);

      // Clip to bed bounds (G-code mm coordinates after setTransform).
      ctx.beginPath();
      ctx.rect(bedXMin, bedYMin, bedXMax - bedXMin, bedYMax - bedYMin);
      ctx.clip();

      // CSS pixels per G-code mm — used to scale lineWidth and the LOD threshold.
      const pxPerMm = Math.abs(sx * vp.zoom);

      // LOD: skip segments whose length in G-code mm is below this threshold.
      const lodMm = LOD_PX / pxPerMm;
      const lodMm2 = lodMm * lodMm;

      // ── Viewport bounds in G-code mm ────────────────────────────────────────
      // Invert the canvas transform (buffer px → G-code mm) so we can cull
      // paths that are entirely outside the visible area.  A 20 mm padding
      // ensures paths whose first point is off-screen but whose stroke enters
      // the viewport are not incorrectly discarded.
      const VP_PAD_MM = 20;
      const vpL = Math.min((0 - e) / a, (physW - e) / a) - VP_PAD_MM;
      const vpR = Math.max((0 - e) / a, (physW - e) / a) + VP_PAD_MM;
      const vpT = Math.min((0 - f) / d, (physH - f) / d) - VP_PAD_MM;
      const vpB = Math.max((0 - f) / d, (physH - f) / d) + VP_PAD_MM;

      // ── Cut moves first (pen-down strokes, solid blue) ────────────────────
      // Drawn before rapids so the cut budget is never consumed by rapid moves.
      if (gcodeToolpath.cutPaths.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = toolpathSelected ? "#38bdf8" : "#0ea5e9";
        ctx.lineWidth = 1.5 / pxPerMm;
        ctx.setLineDash([]);
        let cutCalls = 0;
        for (const path of gcodeToolpath.cutPaths) {
          if (cutCalls >= MAX_CUT_CALLS) break;
          if (path.length < 4) continue;

          // Viewport cull: compute path bounding box and skip if entirely
          // outside the visible area.  O(n) per path but cheaper than drawing.
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
          if (pMaxX < vpL || pMinX > vpR || pMaxY < vpT || pMinY > vpB)
            continue;

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
        ctx.stroke();
      }

      // ── Rapid moves (pen-up travel, grey dashed) ──────────────────────────
      const rp = gcodeToolpath.rapidPaths;
      if (rp.length >= 4) {
        ctx.beginPath();
        ctx.strokeStyle = "#4a5568";
        ctx.lineWidth = 0.5 / pxPerMm;
        ctx.setLineDash([2 / pxPerMm, 1 / pxPerMm]);
        let rapidCalls = 0;
        for (let i = 0; i < rp.length && rapidCalls < MAX_RAPID_CALLS; i += 4) {
          const x0 = rp[i],
            y0 = rp[i + 1],
            x1 = rp[i + 2],
            y1 = rp[i + 3];
          // Viewport cull for rapid segments.
          const rMinX = x0 < x1 ? x0 : x1,
            rMaxX = x0 > x1 ? x0 : x1;
          const rMinY = y0 < y1 ? y0 : y1,
            rMaxY = y0 > y1 ? y0 : y1;
          if (rMaxX < vpL || rMinX > vpR || rMaxY < vpT || rMinY > vpB)
            continue;
          const dx = x1 - x0,
            dy = y1 - y0;
          if (dx * dx + dy * dy >= lodMm2) {
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            rapidCalls++;
          }
        }
        ctx.stroke();
      }

      // ── Plot-progress overlays via cached Path2D ─────────────────────────
      // Path2D is only rebuilt when the string content changes, so rapid
      // pan/zoom while a job is running does not retrigger string parsing.
      if (plotProgressRapids) {
        if (ppRapidsPath2DRef.current.text !== plotProgressRapids) {
          try {
            ppRapidsPath2DRef.current = {
              text: plotProgressRapids,
              path: new Path2D(plotProgressRapids),
            };
          } catch {
            ppRapidsPath2DRef.current = {
              text: plotProgressRapids,
              path: null,
            };
          }
        }
        const p2d = ppRapidsPath2DRef.current.path;
        if (p2d) {
          ctx.strokeStyle = "#f97316";
          ctx.lineWidth = 0.5 / pxPerMm;
          ctx.setLineDash([2 / pxPerMm, 1 / pxPerMm]);
          ctx.stroke(p2d);
        }
      }
      if (plotProgressCuts) {
        if (ppCutsPath2DRef.current.text !== plotProgressCuts) {
          try {
            ppCutsPath2DRef.current = {
              text: plotProgressCuts,
              path: new Path2D(plotProgressCuts),
            };
          } catch {
            ppCutsPath2DRef.current = { text: plotProgressCuts, path: null };
          }
        }
        const p2d = ppCutsPath2DRef.current.path;
        if (p2d) {
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 2 / pxPerMm;
          ctx.setLineDash([]);
          ctx.stroke(p2d);
        }
      }

      ctx.restore();
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [
    gcodeToolpath,
    toolpathSelected,
    vp,
    plotProgressCuts,
    plotProgressRapids,
    containerSize,
    bedW,
    bedH,
    isCenter,
    isBottom,
    isRight,
    bedXMin,
    bedYMin,
    bedXMax,
    bedYMax,
    imports,
    selectedImportId,
    allImportsSelected,
    layerGroups,
    canvasH,
  ]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="toolpath-canvas"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        display: "block",
        width: containerSize.w || bedW * MM_TO_PX + PAD * 2,
        height: containerSize.h || bedH * MM_TO_PX + PAD * 2,
        pointerEvents: "none",
      }}
    />
  );
}
