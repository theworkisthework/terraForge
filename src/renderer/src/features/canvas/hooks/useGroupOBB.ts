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

export function useGroupOBB(
  containerRef: RefObject<HTMLDivElement | null>,
  vpRef: RefObject<Vp>,
  updateImport: (id: string, patch: Partial<SvgImport>) => void,
  isBottom: boolean,
  canvasH: number,
  allImportsSelected: boolean,
  selectedGroupId: string | null,
) {
  const [groupScaling, setGroupScaling] = useState<GroupScalingState | null>(
    null,
  );
  const [groupRotating, setGroupRotating] = useState<GroupRotatingState | null>(
    null,
  );
  const [groupOBBAngle, setGroupOBBAngle] = useState(0);
  const [persistentGroupOBB, setPersistentGroupOBB] =
    useState<PersistentGroupOBB | null>(null);

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

      let minWx = Infinity,
        maxWx = -Infinity,
        minWy = Infinity,
        maxWy = -Infinity;
      const items: GroupScalingState["items"] = [];

      for (const imp of imps) {
        const sX = (imp.scaleX ?? imp.scale) * MM_TO_PX;
        const sY = (imp.scaleY ?? imp.scale) * MM_TO_PX;
        const left = PAD + imp.x * MM_TO_PX;
        const top = getBedY(imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale));
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
          const top = getBedY(
            imp.y + imp.svgHeight * (imp.scaleY ?? imp.scale),
          );
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
    [containerRef, vpRef],
  );

  const updateGroupScaleMove = useCallback(
    (e: MouseEvent) => {
      if (!groupScaling) return;
      const zoom = vpRef.current.zoom;
      const dx = (e.clientX - groupScaling.startMouseX) / zoom;
      const dy = (e.clientY - groupScaling.startMouseY) / zoom;
      const h = groupScaling.handle;
      const { gCx, gCy, gHW, gHH } = groupScaling;

      let delta = 0;
      if (h === "tl" || h === "bl") delta = -dx;
      else if (h === "tr" || h === "br") delta = dx;
      else if (h === "t") delta = -dy;
      else if (h === "b") delta = dy;
      else if (h === "r") delta = dx;
      else if (h === "l") delta = -dx;
      const dimPx = h === "t" || h === "b" ? 2 * gHH : 2 * gHW;
      const k = Math.max(0.001, 1 + delta / dimPx);
      const kX = h === "t" || h === "b" ? 1 : k;
      const kY = h === "l" || h === "r" ? 1 : k;

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
    },
    [groupScaling, vpRef, updateImport],
  );

  const updateGroupRotateMove = useCallback(
    (e: MouseEvent) => {
      if (!groupRotating) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const vp = vpRef.current;
      const mx = (e.clientX - rect.left - vp.panX) / vp.zoom;
      const my = (e.clientY - rect.top - vp.panY) / vp.zoom;
      const angle = Math.atan2(my - groupRotating.gCy, mx - groupRotating.gCx);
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
        const dx = item.cxSvg - groupRotating.gCx;
        const dy = item.cySvg - groupRotating.gCy;
        const newCxSvg = groupRotating.gCx + dx * cosD - dy * sinD;
        const newCySvg = groupRotating.gCy + dx * sinD + dy * cosD;
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
        setPersistentGroupOBB({
          gCx: groupRotating.gCx,
          gCy: groupRotating.gCy,
          gHW: groupRotating.gHW,
          gHH: groupRotating.gHH,
          angle: finalOBBAngle,
        });
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
