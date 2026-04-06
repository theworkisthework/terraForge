// Portions of SVG icon data (square-x, rotate-cw, crosshair) from Lucide (https://lucide.dev)
// ISC License
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of
// Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
// Permission to use, copy, modify, and/or distribute this software for any purpose
// with or without fee is hereby granted, provided that the above copyright notice
// and this permission notice appear in all copies.
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
// REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
// FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT,
// OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE,
// DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS
// ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
import { useRef, useEffect, useState, useCallback } from "react";
import { Crosshair } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "../store/canvasStore";
import {
  selectPlotCanvasCanvasState,
  selectPlotCanvasHandleOverlayState,
  selectPlotCanvasToolpathState,
} from "../store/canvasSelectors";
import { useMachineStore } from "../store/machineStore";
import { usePlotProgress } from "../utils/usePlotProgress";
import { DEFAULT_STROKE_WIDTH_MM, type SvgImport } from "../../../types";

const MM_TO_PX = 3; // internal SVG scale: 3 px per mm
const PAD = 30; // margin around bed in SVG pixels
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;
const ZOOM_STEP = 1.25; // per keyboard / button press

// Lucide rotate-cw cursor shown on the rotation handle and while rotating.
// White stroke, 24×24, encoded as an SVG data URL.
// Hotspot centred at (12, 12); fallback to ew-resize for browsers that don't support custom cursors.
const ROTATE_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E" +
  "%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'/%3E" +
  "%3Cpath d='M21 3v5h-5'/%3E" +
  '%3C/svg%3E") 12 12, ew-resize';

// Handle positions: tl, t, tr, r, br, b, bl, l
type HandlePos = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";

// ─── Viewport ─────────────────────────────────────────────────────────────────
interface Vp {
  zoom: number;
  panX: number;
  panY: number;
}

