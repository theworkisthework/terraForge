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
import { MM_TO_PX, PAD } from "../constants";
import type { Vp } from "../types";
import type { SvgImport, LayerGroup } from "../../../../../types";
import type { GcodeToolpath } from "../../../utils/gcodeParser";
import type { Theme } from "../../../store/themeStore";
import {
  drawImportsLayer,
  drawToolpathLayer,
  type ImportPath2DCacheEntry,
  type Path2DTextCache,
} from "../utils/toolpathOverlayDraw";

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
  theme: Theme;
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
  theme,
}: ToolpathOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Cache of combined Path2D geometry per import, keyed by import ID.
  // Invalidated when imp.paths reference changes (immer creates a new array on
  // any mutation). Two entries per import: outline strokes + hatch lines.
  const importPath2DCacheRef = useRef(
    new Map<string, ImportPath2DCacheEntry>(),
  );

  // Lazy Path2D cache for the two live plot-progress overlay strings.
  // Using a ref-held object avoids stale-closure issues while still preventing
  // Path2D reconstruction on every viewport change (only on string change).
  const ppCutsPath2DRef = useRef<Path2DTextCache>({
    text: "",
    path: null,
  });
  const ppRapidsPath2DRef = useRef<Path2DTextCache>({
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

      drawImportsLayer({
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
        cache: importPath2DCacheRef.current,
      });

      if (!gcodeToolpath) return;

      drawToolpathLayer({
        ctx,
        gcodeToolpath,
        toolpathSelected,
        plotProgressCuts,
        plotProgressRapids,
        ppCutsCache: ppCutsPath2DRef.current,
        ppRapidsCache: ppRapidsPath2DRef.current,
        transform: { a, d, e, f, sx },
        physW,
        physH,
        vpZoom: vp.zoom,
        bedXMin,
        bedXMax,
        bedYMin,
        bedYMax,
      });
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
    theme,
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
