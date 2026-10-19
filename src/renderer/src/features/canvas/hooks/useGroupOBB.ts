/**
 * useGroupOBB — group scale/rotate gesture state machines with persistent OBB.
 *
 * Owns:
 *   - groupScaling: active group scale-handle gesture state
 *   - groupRotating: active group rotate-handle gesture state
 *   - groupOBBAngle: live OBB angle in degrees (updated every mousemove)
 *   - persistentGroupOBB: OBB geometry persisted after a rotation gesture
 *   - persistentGroupOBBRef: ref mirror of persistentGroupOBB for closure access
 *   - onGroupHandleMouseDown: start a group scale gesture
 *   - onGroupRotateHandleMouseDown: start a group rotate gesture
 *   - updateGroupScaleMove: update group scale on each mousemove
 *   - updateGroupRotateMove: update group rotation on each mousemove
 *   - endGroupScaling: finish group scale (clears stale OBB)
 *   - endGroupRotating: finish group rotate (persists OBB with final angle)
 *   - clearGroupOBB: discard OBB (called after group drag ends)
 */
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type RefObject,
} from "react";
import { MM_TO_PX, PAD } from "../constants";
import type {
  HandlePos,
  Vp,
  GroupScalingState,
  GroupRotatingState,
  PersistentGroupOBB,
} from "../types";
import type { SvgImport } from "../../../../../types";
import { useCanvasStore } from "../../../store/canvasStore";
import {
  groupBounds,
  groupGestureImports,
  groupScaleFactors,
  importCenter,
  positionForCenter,
  canvasPoint,
} from "../utils/handleGeometry";