/** Scale each RGB channel of a CSS hex colour by `factor` (clamped to 0-255). */
function scaleHexColor(hex: string, factor: number): string {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * factor));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * factor));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function PlotCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    imports,
    selectedImportId,
    allImportsSelected,
    selectedGroupId,
    selectGroup,
    selectImport,
    removeImport,
    clearImports,
    updateImport,
    layerGroups,
    pageTemplate,
    pageSizes,
  } = useCanvasStore(useShallow(selectPlotCanvasCanvasState));
  const {
    gcodeToolpath,
    setGcodeToolpath,
    gcodeSource,
    toolpathSelected,
    selectToolpath,
    plotProgressCuts,
    plotProgressRapids,
  } = useCanvasStore(useShallow(selectPlotCanvasToolpathState));
  const activeConfig = useMachineStore((s) => s.activeConfig);
  const selectedJobFile = useMachineStore((s) => s.selectedJobFile);
  const setSelectedJobFile = useMachineStore((s) => s.setSelectedJobFile);
  const machineStatus = useMachineStore((s) => s.status);
  const connected = useMachineStore((s) => s.connected);
  const isJobActive =
    machineStatus?.state === "Run" || machineStatus?.state === "Hold";

  // Activate live plot-progress tracking whenever a toolpath is loaded
  // and the machine is running a job.
  usePlotProgress();

  const config = activeConfig();
  const bedW = config?.bedWidth ?? 220;
  const bedH = config?.bedHeight ?? 200;
  const origin = config?.origin ?? "bottom-left";
  const isBottom = origin === "bottom-left" || origin === "bottom-right";
  const isRight = origin === "bottom-right" || origin === "top-right";
  const isCenter = origin === "center";
  // Bed coordinate bounds in machine mm (center origin uses ±half-dim)
  const bedXMin = isCenter ? -bedW / 2 : 0;
  const bedXMax = isCenter ? bedW / 2 : bedW;
  const bedYMin = isCenter ? -bedH / 2 : 0;
  const bedYMax = isCenter ? bedH / 2 : bedH;

  const canvasW = bedW * MM_TO_PX + PAD * 2;
  const canvasH = bedH * MM_TO_PX + PAD * 2;

  // ── Viewport state ────────────────────────────────────────────────────────────
  // vpRef mirrors vp for use inside event-handler closures without stale captures.
  const [vp, _setVp] = useState<Vp>({ zoom: 1, panX: 0, panY: 0 });
  const vpRef = useRef<Vp>(vp);
  const setVp = useCallback((next: Vp) => {
    vpRef.current = next;
    _setVp(next);
  }, []);

  // Container dimensions — fed to RulerOverlay (screen-space rulers).
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // fittedRef: true → resize re-fits the bed; false → resize preserves zoom + center.
  const [fitted, _setFitted] = useState(true);
  const fittedRef = useRef(true);
  const setFitted = useCallback((v: boolean) => {
    fittedRef.current = v;
    _setFitted(v);
  }, []);

  // ── Fit helpers ───────────────────────────────────────────────────────────────
  const computeFit = useCallback(
    (w: number, h: number): Vp => {
      const pad = 8;
      const zoom = Math.max(
        MIN_ZOOM,
        Math.min((w - pad * 2) / canvasW, (h - pad * 2) / canvasH),
      );
      return {
        zoom,
        panX: (w - canvasW * zoom) / 2,
        panY: (h - canvasH * zoom) / 2,
      };
    },
    [canvasW, canvasH],
  );

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setVp(computeFit(width, height));
    setFitted(true);
  }, [computeFit, setVp, setFitted]);

  // ── Zoom helper — centered on a client-space point or the container centre ────
  const zoomBy = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = clientX !== undefined ? clientX - rect.left : rect.width / 2;
      const my = clientY !== undefined ? clientY - rect.top : rect.height / 2;
      const old = vpRef.current;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, old.zoom * factor));
      const cx = (mx - old.panX) / old.zoom;
      const cy = (my - old.panY) / old.zoom;
      setVp({
        zoom: newZoom,
        panX: mx - cx * newZoom,
        panY: my - cy * newZoom,
      });
      setFitted(false);
    },
    [setVp, setFitted],
  );

  // ── ResizeObserver — initial fit + responsive resize ─────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let first = true;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
      if (first || fittedRef.current) {
        first = false;
        setVp(computeFit(width, height));
      } else {
        // Keep zoom; slide pan to maintain the same content pixel at the centre.
        const old = vpRef.current;
        const cx = (width / 2 - old.panX) / old.zoom;
        const cy = (height / 2 - old.panY) / old.zoom;
        setVp({
          zoom: old.zoom,
          panX: width / 2 - cx * old.zoom,
          panY: height / 2 - cy * old.zoom,
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [computeFit, setVp]);

  // ── Scroll wheel → zoom (non-passive so we can preventDefault) ───────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Tracks the last known WCO (work-coordinate offset) from raw FluidNC status.
  // WPos = MPos − WCO, computed here the same way as in usePlotProgress so the
  // crosshair stays on the correct work position even when FluidNC only sends MPos.
  const penWcoRef = useRef({ x: 0, y: 0, z: 0 });

  // ── Pan state ─────────────────────────────────────────────────────────────────
  const panStartRef = useRef<{
    mx: number;
    my: number;
    panX: number;
    panY: number;
  } | null>(null);
  // Set to true at the end of any drag gesture so the SVG's onClick does not
  // immediately deselect the import that was just moved / scaled / rotated.
  const justDraggedRef = useRef(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const spaceRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  const startPan = useCallback((clientX: number, clientY: number) => {
    panStartRef.current = {
      mx: clientX,
      my: clientY,
      panX: vpRef.current.panX,
      panY: vpRef.current.panY,
    };
    setIsPanning(true);
  }, []);

  // ── Drag state (object move) ──────────────────────────────────────────────────
  const [dragging, setDragging] = useState<{
    id: string;
    startMouseX: number;
    startMouseY: number;
    startObjX: number;
    startObjY: number;
    /** Set when dragging all selected imports as a group. */
    group?: { id: string; startX: number; startY: number }[];
  } | null>(null);

  // ── Scale-handle state ────────────────────────────────────────────────────────
  const [scaling, setScaling] = useState<{
    id: string;
    handle: HandlePos;
    startMouseX: number;
    startMouseY: number;
    startScale: number;
    startObjX: number;
    startObjY: number;
    startW: number;
    startH: number;
  } | null>(null);

  // ── Rotate-handle state ───────────────────────────────────────────────────────
  const [rotating, setRotating] = useState<{
    id: string;
    cx: number; // centre x in SVG canvas px
    cy: number; // centre y in SVG canvas px
    startAngle: number; // atan2 of (mouse → centre) vector at mousedown (rad)
    startRotation: number; // imp.rotation at mousedown (degrees)
  } | null>(null);

  // ── Group scale-handle state ──────────────────────────────────────────────────
  const [groupScaling, setGroupScaling] = useState<{
    handle: HandlePos;
    startMouseX: number;
    startMouseY: number;
    gCx: number;
    gCy: number; // group AABB centre in SVG world px
    gHW: number;
    gHH: number; // group AABB half-extents in SVG world px
    items: {
      id: string;
      startScaleX: number;
      startScaleY: number;
      cxSvg: number; // import centre in SVG world px at gesture start
      cySvg: number;
    }[];
  } | null>(null);

  // ── Group rotate-handle state ─────────────────────────────────────────────────
  const [groupRotating, setGroupRotating] = useState<{
    gCx: number;
    gCy: number; // group AABB centre in SVG world px
    gHW: number; // group AABB half-width in SVG world px (with padding)
    gHH: number; // group AABB half-height in SVG world px (with padding)
    startAngle: number;
    baseOBBAngle: number; // accumulated OBB angle from previous gestures (degrees)
    items: {
      id: string;
      cxSvg: number;
      cySvg: number;
      startX: number;
      startY: number;
      startRotation: number;
    }[];
  } | null>(null);

  // Live OBB angle (degrees) updated on every mousemove during a rotation gesture.
  // Equals baseOBBAngle + current-gesture delta.
  const [groupOBBAngle, setGroupOBBAngle] = useState(0);

  // OBB geometry persisted after a rotation gesture so the box keeps its
  // orientation when the mouse is released.
  const [persistentGroupOBB, setPersistentGroupOBB] = useState<{
    gCx: number;
    gCy: number;
    gHW: number;
    gHH: number;
    angle: number;
  } | null>(null);
  const persistentGroupOBBRef = useRef(persistentGroupOBB);
  persistentGroupOBBRef.current = persistentGroupOBB;

  // Clear the persistent OBB whenever the group selection is dropped so a
  // new Ctrl+A always starts with a fresh axis-aligned bounding box.
  useEffect(() => {
    if (!allImportsSelected && !selectedGroupId) {
      setPersistentGroupOBB(null);
      setGroupOBBAngle(0);
    }
  }, [allImportsSelected, selectedGroupId]);

  // ── Toolpath selection ────────────────────────────────────────────────────────
  // toolpathSelected and selectToolpath live in canvasStore so PropertiesPanel
  // can react to canvas selection changes (and vice versa).

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      // Space → enable pan mode
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        spaceRef.current = true;
        setSpaceDown(true);
      }

      // Delete / Backspace → remove selected item
      if (e.key === "Delete" || e.key === "Backspace") {
        if (allImportsSelected) {
          clearImports();
        } else if (selectedGroupId) {
          const st = useCanvasStore.getState();
          const groupImportIds = new Set(
            st.layerGroups.find((g) => g.id === selectedGroupId)?.importIds ??
              [],
          );
          st.imports
            .filter((i) => groupImportIds.has(i.id))
            .forEach((i) => st.removeImport(i.id));
          selectGroup(null);
        } else if (selectedImportId) {
          removeImport(selectedImportId);
        } else if (toolpathSelected && !isJobActive) {
          setGcodeToolpath(null);
          // selectedJobFile is cleared by the gcodeToolpath→null effect below.
        }
      }

      // Escape → deselect
      if (e.key === "Escape") {
        selectImport(null);
        selectToolpath(false);
      }

      // Ctrl/Cmd + Shift + + / - → keyboard zoom
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          zoomBy(ZOOM_STEP);
        }
        if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          zoomBy(1 / ZOOM_STEP);
        }
      }

      // Ctrl/Cmd + 0 → fit to view
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        fitToView();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        setSpaceDown(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    selectedImportId,
    allImportsSelected,
    selectedGroupId,
    selectGroup,
    toolpathSelected,
    isJobActive,
    removeImport,
    clearImports,
    selectImport,
    selectToolpath,
    setGcodeToolpath,
    zoomBy,
    fitToView,
  ]);

  // ── Clear selectedJobFile when the toolpath is removed ─────────────────────
  // Detects the non-null → null transition so clearing the toolpath (via the
  // ✕ button, Delete key, or any other path) always resets the job panel.
  const prevGcodeToolpathRef = useRef(gcodeToolpath);
  useEffect(() => {
    const prev = prevGcodeToolpathRef.current;
    prevGcodeToolpathRef.current = gcodeToolpath;
    if (prev !== null && gcodeToolpath === null) {
      setSelectedJobFile(null);
    }
  }, [gcodeToolpath, setSelectedJobFile]);

  // ── Sync toolpathSelected ↔ selectedJobFile ───────────────────────────────────
  // One central effect keeps the file browser and job panel in lock-step with
  // the canvas toolpath selection (and vice versa).
  //   selecting   → restore selectedJobFile from gcodeSource
  //   deselecting → clear selectedJobFile only if it was pointing at gcodeSource
  useEffect(() => {
    if (toolpathSelected && gcodeSource) {
      setSelectedJobFile({
        path: gcodeSource.path,
        name: gcodeSource.name,
        source: gcodeSource.source,
      });
    } else if (!toolpathSelected && gcodeSource) {
      const current = useMachineStore.getState().selectedJobFile;
      // Only clear selectedJobFile when the toolpath came from a local file.
      // Remote-file selections (sd/fs) from the file browser should persist
      // independently of canvas toolpath selection state.
      if (
        current?.path === gcodeSource.path &&
        gcodeSource.source === "local"
      ) {
        setSelectedJobFile(null);
      }
    }
    // Intentionally only re-run when toolpathSelected changes; gcodeSource
    // changing means a new toolpath was loaded which resets toolpathSelected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolpathSelected]);

  // ── SVG coordinate helpers (map machine-mm → canvas SVG px) ─────────────────
  // Y: bottom-origins flip so mm=0 is at the bottom of the bed rectangle.
  const getBedY = (mmY: number) =>
    isBottom ? canvasH - PAD - mmY * MM_TO_PX : PAD + mmY * MM_TO_PX;
  // X: right-origins flip so mm=0 is at the right of the bed rectangle.
  const getBedX = (mmX: number) =>
    isRight ? PAD + (bedW - mmX) * MM_TO_PX : PAD + mmX * MM_TO_PX;

  // ── Object drag handlers ──────────────────────────────────────────────────────
  const onImportMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (spaceRef.current) return; // space held → pan mode, not drag
      e.stopPropagation();
      const state = useCanvasStore.getState();
      state.snapshotForGesture();
      // In group mode clicking an import continues the group drag without
      // breaking out to single selection.
      if (state.allImportsSelected) {
        setDragging({
          id,
          startMouseX: e.clientX,
          startMouseY: e.clientY,
          startObjX: 0,
          startObjY: 0,
          group: state.imports.map((imp) => ({
            id: imp.id,
            startX: imp.x,
            startY: imp.y,
          })),
        });
        return;
      }
      // Layer-group mode: if the clicked import belongs to the selected group,
      // drag all group members together.
      if (state.selectedGroupId) {
        const groupImportIds = new Set(
          state.layerGroups.find((g) => g.id === state.selectedGroupId)
            ?.importIds ?? [],
        );
        if (groupImportIds.has(id)) {
          setDragging({
            id,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startObjX: 0,
            startObjY: 0,
            group: state.imports
              .filter((i) => groupImportIds.has(i.id))
              .map((imp) => ({ id: imp.id, startX: imp.x, startY: imp.y })),
          });
          return;
        }
      }
      selectImport(id);
      const imp = state.imports.find((i) => i.id === id);
      if (!imp) return;
      setDragging({
        id,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startObjX: imp.x,
        startObjY: imp.y,
      });
    },
    [selectImport],
  );

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent<SVGCircleElement>, id: string, handle: HandlePos) => {
      e.stopPropagation();
      useCanvasStore.getState().snapshotForGesture();
      const imp = useCanvasStore.getState().imports.find((i) => i.id === id);
      if (!imp) return;
      const sX = imp.scaleX ?? imp.scale;
      const sY = imp.scaleY ?? imp.scale;
      setScaling({
        id,
        handle,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startScale: imp.scale,
        startScaleX: sX,
        startScaleY: sY,
        ratioLocked: imp.scaleX === undefined, // unlocked when scaleX is set
        startObjX: imp.x,
        startObjY: imp.y,
        startW: imp.svgWidth * sX * MM_TO_PX,
        startH: imp.svgHeight * sY * MM_TO_PX,
      });
    },
    [],
  );

  const onRotateHandleMouseDown = useCallback(
    (
      e: React.MouseEvent<SVGCircleElement>,
      id: string,
      cxSvg: number,
      cySvg: number,
    ) => {
      e.stopPropagation();
      useCanvasStore.getState().snapshotForGesture();
      const imp = useCanvasStore.getState().imports.find((i) => i.id === id);
      if (!imp) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const vp = vpRef.current;
      const mx = (e.clientX - rect.left - vp.panX) / vp.zoom;
      const my = (e.clientY - rect.top - vp.panY) / vp.zoom;
      setRotating({
        id,
        cx: cxSvg,
        cy: cySvg,
        startAngle: Math.atan2(my - cySvg, mx - cxSvg),
        startRotation: imp.rotation,
      });
    },
    [],
  );

  // Mutable refs so group gesture callbacks can read current layout values
  // without needing to be re-created on every render.
  const isBottomRef = useRef(isBottom);
  isBottomRef.current = isBottom;
  const canvasHRef = useRef(canvasH);
  canvasHRef.current = canvasH;
  const getBedYRef = useRef(getBedY);
  getBedYRef.current = getBedY;

  // ── Group handle callbacks ────────────────────────────────────────────────────
  const onGroupHandleMouseDown = useCallback(
    (e: React.MouseEvent<SVGCircleElement>, handle: HandlePos) => {
      e.stopPropagation();
      useCanvasStore.getState().snapshotForGesture();
      const state = useCanvasStore.getState();
      const {
        imports: allImps,
        selectedGroupId: gid,
        layerGroups: groups,
      } = state;
      const imps = gid
        ? allImps.filter((i) =>
            groups.find((g) => g.id === gid)?.importIds.includes(i.id),
          )
        : allImps;
      const gBedY = getBedYRef.current;
      let minWx = Infinity,
        maxWx = -Infinity,
        minWy = Infinity,
        maxWy = -Infinity;
      const items: {
        id: string;
        startScaleX: number;
        startScaleY: number;
        cxSvg: number;
        cySvg: number;
      }[] = [];
      for (const imp of imps) {
        const sX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
        const sY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
        const left = PAD + imp.x * MM_TO_PX;
        const top = gBedY(imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale));
        const hw = (imp.svgWidth * sX) / 2;
        const hh = (imp.svgHeight * sY) / 2;
        const cxSvg = left + hw;
        const cySvg = top + hh;
        const rad = ((imp.rotation ?? 0) * Math.PI) / 180;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        for (const [ox, oy] of [
          [-hw, -hh],
          [hw, -hh],
          [hw, hh],
          [-hw, hh],
        ] as [number, number][]) {
          const wx = cxSvg + ox * cosA - oy * sinA;
          const wy = cySvg + ox * sinA + oy * cosA;
          if (wx < minWx) minWx = wx;
          if (wx > maxWx) maxWx = wx;
          if (wy < minWy) minWy = wy;
          if (wy > maxWy) maxWy = wy;
        }
        items.push({
          id: imp.id,
          startScaleX: imp.scaleX ?? imp.scale,
          startScaleY: imp.scaleY ?? imp.scale,
          cxSvg,
          cySvg,
        });
      }
      setPersistentGroupOBB(null); // geometry changes — discard stale OBB
      setGroupScaling({
        handle,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        gCx: (minWx + maxWx) / 2,
        gCy: (minWy + maxWy) / 2,
        gHW: (maxWx - minWx) / 2,
        gHH: (maxWy - minWy) / 2,
        items,
      });
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onGroupRotateHandleMouseDown = useCallback(
    (
      e: React.MouseEvent<SVGCircleElement>,
      gCx: number,
      gCy: number,
      gHW: number,
      gHH: number,
    ) => {
      e.stopPropagation();
      useCanvasStore.getState().snapshotForGesture();
      const state = useCanvasStore.getState();
      const {
        imports: allImps,
        selectedGroupId: gid,
        layerGroups: groups,
      } = state;
      const imps = gid
        ? allImps.filter((i) =>
            groups.find((g) => g.id === gid)?.importIds.includes(i.id),
          )
        : allImps;
      const gBedY = getBedYRef.current;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const vp = vpRef.current;
      const mx = (e.clientX - rect.left - vp.panX) / vp.zoom;
      const my = (e.clientY - rect.top - vp.panY) / vp.zoom;
      const baseOBBAngle = persistentGroupOBBRef.current?.angle ?? 0;
      setGroupOBBAngle(baseOBBAngle);
      setGroupRotating({
        gCx,
        gCy,
        gHW,
        gHH,
        baseOBBAngle,
        startAngle: Math.atan2(my - gCy, mx - gCx),
        items: imps.map((imp) => {
          const sX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
          const sY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
          const left = PAD + imp.x * MM_TO_PX;
          const top = gBedY(imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale));
          return {
            id: imp.id,
            cxSvg: left + (imp.svgWidth * sX) / 2,
            cySvg: top + (imp.svgHeight * sY) / 2,
            startX: imp.x,
            startY: imp.y,
            startRotation: imp.rotation ?? 0,
          };
        }),
      });
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Starts a group drag — fired from the GroupHandleOverlay hit area. */
  const onGroupMouseDown = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (spaceRef.current) return;
      e.stopPropagation();
      useCanvasStore.getState().snapshotForGesture();
      const state = useCanvasStore.getState();
      const {
        imports: allImps,
        selectedGroupId: gid,
        layerGroups: groups,
      } = state;
      const groupImps = gid
        ? allImps.filter((i) =>
            groups.find((g) => g.id === gid)?.importIds.includes(i.id),
          )
        : allImps;
      setDragging({
        id: "__group__",
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startObjX: 0,
        startObjY: 0,
        group: groupImps.map((imp) => ({
          id: imp.id,
          startX: imp.x,
          startY: imp.y,
        })),
      });
    },
    [],
  );

  // ── Unified window mousemove / mouseup ────────────────────────────────────────
  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      // Pan (middle mouse or Space + drag) — takes priority
      if (panStartRef.current) {
        const dx = e.clientX - panStartRef.current.mx;
        const dy = e.clientY - panStartRef.current.my;
        setVp({
          zoom: vpRef.current.zoom,
          panX: panStartRef.current.panX + dx,
          panY: panStartRef.current.panY + dy,
        });
        setFitted(false);
        return;
      }

      // Object drag — convert client-px delta → mm (dividing by zoom + MM_TO_PX)
      if (dragging) {
        const zoom = vpRef.current.zoom;
        const dx = (e.clientX - dragging.startMouseX) / (MM_TO_PX * zoom);
        const dy = -(e.clientY - dragging.startMouseY) / (MM_TO_PX * zoom);
        if (dragging.group) {
          for (const item of dragging.group) {
            updateImport(item.id, { x: item.startX + dx, y: item.startY + dy });
          }
        } else {
          updateImport(dragging.id, {
            x: dragging.startObjX + dx,
            y: dragging.startObjY + dy,
          });
        }
      }

      // Scale-handle drag
      if (scaling) {
        const zoom = vpRef.current.zoom;
        const dx = (e.clientX - scaling.startMouseX) / zoom;
        const dy = (e.clientY - scaling.startMouseY) / zoom;
        const h = scaling.handle;

        if (scaling.ratioLocked) {
          // ─ Locked: uniform scale ───────────────────────────────────
          let delta = 0;
          if (h === "tl" || h === "bl") delta = -dx;
          else if (h === "tr" || h === "br") delta = dx;
          else if (h === "t") delta = -dy;
          else if (h === "b") delta = dy;
          else if (h === "r") delta = dx;
          else if (h === "l") delta = -dx;
          const dimPx =
            h === "t" || h === "b" ? scaling.startH : scaling.startW;
          const rawScale = Math.max(
            0.001,
            scaling.startScale * (1 + delta / dimPx),
          );
          updateImport(scaling.id, {
            scale: rawScale,
            scaleX: undefined,
            scaleY: undefined,
          });
        } else {
          // ─ Unlocked: drive each axis independently ─────────────────
          // Determine which axes this handle moves.
          const affectsX =
            h === "l" ||
            h === "r" ||
            h === "tl" ||
            h === "tr" ||
            h === "br" ||
            h === "bl";
          const affectsY =
            h === "t" ||
            h === "b" ||
            h === "tl" ||
            h === "tr" ||
            h === "br" ||
            h === "bl";
          // Positive deltaX = object grows in X; positive deltaY = grows in Y.
          const deltaX = h === "r" || h === "tr" || h === "br" ? dx : -dx;
          const deltaY = h === "b" || h === "br" || h === "bl" ? dy : -dy;

          const patch: { scaleX?: number; scaleY?: number } = {};
          if (affectsX)
            patch.scaleX = Math.max(
              0.001,
              scaling.startScaleX * (1 + deltaX / scaling.startW),
            );
          if (affectsY)
            patch.scaleY = Math.max(
              0.001,
              scaling.startScaleY * (1 + deltaY / scaling.startH),
            );
          updateImport(scaling.id, patch);
        }
      }

      // Rotation-handle drag
      if (rotating) {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const vp = vpRef.current;
        const mx = (e.clientX - rect.left - vp.panX) / vp.zoom;
        const my = (e.clientY - rect.top - vp.panY) / vp.zoom;
        const angle = Math.atan2(my - rotating.cy, mx - rotating.cx);
        const delta = (angle - rotating.startAngle) * (180 / Math.PI);
        updateImport(rotating.id, { rotation: rotating.startRotation + delta });
      }

      // Group scale-handle drag
      if (groupScaling) {
        const zoom = vpRef.current.zoom;
        const dx = (e.clientX - groupScaling.startMouseX) / zoom;
        const dy = (e.clientY - groupScaling.startMouseY) / zoom;
        const h = groupScaling.handle;
        const { gCx, gCy, gHW, gHH } = groupScaling;
        // Scale factor in the primary axis for this handle
        let delta = 0;
        if (h === "tl" || h === "bl") delta = -dx;
        else if (h === "tr" || h === "br") delta = dx;
        else if (h === "t") delta = -dy;
        else if (h === "b") delta = dy;
        else if (h === "r") delta = dx;
        else if (h === "l") delta = -dx;
        const dimPx = h === "t" || h === "b" ? 2 * gHH : 2 * gHW;
        const k = Math.max(0.001, 1 + delta / dimPx);
        // For edge handles scale only one axis; corners = uniform.
        const kX = h === "t" || h === "b" ? 1 : k;
        const kY = h === "l" || h === "r" ? 1 : k;
        // Anchor: opposite corner/edge in SVG world coords
        const ax =
          h === "tl" || h === "bl"
            ? gCx + gHW
            : h === "tr" || h === "br"
              ? gCx - gHW
              : gCx;
        const ay =
          h === "tl" || h === "tr"
            ? gCy + gHH
            : h === "bl" || h === "br"
              ? gCy - gHH
              : gCy;
        const ib = isBottomRef.current;
        const cH = canvasHRef.current;
        for (const item of groupScaling.items) {
          const imp = useCanvasStore
            .getState()
            .imports.find((i) => i.id === item.id);
          if (!imp) continue;
          const newSX = item.startScaleX * kX;
          const newSY = item.startScaleY * kY;
          const newCxSvg = ax + (item.cxSvg - ax) * kX;
          const newCySvg = ay + (item.cySvg - ay) * kY;
          const newX = (newCxSvg - PAD) / MM_TO_PX - (imp.svgWidth * newSX) / 2;
          const newY = ib
            ? (cH - PAD - newCySvg) / MM_TO_PX - (imp.svgHeight * newSY) / 2
            : (newCySvg - PAD) / MM_TO_PX - (imp.svgHeight * newSY) / 2;
          updateImport(item.id, {
            x: newX,
            y: newY,
            scaleX: newSX,
            scaleY: newSY,
          });
        }
      }

      // Group rotate-handle drag
      if (groupRotating) {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const vp = vpRef.current;
        const mx = (e.clientX - rect.left - vp.panX) / vp.zoom;
        const my = (e.clientY - rect.top - vp.panY) / vp.zoom;
        const angle = Math.atan2(
          my - groupRotating.gCy,
          mx - groupRotating.gCx,
        );
        const delta = (angle - groupRotating.startAngle) * (180 / Math.PI);
        setGroupOBBAngle(groupRotating.baseOBBAngle + delta);
        const rad = (delta * Math.PI) / 180;
        const cosD = Math.cos(rad);
        const sinD = Math.sin(rad);
        const ib = isBottomRef.current;
        const cH = canvasHRef.current;
        for (const item of groupRotating.items) {
          const imp = useCanvasStore
            .getState()
            .imports.find((i) => i.id === item.id);
          if (!imp) continue;
          const dx2 = item.cxSvg - groupRotating.gCx;
          const dy2 = item.cySvg - groupRotating.gCy;
          const newCxSvg = groupRotating.gCx + dx2 * cosD - dy2 * sinD;
          const newCySvg = groupRotating.gCy + dx2 * sinD + dy2 * cosD;
          const sX = imp.scaleX ?? imp.scale;
          const sY = imp.scaleY ?? imp.scale;
          const newX = (newCxSvg - PAD) / MM_TO_PX - (imp.svgWidth * sX) / 2;
          const newY = ib
            ? (cH - PAD - newCySvg) / MM_TO_PX - (imp.svgHeight * sY) / 2
            : (newCySvg - PAD) / MM_TO_PX - (imp.svgHeight * sY) / 2;
          updateImport(item.id, {
            x: newX,
            y: newY,
            rotation: item.startRotation + delta,
          });
        }
      }
    },
    [
      dragging,
      scaling,
      rotating,
      groupScaling,
      groupRotating,
      updateImport,
      setVp,
      setFitted,
    ],
  );

  const onMouseUp = useCallback(() => {
    // Commit gesture snapshot to undo stack (only if imports actually changed).
    useCanvasStore.getState().commitGesture();
    // If any gesture was active, mark it so the SVG onClick can ignore the
    // synthetic click that the browser fires after mouseup.
    if (
      dragging ||
      scaling ||
      rotating ||
      groupScaling ||
      groupRotating ||
      panStartRef.current
    ) {
      justDraggedRef.current = true;
    }
    setDragging(null);
    setScaling(null);
    setRotating(null);
    // Persist OBB orientation after a completed rotation gesture so the box
    // doesn't snap back to axis-aligned when the mouse is released.
    if (groupRotating) {
      setPersistentGroupOBB({
        gCx: groupRotating.gCx,
        gCy: groupRotating.gCy,
        gHW: groupRotating.gHW,
        gHH: groupRotating.gHH,
        angle: groupOBBAngle,
      });
    }
    // Discard stale OBB when drag or scale has changed the group's geometry.
    if (dragging?.group || groupScaling) {
      setPersistentGroupOBB(null);
    }
    setGroupScaling(null);
    setGroupRotating(null);
    setGroupOBBAngle(0);
    if (panStartRef.current) {
      panStartRef.current = null;
      setIsPanning(false);
    }
  }, [dragging, scaling, rotating, groupScaling, groupRotating, groupOBBAngle]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // ── Container mousedown — middle mouse + Space+drag pan ───────────────────────
  const onContainerMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 1) {
        // Middle mouse → pan
        e.preventDefault();
        startPan(e.clientX, e.clientY);
      } else if (e.button === 0 && spaceRef.current) {
        // Space + left click → pan
        e.preventDefault();
        startPan(e.clientX, e.clientY);
      }
    },
    [startPan],
  );

  // Suppress browser context-menu on middle-click release
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => e.preventDefault(),
    [],
  );

  // ── Overlay button handlers ───────────────────────────────────────────────────
  const onZoomIn = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      zoomBy(ZOOM_STEP);
    },
    [zoomBy],
  );
  const onZoomOut = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      zoomBy(1 / ZOOM_STEP);
    },
    [zoomBy],
  );
  const onFit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      fitToView();
    },
    [fitToView],
  );

  // ── Toolpath canvas overlay ───────────────────────────────────────────────────
  // G-code toolpath (potentially hundreds of thousands of segments) is rendered
  // onto a separate <canvas> element instead of as SVG <path> elements.
  //
  // Why canvas beats SVG for dense paths:
  //   • No per-element DOM layout or style-cascade overhead
  //   • No vectorEffect="non-scaling-stroke" re-computation on every zoom/pan
  //   • Level-of-detail (LOD): sub-pixel segments are skipped based on current
  //     zoom level, dramatically reducing GPU work for dense G-code files
  //   • RAF debouncing: rapid pan/zoom events collapse into one repaint per frame
  //
  // Plot-progress overlays are rendered on the same canvas via cached Path2D
  // objects (rebuilt only when the overlay string actually changes, not on
  // every viewport update).
  const toolpathCanvasRef = useRef<HTMLCanvasElement>(null);

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

  // Minimum segment screen-length (CSS px) below which a segment is skipped.
  const LOD_PX = 0.4;

  useEffect(() => {
    let rafId: number | null = null;

    const draw = () => {
      rafId = null;
      const canvas = toolpathCanvasRef.current;
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

  // ── Cursor ────────────────────────────────────────────────────────────────────
  const cursor = spaceDown
    ? isPanning
      ? "grabbing"
      : "grab"
    : isPanning
      ? "grabbing"
      : rotating
        ? ROTATE_CURSOR
        : undefined;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden bg-app relative select-none"
      style={{ cursor }}
      onMouseDown={onContainerMouseDown}
      onContextMenu={onContextMenu}
    >
      {/* ── Toolpath canvas — renders G-code paths with per-frame LOD.
           Positioned below the main SVG so SVG imports appear on top.
           pointerEvents:none keeps all click/drag handling on the SVG layer. ── */}
      <canvas
        ref={toolpathCanvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          display: "block",
          width: containerSize.w || canvasW,
          height: containerSize.h || canvasH,
          pointerEvents: "none",
        }}
      />

      {/* ── Canvas SVG — fills the container; viewBox drives pan/zoom so the
           browser renders all paths at native screen resolution instead of
           rasterising a CSS-scaled compositing layer (which causes blurriness). ── */}
      <svg
        ref={svgRef}
        style={{ position: "absolute", top: 0, left: 0, display: "block" }}
        width={containerSize.w || canvasW}
        height={containerSize.h || canvasH}
        viewBox={
          containerSize.w > 0
            ? `${-vp.panX / vp.zoom} ${-vp.panY / vp.zoom} ${containerSize.w / vp.zoom} ${containerSize.h / vp.zoom}`
            : `0 0 ${canvasW} ${canvasH}`
        }
        className="cursor-default"
        onClick={() => {
          // Suppress deselect if a drag/scale/rotate/pan gesture just ended;
          // the browser synthesises a click on mouseup even after a drag.
          if (justDraggedRef.current) {
            justDraggedRef.current = false;
            return;
          }
          selectImport(null);
          selectToolpath(false);
        }}
      >
        {/* Bed background — filled by the canvas layer behind this SVG.
             fill="none" here so the canvas #0d1117 rect shows through. */}
        <rect
          x={PAD}
          y={PAD}
          width={bedW * MM_TO_PX}
          height={bedH * MM_TO_PX}
          fill="none"
          stroke="var(--tf-border)"
          strokeWidth={1}
        />

        {/* Grid — 10 mm intervals, major every 50 mm */}
        {Array.from(
          { length: Math.floor(bedW / 10) + 1 },
          (_, i) => i * 10,
        ).map((mm) => (
          <line
            key={`vg-${mm}`}
            x1={PAD + mm * MM_TO_PX}
            y1={PAD}
            x2={PAD + mm * MM_TO_PX}
            y2={PAD + bedH * MM_TO_PX}
            stroke="var(--tf-border)"
            strokeWidth={mm % 50 === 0 ? 0.8 : 0.3}
          />
        ))}
        {Array.from(
          { length: Math.floor(bedH / 10) + 1 },
          (_, i) => i * 10,
        ).map((mm) => (
          <line
            key={`hg-${mm}`}
            x1={PAD}
            y1={getBedY(mm)}
            x2={PAD + bedW * MM_TO_PX}
            y2={getBedY(mm)}
            stroke="var(--tf-border)"
            strokeWidth={mm % 50 === 0 ? 0.8 : 0.3}
          />
        ))}

        {/* Rulers are rendered as a screen-space overlay — see below */}

        {/* Page template overlay — non-interactive amber dashed rectangle
             showing the chosen paper size relative to the machine origin.
             Hidden from the layers panel; cannot be selected or edited. */}
        {pageTemplate &&
          (() => {
            const activeSize = pageSizes.find(
              (ps) => ps.id === pageTemplate.sizeId,
            );
            if (!activeSize) return null;
            const pgW = pageTemplate.landscape
              ? activeSize.heightMM
              : activeSize.widthMM;
            const pgH = pageTemplate.landscape
              ? activeSize.widthMM
              : activeSize.heightMM;
            // Convert page corners from machine mm to SVG canvas px.
            const svgX0 = getBedX(0);
            const svgX1 = getBedX(pgW);
            const svgY0 = getBedY(pgH); // top edge (H mm from origin)
            const svgY1 = getBedY(0); // origin edge
            const rectX = Math.min(svgX0, svgX1);
            const rectY = Math.min(svgY0, svgY1);
            const rectW = Math.abs(svgX1 - svgX0);
            const rectH = Math.abs(svgY1 - svgY0);
            const label = `${activeSize.name} ${pageTemplate.landscape ? "Landscape" : "Portrait"}`;
            // Keep label at a fixed ~11px screen size regardless of zoom level.
            const labelSize = 11 / vp.zoom;
            // Margin inset rect (in SVG px).
            const marginPx = (pageTemplate.marginMM ?? 20) * MM_TO_PX;
            const mX = rectX + marginPx;
            const mY = rectY + marginPx;
            const mW = rectW - marginPx * 2;
            const mH = rectH - marginPx * 2;
            return (
              <g pointerEvents="none">
                <rect
                  x={rectX}
                  y={rectY}
                  width={rectW}
                  height={rectH}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={1}
                  strokeDasharray="6 3"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.65}
                />
                {mW > 0 && mH > 0 && (
                  <rect
                    x={mX}
                    y={mY}
                    width={mW}
                    height={mH}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                    opacity={0.35}
                  />
                )}
                <text
                  x={rectX + 4 / vp.zoom}
                  y={rectY - 4 / vp.zoom}
                  fontSize={labelSize}
                  fill="#f59e0b"
                  opacity={0.65}
                  vectorEffect="non-scaling-stroke"
                  fontFamily="monospace"
                >
                  {label}
                </text>
              </g>
            );
          })()}

        {/* G-code toolpath hit-area (paths rendered on the canvas overlay below). */}
        {gcodeToolpath &&
          (() => {
            const { minX, maxX, minY, maxY } = gcodeToolpath.bounds;
            return (
              <>
                <g
                  transform={`translate(${
                    isCenter
                      ? PAD + (bedW / 2) * MM_TO_PX
                      : isRight
                        ? PAD + bedW * MM_TO_PX
                        : PAD
                  }, ${
                    isCenter
                      ? PAD + (bedH / 2) * MM_TO_PX
                      : isBottom
                        ? PAD + bedH * MM_TO_PX
                        : PAD
                  }) scale(${isRight ? -MM_TO_PX : MM_TO_PX}, ${isCenter || isBottom ? -MM_TO_PX : MM_TO_PX})`}
                >
                  {/* Invisible hit-area for selecting the toolpath */}
                  <rect
                    x={minX}
                    y={minY}
                    width={maxX - minX}
                    height={maxY - minY}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    vectorEffect="non-scaling-stroke"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectImport(null);
                      selectToolpath(true);
                      // selectedJobFile is synced by the toolpathSelected effect below.
                    }}
                  />
                </g>

                {toolpathSelected && (
                  <g pointerEvents="none" /> /* selection rendered in overlay SVG */
                )}
              </>
            );
          })()}

        {/* SVG imports — paths only; handles rendered in HandleOverlay */}
        {imports
          .filter((imp) => imp.visible)
          .map((imp) => (
            <ImportLayer
              key={imp.id}
              imp={imp}
              selected={
                allImportsSelected ||
                selectedImportId === imp.id ||
                (!!selectedGroupId &&
                  !!layerGroups
                    .find((g) => g.id === selectedGroupId)
                    ?.importIds.includes(imp.id))
              }
              onImportMouseDown={onImportMouseDown}
              getBedY={getBedY}
            />
          ))}
      </svg>

      {/* ── Handle overlay — bounding box + handles in pure screen-pixel space */}
      {(allImportsSelected || !!selectedGroupId) && containerSize.w > 0 ? (
        <GroupHandleOverlay
          imports={(allImportsSelected
            ? imports
            : imports.filter(
                (i) =>
                  !!layerGroups
                    .find((g) => g.id === selectedGroupId)
                    ?.importIds.includes(i.id),
              )
          ).filter((i) => i.visible)}
          zoom={vp.zoom}
          panX={vp.panX}
          panY={vp.panY}
          containerW={containerSize.w}
          containerH={containerSize.h}
          getBedY={getBedY}
          onGroupMouseDown={onGroupMouseDown}
          onGroupHandleMouseDown={onGroupHandleMouseDown}
          onGroupRotateHandleMouseDown={onGroupRotateHandleMouseDown}
          onDelete={
            allImportsSelected
              ? clearImports
              : () => {
                  const st = useCanvasStore.getState();
                  const gids = new Set(
                    st.layerGroups.find((g) => g.id === selectedGroupId)
                      ?.importIds ?? [],
                  );
                  st.imports
                    .filter((i) => gids.has(i.id))
                    .forEach((i) => st.removeImport(i.id));
                  selectGroup(null);
                }
          }
          activeOBB={
            groupRotating
              ? {
                  gCx: groupRotating.gCx,
                  gCy: groupRotating.gCy,
                  gHW: groupRotating.gHW,
                  gHH: groupRotating.gHH,
                  angle: groupOBBAngle,
                }
              : (persistentGroupOBB ?? undefined)
          }
        />
      ) : (
        selectedImportId &&
        containerSize.w > 0 &&
        (() => {
          const imp = imports.find((i) => i.id === selectedImportId);
          return imp ? (
            <HandleOverlay
              imp={imp}
              zoom={vp.zoom}
              panX={vp.panX}
              panY={vp.panY}
              containerW={containerSize.w}
              containerH={containerSize.h}
              getBedY={getBedY}
              onHandleMouseDown={onHandleMouseDown}
              onRotateHandleMouseDown={onRotateHandleMouseDown}
              onDelete={() => removeImport(imp.id)}
            />
          ) : null;
        })()
      )}

      {/* ── Toolpath selection overlay — screen-pixel space ─────────────── */}
      {gcodeToolpath &&
        toolpathSelected &&
        containerSize.w > 0 &&
        (() => {
          const { minX, maxX, minY, maxY } = gcodeToolpath.bounds;
          const svgL = isCenter
            ? PAD + (bedW / 2 + minX) * MM_TO_PX
            : isRight
              ? PAD + (bedW - maxX) * MM_TO_PX
              : PAD + minX * MM_TO_PX;
          const svgR = isCenter
            ? PAD + (bedW / 2 + maxX) * MM_TO_PX
            : isRight
              ? PAD + (bedW - minX) * MM_TO_PX
              : PAD + maxX * MM_TO_PX;
          const svgT = isCenter
            ? PAD + (bedH / 2 - maxY) * MM_TO_PX
            : isBottom
              ? PAD + (bedH - maxY) * MM_TO_PX
              : PAD + minY * MM_TO_PX;
          const svgB = isCenter
            ? PAD + (bedH / 2 - minY) * MM_TO_PX
            : isBottom
              ? PAD + (bedH - minY) * MM_TO_PX
              : PAD + maxY * MM_TO_PX;
          const sl = svgL * vp.zoom + vp.panX;
          const sr = svgR * vp.zoom + vp.panX;
          const st = svgT * vp.zoom + vp.panY;
          const sb = svgB * vp.zoom + vp.panY;
          const delSx = sr + 14;
          const delSy = st - 14;
          const TP_HALF = 8;
          const TP_PIP = 2.5;
          return (
            <svg
              style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                pointerEvents: "none",
                zIndex: 4,
              }}
              width={containerSize.w}
              height={containerSize.h}
              viewBox={`0 0 ${containerSize.w} ${containerSize.h}`}
            >
              <rect
                x={sl}
                y={st}
                width={sr - sl}
                height={sb - st}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={1}
                strokeDasharray="5 3"
                pointerEvents="none"
              />
              {(
                [
                  [sl, st],
                  [sr, st],
                  [sl, sb],
                  [sr, sb],
                ] as [number, number][]
              ).map(([cx, cy], i) => (
                <circle key={i} cx={cx} cy={cy} r={TP_PIP} fill="#38bdf8" />
              ))}
              {!isJobActive && (
                <g
                  transform={`translate(${delSx},${delSy})`}
                  style={{ cursor: "pointer", pointerEvents: "all" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setGcodeToolpath(null);
                    if (selectedJobFile?.source === "local")
                      setSelectedJobFile(null);
                  }}
                >
                  <svg
                    x={-TP_HALF}
                    y={-TP_HALF}
                    width={TP_HALF * 2}
                    height={TP_HALF * 2}
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      width="18"
                      height="18"
                      x="3"
                      y="3"
                      rx="2"
                      ry="2"
                      fill="var(--tf-accent)"
                      stroke="none"
                    />
                    <path d="m15 9-6 6" stroke="white" strokeWidth={2.5} />
                    <path d="m9 9 6 6" stroke="white" strokeWidth={2.5} />
                  </svg>
                </g>
              )}
            </svg>
          );
        })()}

      {/* ── Pen position crosshair ─────────────────────────────────────── */}
      {connected &&
        machineStatus &&
        containerSize.w > 0 &&
        (() => {
          // Keep WCO up to date (FluidNC sends it periodically, not every packet).
          const wcoMatch = machineStatus.raw?.match(
            /WCO:([-\d.]+),([-\d.]+),([-\d.]+)/,
          );
          if (wcoMatch) {
            penWcoRef.current = {
              x: +wcoMatch[1],
              y: +wcoMatch[2],
              z: +wcoMatch[3],
            };
          }
          // Prefer WPos: when FluidNC sends it; otherwise derive from MPos − WCO.
          const hasWPos =
            /WPos:/.test(machineStatus.raw ?? "") && machineStatus.wpos != null;
          const penX = hasWPos
            ? machineStatus.wpos!.x
            : machineStatus.mpos.x - penWcoRef.current.x;
          const penY = hasWPos
            ? machineStatus.wpos!.y
            : machineStatus.mpos.y - penWcoRef.current.y;
          // Convert machine-mm → canvas SVG px (same transform used by the toolpath g).
          const svgX = isCenter
            ? PAD + (bedW / 2 + penX) * MM_TO_PX
            : isRight
              ? PAD + (bedW - penX) * MM_TO_PX
              : PAD + penX * MM_TO_PX;
          const svgY = isCenter
            ? PAD + (bedH / 2 - penY) * MM_TO_PX
            : isBottom
              ? PAD + (bedH - penY) * MM_TO_PX
              : PAD + penY * MM_TO_PX;
          // Map canvas SVG px → screen px via current viewport transform.
          const sx = vp.panX + svgX * vp.zoom;
          const sy = vp.panY + svgY * vp.zoom;
          return (
            <div
              style={{
                position: "absolute",
                left: sx,
                top: sy,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: 5,
                color: "#22c55e",
                opacity: 0.9,
                filter: "drop-shadow(0 0 3px #15803d)",
              }}
            >
              <Crosshair size={24} strokeWidth={1.5} />
            </div>
          );
        })()}

      {/* ── Pen position crosshair ────────────────────────────────────────── */}
      {connected &&
        machineStatus &&
        containerSize.w > 0 &&
        (() => {
          // Keep WCO up to date (FluidNC sends it periodically, not every packet).
          const wcoMatch = machineStatus.raw?.match(
            /WCO:([-\d.]+),([-\d.]+),([-\d.]+)/,
          );
          if (wcoMatch) {
            penWcoRef.current = {
              x: +wcoMatch[1],
              y: +wcoMatch[2],
              z: +wcoMatch[3],
            };
          }
          // Prefer WPos: when FluidNC reports it; otherwise derive from MPos − WCO.
          const hasWPos =
            /WPos:/.test(machineStatus.raw ?? "") && machineStatus.wpos != null;
          const penX = hasWPos
            ? machineStatus.wpos!.x
            : machineStatus.mpos.x - penWcoRef.current.x;
          const penY = hasWPos
            ? machineStatus.wpos!.y
            : machineStatus.mpos.y - penWcoRef.current.y;
          // Convert machine-mm → canvas SVG px (mirrors the toolpath <g> transform).
          const svgX = isCenter
            ? PAD + (bedW / 2 + penX) * MM_TO_PX
            : isRight
              ? PAD + (bedW - penX) * MM_TO_PX
              : PAD + penX * MM_TO_PX;
          const svgY = isCenter
            ? PAD + (bedH / 2 - penY) * MM_TO_PX
            : isBottom
              ? PAD + (bedH - penY) * MM_TO_PX
              : PAD + penY * MM_TO_PX;
          // Map canvas SVG px → screen px via current viewport transform.
          const sx = vp.panX + svgX * vp.zoom;
          const sy = vp.panY + svgY * vp.zoom;
          return (
            <div
              style={{
                position: "absolute",
                left: sx,
                top: sy,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: 5,
                color: "#22c55e",
                opacity: 0.9,
                filter: "drop-shadow(0 0 3px #15803d)",
              }}
            >
              <Crosshair size={24} strokeWidth={1.5} />
            </div>
          );
        })()}

      {/* ── Zoom / pan overlay controls ───────────────────────────────────── */}
      <div
        className="absolute bottom-9 right-4 flex flex-col gap-1 z-10"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          title="Zoom in (Ctrl+Shift++)"
          onClick={onZoomIn}
          className="w-8 h-8 rounded bg-panel border border-border-ui text-content text-base font-bold
                     hover:bg-secondary active:bg-secondary-active flex items-center justify-center leading-none"
        >
          +
        </button>
        <button
          title="Zoom out (Ctrl+Shift+-)"
          onClick={onZoomOut}
          className="w-8 h-8 rounded bg-panel border border-border-ui text-content text-base font-bold
                     hover:bg-secondary active:bg-secondary-active flex items-center justify-center leading-none"
        >
          −
        </button>
        <button
          title={`Fit to view (Ctrl+0)${fitted ? " — active" : ""}`}
          onClick={onFit}
          className={`w-8 h-8 rounded border text-[11px] font-bold flex items-center justify-center leading-none
            ${
              fitted
                ? "bg-accent border-accent text-white"
                : "bg-panel border-border-ui text-content hover:bg-secondary"
            }`}
        >
          ⊡
        </button>
      </div>

      {/* ── Ruler overlay — screen-space, always crisp ──────────────────── */}
      {containerSize.w > 0 && (
        <RulerOverlay
          vp={vp}
          bedW={bedW}
          bedH={bedH}
          origin={config?.origin ?? "bottom-left"}
          containerW={containerSize.w}
          containerH={containerSize.h}
        />
      )}

      {/* ── Zoom-level badge ─────────────────────────────────────────────── */}
      <div className="absolute bottom-4 left-4 z-10 text-[10px] text-content-faint font-mono pointer-events-none">
        {Math.round(vp.zoom * 100)}%
      </div>

      {/* ── Space-pan hint ────────────────────────────────────────────────── */}
      {spaceDown && (
        <div className="absolute inset-0 z-20 pointer-events-none flex items-start justify-center pt-3">
          <span className="text-[10px] text-content-muted bg-app/80 px-2 py-0.5 rounded">
            Pan mode · drag to pan · release Space to exit
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Ruler overlay — renders in screen space so text is always native res ─────
//
// X ruler: bottom edge for bottom-left origin, top edge for top-left origin.
// Y ruler: always on the left edge.
// Ticks point INTO the canvas; labels are centered inside their strip.
// Y labels are rotated 90° so they fit the narrow strip without truncation.

const RULER_W = 20; // ruler strip width in screen pixels

interface RulerOverlayProps {
  vp: Vp;
  bedW: number;
  bedH: number;
  origin: "bottom-left" | "top-left" | "bottom-right" | "top-right" | "center";
  containerW: number;
  containerH: number;
}

function RulerOverlay({
  vp,
  bedW,
  bedH,
  origin,
  containerW,
  containerH,
}: RulerOverlayProps) {
  const isBottom = origin === "bottom-left" || origin === "bottom-right";
  const isRight = origin === "bottom-right" || origin === "top-right";
  const isCenter = origin === "center";
  const R = RULER_W;

  // ── Coordinate conversions ────────────────────────────────────────────────
  // Center: machine (0,0) at centre of bed; X right, Y up.
  // Right-origins: X mirrors (mm=0 at right edge).
  // Bottom-origins: Y mirrors (mm=0 at bottom edge).
  const mmToSx = (mm: number) =>
    isCenter
      ? vp.panX + (PAD + (bedW / 2 + mm) * MM_TO_PX) * vp.zoom
      : isRight
        ? vp.panX + (PAD + (bedW - mm) * MM_TO_PX) * vp.zoom
        : vp.panX + (PAD + mm * MM_TO_PX) * vp.zoom;
  const mmToSy = (mm: number) =>
    isCenter
      ? vp.panY + (PAD + (bedH / 2 - mm) * MM_TO_PX) * vp.zoom
      : isBottom
        ? vp.panY + (PAD + (bedH - mm) * MM_TO_PX) * vp.zoom
        : vp.panY + (PAD + mm * MM_TO_PX) * vp.zoom;
  const sxToMm = (sx: number) => {
    const raw = ((sx - vp.panX) / vp.zoom - PAD) / MM_TO_PX;
    if (isCenter) return raw - bedW / 2;
    return isRight ? bedW - raw : raw;
  };
  const syToMm = (sy: number) => {
    const raw = ((sy - vp.panY) / vp.zoom - PAD) / MM_TO_PX;
    if (isCenter) return bedH / 2 - raw;
    return isBottom ? bedH - raw : raw;
  };

  // ── Adaptive tick density (~40–100 px between major ticks on screen) ──────
  const pxPerMm = vp.zoom * MM_TO_PX;
  const [major, minor] =
    pxPerMm >= 30
      ? [5, 1]
      : pxPerMm >= 12
        ? [10, 2]
        : pxPerMm >= 6
          ? [20, 5]
          : pxPerMm >= 2
            ? [50, 10]
            : pxPerMm >= 0.8
              ? [100, 20]
              : [200, 50];

  const makeTicks = (
    a: number,
    b: number,
    minMm: number,
    maxMm: number,
  ): number[] => {
    const lo = Math.ceil(Math.min(a, b) / minor) * minor;
    const hi = Math.floor(Math.max(a, b) / minor) * minor;
    const out: number[] = [];
    for (let mm = lo; mm <= hi; mm += minor)
      if (mm >= minMm && mm <= maxMm) out.push(mm);
    return out;
  };

  // ── Layout: X ruler strip (bottom-origins → bottom edge; top-origins → top edge) ──
  const xSepY = isBottom || isCenter ? containerH - R : R;
  const xTickDir = isBottom || isCenter ? 1 : -1; // into the strip
  const xLabelY = isBottom || isCenter ? containerH - R / 2 : R / 2;

  // ── Layout: Y ruler strip (right-origins → right edge; left-origins → left edge) ──
  const ySepX = isRight ? containerW - R : R;
  const yTickDir = isRight ? 1 : -1; // into the strip
  const yLabelX = isRight ? containerW - R / 2 : R / 2;
  const yStripEdgeX = isRight ? containerW - R : 0;
  const yStripTopY = isBottom || isCenter ? 0 : R;
  const yStripBotY = isBottom || isCenter ? containerH - R : containerH;

  // ── Tick ranges ───────────────────────────────────────────────────────────
  const xTickEdge = isRight ? containerW - R : containerW;
  const xBedMin = isCenter ? -bedW / 2 : 0;
  const xBedMax = isCenter ? bedW / 2 : bedW;
  const yBedMin = isCenter ? -bedH / 2 : 0;
  const yBedMax = isCenter ? bedH / 2 : bedH;
  const xTicks = makeTicks(sxToMm(R), sxToMm(xTickEdge), xBedMin, xBedMax);
  const yTicks = makeTicks(
    syToMm(yStripTopY),
    syToMm(yStripBotY),
    yBedMin,
    yBedMax,
  );

  // ── Visuals ───────────────────────────────────────────────────────────────
  const TICK_COL = "var(--tf-border)";
  const LABEL_COL = "var(--tf-text-muted)";
  const ORIGIN_COL = "var(--tf-accent)";
  const BG = "var(--tf-bg-app)";
  const FONT = 9;
  const MAJOR_LEN = Math.round(R * 0.4);
  const MINOR_LEN = Math.round(R * 0.2);

  // Origin dot — visible in the canvas area (between the ruler strips)
  const originSx = mmToSx(0);
  const originSy = mmToSy(0);
  const originVisible =
    originSx >= R &&
    originSx <= containerW - R &&
    originSy >= yStripTopY &&
    originSy <= yStripBotY;

  // Corner square position
  const cornerX = isRight ? containerW - R : 0;
  const cornerY = isBottom || isCenter ? containerH - R : 0;

  // X separator spans between the Y strips
  const xSepX1 = isRight ? 0 : R;
  const xSepX2 = isRight ? containerW - R : containerW;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: containerW,
        height: containerH,
        overflow: "hidden",
        zIndex: 15,
      }}
      pointerEvents="none"
    >
      {/* ── Strip backgrounds ─────────────────────────────────────────────── */}
      <rect
        x={xSepX1}
        y={isBottom || isCenter ? containerH - R : 0}
        width={xSepX2 - xSepX1}
        height={R}
        fill={BG}
      />
      <rect
        x={yStripEdgeX}
        y={yStripTopY}
        width={R}
        height={yStripBotY - yStripTopY}
        fill={BG}
      />
      <rect x={cornerX} y={cornerY} width={R} height={R} fill={BG} />

      {/* ── Separator lines ───────────────────────────────────────────────── */}
      <line
        x1={xSepX1}
        y1={xSepY}
        x2={xSepX2}
        y2={xSepY}
        stroke={TICK_COL}
        strokeWidth={0.5}
      />
      <line
        x1={ySepX}
        y1={yStripTopY}
        x2={ySepX}
        y2={yStripBotY}
        stroke={TICK_COL}
        strokeWidth={0.5}
      />

      {/* ── X ticks ───────────────────────────────────────────────────────── */}
      {xTicks.map((mm) => {
        const sx = mmToSx(mm);
        if (sx < R || sx > xTickEdge) return null;
        const isMajor = mm % major === 0;
        const tLen = isMajor ? MAJOR_LEN : MINOR_LEN;
        const col = mm === 0 ? ORIGIN_COL : TICK_COL;
        return (
          <g key={`rx-${mm}`}>
            <line
              x1={sx}
              y1={xSepY}
              x2={sx}
              y2={xSepY + xTickDir * tLen}
              stroke={col}
              strokeWidth={0.5}
            />
            {isMajor && (
              <text
                x={sx}
                y={xLabelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={mm === 0 ? ORIGIN_COL : LABEL_COL}
                fontSize={FONT}
                fontFamily="monospace"
              >
                {mm}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Y ticks ───────────────────────────────────────────────────────── */}
      {yTicks.map((mm) => {
        const sy = mmToSy(mm);
        if (sy < yStripTopY || sy > yStripBotY) return null;
        const isMajor = mm % major === 0;
        const tLen = isMajor ? MAJOR_LEN : MINOR_LEN;
        const col = mm === 0 ? ORIGIN_COL : TICK_COL;
        return (
          <g key={`ry-${mm}`}>
            <line
              x1={ySepX}
              y1={sy}
              x2={ySepX + yTickDir * tLen}
              y2={sy}
              stroke={col}
              strokeWidth={0.5}
            />
            {isMajor && (
              <text
                transform={`rotate(-90, ${yLabelX}, ${sy})`}
                x={yLabelX}
                y={sy}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={mm === 0 ? ORIGIN_COL : LABEL_COL}
                fontSize={FONT}
                fontFamily="monospace"
              >
                {mm}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Origin dot ────────────────────────────────────────────────────── */}
      {originVisible && (
        <circle
          data-testid="origin-marker"
          cx={originSx}
          cy={originSy}
          r={3}
          fill={ORIGIN_COL}
          opacity={0.9}
        />
      )}
    </svg>
  );
}

// ─── Per-import SVG layer (paths only — handles are in HandleOverlay) ──────────

interface ImportLayerProps {
  imp: SvgImport;
  selected: boolean;
  onImportMouseDown: (e: React.MouseEvent, id: string) => void;
  getBedY: (mm: number) => number;
}

function ImportLayer({
  imp,
  selected,
  onImportMouseDown,
  getBedY,
}: ImportLayerProps) {
  const sX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
  const sY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
  const vbX = imp.viewBoxX ?? 0;
  const vbY = imp.viewBoxY ?? 0;
  const left = PAD + imp.x * MM_TO_PX;
  const top = getBedY(imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale));
  const bboxW = imp.svgWidth * sX;
  const bboxH = imp.svgHeight * sY;

  // Centre of the (unrotated) bounding box in SVG canvas coords
  const cxSvg = left + bboxW / 2;
  const cySvg = top + bboxH / 2;
  const deg = imp.rotation ?? 0;

  // group transform: centre → rotate → scale(sx,sy) → offset to SVG user-unit centre
  const groupTransform = [
    `translate(${cxSvg}, ${cySvg})`,
    `rotate(${deg})`,
    `scale(${sX}, ${sY})`,
    `translate(${-(vbX + imp.svgWidth / 2)}, ${-(vbY + imp.svgHeight / 2)})`,
  ].join(" ");

  return (
    <g>
      {/* Draggable group — paths only; handles are rendered in HandleOverlay */}
      <g
        transform={groupTransform}
        onMouseDown={(e) => onImportMouseDown(e, imp.id)}
        style={{ cursor: "grab" }}
      >
        {/* Paths rendered on canvas overlay — no SVG <path> elements here */}
        {/* Hit-test rect covering the whole viewBox */}
        <rect
          x={vbX}
          y={vbY}
          width={imp.svgWidth}
          height={imp.svgHeight}
          fill="transparent"
        />
      </g>
    </g>
  );
}

// ─── Group handle overlay ─ single AABB around all selected imports ──────────
interface GroupHandleOverlayProps {
  imports: SvgImport[];
  zoom: number;
  panX: number;
  panY: number;
  containerW: number;
  containerH: number;
  getBedY: (mm: number) => number;
  onGroupMouseDown: (e: React.MouseEvent<SVGRectElement>) => void;
  onGroupHandleMouseDown: (
    e: React.MouseEvent<SVGCircleElement>,
    handle: HandlePos,
  ) => void;
  onGroupRotateHandleMouseDown: (
    e: React.MouseEvent<SVGCircleElement>,
    gCx: number,
    gCy: number,
    gHW: number,
    gHH: number,
  ) => void;
  onDelete: () => void;
  /** When a rotation gesture is active, render an OBB instead of AABB. */
  activeOBB?: {
    gCx: number;
    gCy: number;
    gHW: number;
    gHH: number;
    angle: number;
  };
}

function GroupHandleOverlay({
  imports,
  zoom,
  panX,
  panY,
  containerW,
  containerH,
  getBedY,
  onGroupMouseDown,
  onGroupHandleMouseDown,
  onGroupRotateHandleMouseDown,
  onDelete,
  activeOBB,
}: GroupHandleOverlayProps) {
  if (imports.length === 0) return null;

  // World (SVG canvas) → screen (CSS pixel) transform
  const w2s = (x: number, y: number): [number, number] => [
    x * zoom + panX,
    y * zoom + panY,
  ];

  // Shared cursor map used by both OBB and AABB paths
  type HEntry = [HandlePos, number, number];
  const cursorMap: Record<HandlePos, string> = {
    tl: "nwse-resize",
    t: "ns-resize",
    tr: "nesw-resize",
    r: "ew-resize",
    br: "nwse-resize",
    b: "ns-resize",
    bl: "nesw-resize",
    l: "ew-resize",
  };

  // Shared delete-button SVG markup
  const deleteIcon = (
    <svg
      x={-DEL_HALF_PX}
      y={-DEL_HALF_PX}
      width={DEL_HALF_PX * 2}
      height={DEL_HALF_PX * 2}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect
        width="18"
        height="18"
        x="3"
        y="3"
        rx="2"
        ry="2"
        fill="var(--tf-accent)"
        stroke="none"
      />
      <path d="m15 9-6 6" stroke="white" strokeWidth={2.5} />
      <path d="m9 9 6 6" stroke="white" strokeWidth={2.5} />
    </svg>
  );

  // ── OBB path: active during a rotation gesture ───────────────────────────
  // Instead of a recomputed axis-aligned box, we rotate the initial AABB
  // (captured at gesture start) by the current angle delta using an SVG
  // transform, so the box visually rotates with the group.
  if (activeOBB) {
    const { gCx: oCx, gCy: oCy, gHW: oHW, gHH: oHH, angle } = activeOBB;
    const [pivotSx, pivotSy] = w2s(oCx, oCy);
    const hw = oHW * zoom;
    const hh = oHH * zoom;
    const rotHy = pivotSy - hh - ROTATE_STEM_PX;
    const delX = pivotSx + hw + DEL_OFFSET_PX * 0.7;
    const delY = pivotSy - hh - DEL_OFFSET_PX * 0.7;
    const obbHandles: HEntry[] = [
      ["tl", pivotSx - hw, pivotSy - hh],
      ["t", pivotSx, pivotSy - hh],
      ["tr", pivotSx + hw, pivotSy - hh],
      ["r", pivotSx + hw, pivotSy],
      ["br", pivotSx + hw, pivotSy + hh],
      ["b", pivotSx, pivotSy + hh],
      ["bl", pivotSx - hw, pivotSy + hh],
      ["l", pivotSx - hw, pivotSy],
    ];
    return (
      <svg
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 5,
        }}
        width={containerW}
        height={containerH}
        viewBox={`0 0 ${containerW} ${containerH}`}
      >
        {/* Entire OBB is rendered inside a rotated <g> so the box and all
            handles visually rotate with the group. */}
        <g transform={`rotate(${angle}, ${pivotSx}, ${pivotSy})`}>
          {/* Dashed OBB outline */}
          <rect
            x={pivotSx - hw}
            y={pivotSy - hh}
            width={hw * 2}
            height={hh * 2}
            fill="none"
            stroke="var(--tf-accent)"
            strokeWidth={1}
            strokeDasharray="4 2"
            pointerEvents="none"
          />
          {/* Drag hit area */}
          <rect
            x={pivotSx - hw}
            y={pivotSy - hh}
            width={hw * 2}
            height={hh * 2}
            fill="transparent"
            style={{ cursor: "grab", pointerEvents: "all" }}
            onMouseDown={onGroupMouseDown}
          />
          {/* Rotation stem */}
          <line
            x1={pivotSx}
            y1={pivotSy - hh}
            x2={pivotSx}
            y2={rotHy}
            stroke="var(--tf-accent)"
            strokeWidth={1}
            pointerEvents="none"
          />
          {/* Rotation handle */}
          <circle
            cx={pivotSx}
            cy={rotHy}
            r={HANDLE_SCREEN_R}
            fill="var(--tf-accent)"
            stroke="white"
            strokeWidth={1.5}
            style={{ cursor: ROTATE_CURSOR, pointerEvents: "all" }}
            onMouseDown={(e) =>
              onGroupRotateHandleMouseDown(e, oCx, oCy, oHW, oHH)
            }
          />
          {/* 8 scale handles */}
          {obbHandles.map(([id, sx, sy]) => (
            <circle
              key={id}
              cx={sx}
              cy={sy}
              r={HANDLE_SCREEN_R}
              fill="white"
              stroke="var(--tf-accent)"
              strokeWidth={1.5}
              style={{ cursor: cursorMap[id], pointerEvents: "all" }}
              onMouseDown={(e) => onGroupHandleMouseDown(e, id)}
            />
          ))}
          {/* Delete button */}
          <g
            data-testid="group-handle-delete"
            transform={`translate(${delX}, ${delY})`}
            style={{ cursor: "pointer", pointerEvents: "all" }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            {deleteIcon}
          </g>
        </g>
      </svg>
    );
  }

  // ── AABB path: default (no active rotation gesture) ─────────────────────────
  // Compute axis-aligned bounding box in SVG *world* coords first,
  // so geometry callbacks can reference the same coordinate system.
  let minWx = Infinity,
    maxWx = -Infinity;
  let minWy = Infinity,
    maxWy = -Infinity;

  for (const imp of imports) {
    const sX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
    const sY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
    const left = PAD + imp.x * MM_TO_PX;
    const top = getBedY(imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale));
    const bboxW = imp.svgWidth * sX;
    const bboxH = imp.svgHeight * sY;
    const cxSvg = left + bboxW / 2;
    const cySvg = top + bboxH / 2;
    const hw = bboxW / 2;
    const hh = bboxH / 2;
    const rad = ((imp.rotation ?? 0) * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    for (const [ox, oy] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as [number, number][]) {
      const wx = cxSvg + ox * cosA - oy * sinA;
      const wy = cySvg + ox * sinA + oy * cosA;
      if (wx < minWx) minWx = wx;
      if (wx > maxWx) maxWx = wx;
      if (wy < minWy) minWy = wy;
      if (wy > maxWy) maxWy = wy;
    }
  }

  const BBOX_PAD_W = 6 / zoom; // extra padding in world px (zoom-invariant screen px)
  minWx -= BBOX_PAD_W;
  maxWx += BBOX_PAD_W;
  minWy -= BBOX_PAD_W;
  maxWy += BBOX_PAD_W;

  const gCx = (minWx + maxWx) / 2;
  const gCy = (minWy + maxWy) / 2;
  const gHW = (maxWx - minWx) / 2;
  const gHH = (maxWy - minWy) / 2;

  // Convert AABB corners/edges to screen coords
  const [tlSx, tlSy] = w2s(minWx, minWy);
  const [trSx, trSy] = w2s(maxWx, minWy);
  const [brSx, brSy] = w2s(maxWx, maxWy);
  const [blSx, blSy] = w2s(minWx, maxWy);
  const [tcSx, tcSy] = w2s(gCx, minWy);
  const [bcSx, bcSy] = w2s(gCx, maxWy);
  const [lcSx, lcSy] = w2s(minWx, gCy);
  const [rcSx, rcSy] = w2s(maxWx, gCy);

  const handles: HEntry[] = [
    ["tl", tlSx, tlSy],
    ["t", tcSx, tcSy],
    ["tr", trSx, trSy],
    ["r", rcSx, rcSy],
    ["br", brSx, brSy],
    ["b", bcSx, bcSy],
    ["bl", blSx, blSy],
    ["l", lcSx, lcSy],
  ];

  // Rotation handle: ROTATE_STEM_PX screen px above top-centre
  const rotHx = tcSx;
  const rotHy = tcSy - ROTATE_STEM_PX;

  // Delete button: diagonal from top-right corner
  const delSx = trSx + DEL_OFFSET_PX * 0.7;
  const delSy = trSy - DEL_OFFSET_PX * 0.7;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 5,
      }}
      width={containerW}
      height={containerH}
      viewBox={`0 0 ${containerW} ${containerH}`}
    >
      {/* Dashed bounding box outline */}
      <rect
        x={tlSx}
        y={tlSy}
        width={trSx - tlSx}
        height={blSy - tlSy}
        fill="none"
        stroke="var(--tf-accent)"
        strokeWidth={1}
        strokeDasharray="4 2"
        pointerEvents="none"
      />
      {/* Transparent drag hit area (covers interior excluding handles) */}
      <rect
        x={tlSx}
        y={tlSy}
        width={trSx - tlSx}
        height={blSy - tlSy}
        fill="transparent"
        style={{ cursor: "grab", pointerEvents: "all" }}
        onMouseDown={onGroupMouseDown}
      />
      {/* Rotation stem */}
      <line
        x1={tcSx}
        y1={tcSy}
        x2={rotHx}
        y2={rotHy}
        stroke="var(--tf-accent)"
        strokeWidth={1}
        pointerEvents="none"
      />
      {/* Rotation handle */}
      <circle
        cx={rotHx}
        cy={rotHy}
        r={HANDLE_SCREEN_R}
        fill="var(--tf-accent)"
        stroke="white"
        strokeWidth={1.5}
        style={{ cursor: ROTATE_CURSOR, pointerEvents: "all" }}
        onMouseDown={(e) => onGroupRotateHandleMouseDown(e, gCx, gCy, gHW, gHH)}
      />
      {/* 8 scale handles */}
      {handles.map(([id, sx, sy]) => (
        <circle
          key={id}
          cx={sx}
          cy={sy}
          r={HANDLE_SCREEN_R}
          fill="white"
          stroke="var(--tf-accent)"
          strokeWidth={1.5}
          style={{ cursor: cursorMap[id], pointerEvents: "all" }}
          onMouseDown={(e) => onGroupHandleMouseDown(e, id)}
        />
      ))}
      {/* Delete button */}
      <g
        data-testid="group-handle-delete"
        transform={`translate(${delSx},${delSy})`}
        style={{ cursor: "pointer", pointerEvents: "all" }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <svg
          x={-DEL_HALF_PX}
          y={-DEL_HALF_PX}
          width={DEL_HALF_PX * 2}
          height={DEL_HALF_PX * 2}
          viewBox="0 0 24 24"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect
            width="18"
            height="18"
            x="3"
            y="3"
            rx="2"
            ry="2"
            fill="var(--tf-accent)"
            stroke="none"
          />
          <path d="m15 9-6 6" stroke="white" strokeWidth={2.5} />
          <path d="m9 9 6 6" stroke="white" strokeWidth={2.5} />
        </svg>
      </g>
    </svg>
  );
}

// ─── Handle overlay ─ renders bounding box + handles in screen-pixel space ───
// A sibling SVG with viewBox="0 0 W H" maps 1 SVG unit = 1 CSS pixel exactly,
// so every radius, strokeWidth and dash value is zoom-independent by definition.

const HANDLE_SCREEN_R = 5; // handle circle radius (screen px)
const ROTATE_STEM_PX = 24; // rotation-handle stem length (screen px)
const DEL_OFFSET_PX = 26; // delete button distance from TR corner (screen px)
const DEL_HALF_PX = 9; // half-size of delete icon (screen px)

interface HandleOverlayProps {
  imp: SvgImport;
  zoom: number;
  panX: number;
  panY: number;
  containerW: number;
  containerH: number;
  getBedY: (mm: number) => number;
  onHandleMouseDown: (
    e: React.MouseEvent<SVGCircleElement>,
    id: string,
    h: HandlePos,
  ) => void;
  onRotateHandleMouseDown: (
    e: React.MouseEvent<SVGCircleElement>,
    id: string,
    cxSvg: number,
    cySvg: number,
  ) => void;
  onDelete: () => void;
}

function HandleOverlay({
  imp,
  zoom,
  panX,
  panY,
  containerW,
  containerH,
  getBedY,
  onHandleMouseDown,
  onRotateHandleMouseDown,
  onDelete,
}: HandleOverlayProps) {
  const showCentreMarker = useCanvasStore(selectPlotCanvasHandleOverlayState);
  const sX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
  const sY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
  const left = PAD + imp.x * MM_TO_PX;
  const top = getBedY(imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale));
  const bboxW = imp.svgWidth * sX;
  const bboxH = imp.svgHeight * sY;
  const cxSvg = left + bboxW / 2;
  const cySvg = top + bboxH / 2;
  const deg = imp.rotation ?? 0;
  const degRad = (deg * Math.PI) / 180;
  const hw = bboxW / 2;
  const hh = bboxH / 2;

  // SVG world coords → screen (CSS) pixels
  const w2s = (x: number, y: number): [number, number] => [
    x * zoom + panX,
    y * zoom + panY,
  ];

  // Rotate an offset by deg degrees
  const rotPt = (ox: number, oy: number): [number, number] => {
    const c = Math.cos(degRad);
    const ss = Math.sin(degRad);
    return [ox * c - oy * ss, ox * ss + oy * c];
  };

  // Bounding box as a screen-space polygon
  const corners = (
    [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as [number, number][]
  ).map(([ox, oy]) => {
    const [dx, dy] = rotPt(ox, oy);
    return w2s(cxSvg + dx, cySvg + dy);
  });
  const polyPoints = corners.map(([x, y]) => `${x},${y}`).join(" ");

  // 8 scale handle definitions
  type HInfo = { id: HandlePos; ox: number; oy: number };
  const HANDLE_DEFS: HInfo[] = [
    { id: "tl", ox: -hw, oy: -hh },
    { id: "t", ox: 0, oy: -hh },
    { id: "tr", ox: hw, oy: -hh },
    { id: "r", ox: hw, oy: 0 },
    { id: "br", ox: hw, oy: hh },
    { id: "b", ox: 0, oy: hh },
    { id: "bl", ox: -hw, oy: hh },
    { id: "l", ox: -hw, oy: 0 },
  ];
  const cursorMap: Record<HandlePos, string> = {
    tl: "nwse-resize",
    t: "ns-resize",
    tr: "nesw-resize",
    r: "ew-resize",
    br: "nwse-resize",
    b: "ns-resize",
    bl: "nesw-resize",
    l: "ew-resize",
  };

  // Top-centre in screen space
  const [tcDx, tcDy] = rotPt(0, -hh);
  const [topCx, topCy] = w2s(cxSvg + tcDx, cySvg + tcDy);

  // Rotation handle: ROTATE_STEM_PX screen pixels above top-centre, along the
  // rotated outward normal of the top edge — direction (sin θ, −cos θ) in SVG.
  const rotHx = topCx + Math.sin(degRad) * ROTATE_STEM_PX;
  const rotHy = topCy - Math.cos(degRad) * ROTATE_STEM_PX;

  // Delete button: DEL_OFFSET_PX screen pixels from the TR corner along the
  // rotated outward diagonal (bisects both edges at that corner, so it stays
  // at 45° from each edge regardless of rotation).
  const [trDx, trDy] = rotPt(hw, -hh);
  const [trSx, trSy] = w2s(cxSvg + trDx, cySvg + trDy);
  // Unit diagonal in local frame: (+1,−1)/√2; rotated → world unit vector;
  // screen-space travel = worldDir * DEL_OFFSET_PX (zoom cancels in normalisation)
  const [diagDx, diagDy] = rotPt(Math.SQRT1_2, -Math.SQRT1_2);
  const delSx = trSx + diagDx * DEL_OFFSET_PX;
  const delSy = trSy + diagDy * DEL_OFFSET_PX;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 4,
      }}
      width={containerW}
      height={containerH}
      viewBox={`0 0 ${containerW} ${containerH}`}
    >
      {/* Bounding box polygon — 1 px stroke in screen space */}
      <polygon
        data-testid="selection-bbox"
        points={polyPoints}
        fill="none"
        stroke="var(--tf-accent)"
        strokeWidth={1}
        strokeDasharray="4 2"
        pointerEvents="none"
      />

      {/* Centre-of-rotation crosshair — toggled from Properties panel */}
      {showCentreMarker &&
        (() => {
          const [cx, cy] = w2s(cxSvg, cySvg);
          const A = 6; // arm half-length in screen px
          return (
            <g data-testid="handle-centre" pointerEvents="none">
              <circle
                cx={cx}
                cy={cy}
                r={A}
                fill="none"
                stroke="#fff"
                strokeWidth={1.5}
                opacity={0.85}
              />
              <line
                x1={cx - A}
                y1={cy}
                x2={cx + A}
                y2={cy}
                stroke="#fff"
                strokeWidth={1.5}
                opacity={0.85}
              />
              <line
                x1={cx}
                y1={cy - A}
                x2={cx}
                y2={cy + A}
                stroke="#fff"
                strokeWidth={1.5}
                opacity={0.85}
              />
            </g>
          );
        })()}

      {/* 8 scale handles */}
      {HANDLE_DEFS.map(({ id, ox, oy }) => {
        const [dx, dy] = rotPt(ox, oy);
        const [hx, hy] = w2s(cxSvg + dx, cySvg + dy);
        return (
          <circle
            key={id}
            data-testid={`handle-scale-${id}`}
            cx={hx}
            cy={hy}
            r={HANDLE_SCREEN_R}
            fill="#16213e"
            stroke="var(--tf-accent)"
            strokeWidth={1.5}
            style={{ cursor: cursorMap[id], pointerEvents: "all" }}
            onMouseDown={(e) => onHandleMouseDown(e, imp.id, id)}
          />
        );
      })}

      {/* Rotation stem */}
      <line
        x1={topCx}
        y1={topCy}
        x2={rotHx}
        y2={rotHy}
        stroke="var(--tf-accent)"
        strokeWidth={1}
        pointerEvents="none"
      />

      {/* Rotation handle */}
      <circle
        data-testid="handle-rotate"
        cx={rotHx}
        cy={rotHy}
        r={HANDLE_SCREEN_R}
        fill="var(--tf-accent)"
        stroke="#fff"
        strokeWidth={1.5}
        style={{ cursor: ROTATE_CURSOR, pointerEvents: "all" }}
        onMouseDown={(e) => onRotateHandleMouseDown(e, imp.id, cxSvg, cySvg)}
      />

      {/* Delete button */}
      <g
        data-testid="handle-delete"
        transform={`translate(${delSx},${delSy})`}
        style={{ cursor: "pointer", pointerEvents: "all" }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <svg
          x={-DEL_HALF_PX}
          y={-DEL_HALF_PX}
          width={DEL_HALF_PX * 2}
          height={DEL_HALF_PX * 2}
          viewBox="0 0 24 24"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect
            width="18"
            height="18"
            x="3"
            y="3"
            rx="2"
            ry="2"
            fill="var(--tf-accent)"
            stroke="none"
          />
          <path d="m15 9-6 6" stroke="white" strokeWidth={2.5} />
          <path d="m9 9 6 6" stroke="white" strokeWidth={2.5} />
        </svg>
      </g>
    </svg>
  );
}
