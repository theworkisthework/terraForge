/**
 * useObjectDrag — single-object and group-object drag state machine.
 *
 * Owns:
 *   - dragging: active drag gesture state (null when idle)
 *   - justDraggedRef: set at end of any drag so SVG onClick can ignore it
 *   - onImportMouseDown: mousedown handler for SVG import hit areas
 *   - onGroupMouseDown: mousedown handler for the group bounding-box drag area
 *   - updateDragMove: apply drag delta on each mousemove
 *   - endDrag: commit end of drag gesture; returns whether a group drag ended
 */
import { useState, useRef, useCallback, type RefObject } from "react";
import { MM_TO_PX } from "../constants";
import type { DraggingState, Vp } from "../types";
import type { SvgImport } from "../../../../../types";
import { useCanvasStore } from "../../../store/canvasStore";

export function useObjectDrag(
  vpRef: RefObject<Vp>,
  spaceRef: RefObject<boolean>,
  selectImport: (id: string | null) => void,
  updateImport: (id: string, patch: Partial<SvgImport>) => void,
) {
  const [dragging, setDragging] = useState<DraggingState | null>(null);
  const justDraggedRef = useRef(false);

  const onImportMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (spaceRef.current) return; // space held → pan mode, not drag
      e.stopPropagation();
      const state = useCanvasStore.getState();
      state.snapshotForGesture();
      // All-selected: drag all imports together
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
      // Layer-group mode: drag all group members together
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
    [spaceRef, selectImport],
  );

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
    [spaceRef],
  );

  const updateDragMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging) return;
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
    },
    [dragging, vpRef, updateImport],
  );

  /** Returns true when the ending drag was a group drag (caller may need to clear OBB). */
  const endDrag = useCallback((): boolean => {
    const wasGroupDrag = !!dragging?.group;
    setDragging(null);
    return wasGroupDrag;
  }, [dragging]);

  return {
    dragging,
    justDraggedRef,
    onImportMouseDown,
    onGroupMouseDown,
    updateDragMove,
    endDrag,
  };
}