export function useGroupOBB(
  containerRef: RefObject<HTMLDivElement | null>,
  vpRef: RefObject<Vp>,
  updateImport: (id: string, patch: Partial<SvgImport>) => void,
  isBottom: boolean,
  canvasH: number,
  allImportsSelected: boolean,
  selectedGroupId: string | null,
) {
  const [groupScaling, setGroupScaling] = useState<GroupScalingState | null>(null);
  const [groupRotating, setGroupRotating] = useState<GroupRotatingState | null>(null);
  const [groupOBBAngle, setGroupOBBAngle] = useState(0);
  const [persistentGroupOBB, setPersistentGroupOBB] =
    useState<PersistentGroupOBB | null>(null);

  const isNonPrimaryButton = (button: number | undefined) =>
    button !== undefined && button !== 0;

  // Ref mirror so gesture callbacks can read the latest value without deps.
  const persistentGroupOBBRef = useRef(persistentGroupOBB);
  persistentGroupOBBRef.current = persistentGroupOBB;

  // Mutable refs so callbacks capture the latest layout values without
  // needing to be recreated on every render.
  const isBottomRef = useRef(isBottom);
  isBottomRef.current = isBottom;
  const canvasHRef = useRef(canvasH);
  canvasHRef.current = canvasH;

  // Clear the persistent OBB whenever the group selection is dropped so a
  // new Ctrl+A / group pick always starts with a fresh axis-aligned bounding box.
  useEffect(() => {
    if (!allImportsSelected && !selectedGroupId) {
      setPersistentGroupOBB(null);
      setGroupOBBAngle(0);
    }
  }, [allImportsSelected, selectedGroupId]);

  // Helper — compute getBedY inline using latest refs
  const getBedY = (mmY: number) => {
    const ib = isBottomRef.current;
    const cH = canvasHRef.current;
    return ib ? cH - PAD - mmY * MM_TO_PX : PAD + mmY * MM_TO_PX;
  };

  const onGroupHandleMouseDown = useCallback(
    (e: React.MouseEvent<SVGCircleElement>, handle: HandlePos) => {
      if (isNonPrimaryButton(e.button)) return;
      e.stopPropagation();
      useCanvasStore.getState().snapshotForGesture();
      const { imports, layerGroups, selectedGroupId: gid } = useCanvasStore.getState();
      const bounds = groupBounds(groupGestureImports(imports, layerGroups, gid), getBedY);
      setPersistentGroupOBB(null); // geometry changes — discard stale OBB
      setGroupScaling({ handle, startMouseX: e.clientX, startMouseY: e.clientY, ...bounds });
    },
    [],
  );

  const onGroupRotateHandleMouseDown = useCallback(
    (
      e: React.MouseEvent<SVGCircleElement>,
      gCx: number,
      gCy: number,
      gHW: number,
      gHH: number,
    ) => {
      if (isNonPrimaryButton(e.button)) return;
      e.stopPropagation();
      useCanvasStore.getState().snapshotForGesture();
      const { imports, layerGroups, selectedGroupId: gid } = useCanvasStore.getState();
      const imps = groupGestureImports(imports, layerGroups, gid);
      const pt = canvasPoint(containerRef.current, vpRef.current, e);
      if (!pt) return;
      const { x: mx, y: my } = pt;
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
          const { cxSvg, cySvg } = importCenter(imp, getBedY);
          return { id: imp.id, cxSvg, cySvg, startX: imp.x, startY: imp.y, startRotation: imp.rotation ?? 0 };
        }),
      });
    },
    [containerRef, vpRef],
  );

  const updateGroupScaleMove = useCallback(
    (e: MouseEvent) => {
      if (!groupScaling) return;
      const zoom = vpRef.current.zoom;
      const dx = (e.clientX - groupScaling.startMouseX) / zoom;
      const dy = (e.clientY - groupScaling.startMouseY) / zoom;
      const { kX, kY, ax, ay } = groupScaleFactors(groupScaling.handle, dx, dy, groupScaling);
      const ib = isBottomRef.current;
      const cH = canvasHRef.current;
      for (const item of groupScaling.items) {
        const imp = useCanvasStore.getState().imports.find((i) => i.id === item.id);
        if (!imp) continue;
        const newSX = item.startScaleX * kX;
        const newSY = item.startScaleY * kY;
        const newCxSvg = ax + (item.cxSvg - ax) * kX;
        const newCySvg = ay + (item.cySvg - ay) * kY;
        const { x, y } = positionForCenter(imp, newCxSvg, newCySvg, newSX, newSY, ib, cH);
        updateImport(item.id, { x, y, scaleX: newSX, scaleY: newSY });
      }
    },
    [groupScaling, vpRef, updateImport],
  );

  const updateGroupRotateMove = useCallback(
    (e: MouseEvent) => {
      if (!groupRotating) return;
      const pt = canvasPoint(containerRef.current, vpRef.current, e);
      if (!pt) return;
      const { x: mx, y: my } = pt;
      const angle = Math.atan2(my - groupRotating.gCy, mx - groupRotating.gCx);
      const delta = (angle - groupRotating.startAngle) * (180 / Math.PI);
      setGroupOBBAngle(groupRotating.baseOBBAngle + delta);
      const rad = (delta * Math.PI) / 180;
      const cosD = Math.cos(rad);
      const sinD = Math.sin(rad);
      const ib = isBottomRef.current;
      const cH = canvasHRef.current;
      for (const item of groupRotating.items) {
        const imp = useCanvasStore.getState().imports.find((i) => i.id === item.id);
        if (!imp) continue;
        const dx = item.cxSvg - groupRotating.gCx;
        const dy = item.cySvg - groupRotating.gCy;
        const newCxSvg = groupRotating.gCx + dx * cosD - dy * sinD;
        const newCySvg = groupRotating.gCy + dx * sinD + dy * cosD;
        const [sX, sY] = [imp.scaleX ?? imp.scale, imp.scaleY ?? imp.scale];
        const { x, y } = positionForCenter(imp, newCxSvg, newCySvg, sX, sY, ib, cH);
        updateImport(item.id, { x, y, rotation: item.startRotation + delta });
      }
    },
    [groupRotating, containerRef, vpRef, updateImport],
  );

  /** Finish a group scale gesture — geometry changed, discard stale OBB. */
  const endGroupScaling = useCallback(() => {
    setPersistentGroupOBB(null);
    setGroupScaling(null);
  }, []);

  /** Finish a group rotate gesture — persist OBB with the final angle. */
  const endGroupRotating = useCallback(
    (finalOBBAngle: number) => {
      if (groupRotating) {
        const { gCx, gCy, gHW, gHH } = groupRotating;
        setPersistentGroupOBB({ gCx, gCy, gHW, gHH, angle: finalOBBAngle });
      }
      setGroupRotating(null);
      setGroupOBBAngle(0);
    },
    [groupRotating],
  );

  /** Discard OBB after a group drag (geometry changed). */
  const clearGroupOBB = useCallback(() => {
    setPersistentGroupOBB(null);
  }, []);

  return {
    groupScaling,
    groupRotating,
    groupOBBAngle,
    persistentGroupOBB,
    persistentGroupOBBRef,
    onGroupHandleMouseDown,
    onGroupRotateHandleMouseDown,
    updateGroupScaleMove,
    updateGroupRotateMove,
    endGroupScaling,
    endGroupRotating,
    clearGroupOBB,
  };
}
