import { useEffect } from "react";
import { useCanvasStore } from "../../../store/canvasStore";
import { ZOOM_STEP } from "../constants";

interface UseCanvasKeyboardShortcutsOptions {
  selectedImportId: string | null;
  allImportsSelected: boolean;
  selectedGroupId: string | null;
  toolpathSelected: boolean;
  isJobActive: boolean;
  selectGroup: (id: string | null) => void;
  selectImport: (id: string | null) => void;
  removeImport: (id: string) => void;
  clearImports: () => void;
  selectToolpath: (selected: boolean) => void;
  setGcodeToolpath: (
    gcode: {
      segments: { type: "rapid" | "cut"; points: { x: number; y: number }[] }[];
      bounds: { minX: number; minY: number; maxX: number; maxY: number };
    } | null,
  ) => void;
  zoomBy: (factor: number, clientX?: number, clientY?: number) => void;
  fitToView: () => void;
  setSpacePressed: (pressed: boolean) => void;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useCanvasKeyboardShortcuts({
  selectedImportId,
  allImportsSelected,
  selectedGroupId,
  toolpathSelected,
  isJobActive,
  selectGroup,
  selectImport,
  removeImport,
  clearImports,
  selectToolpath,
  setGcodeToolpath,
  zoomBy,
  fitToView,
  setSpacePressed,
}: UseCanvasKeyboardShortcutsOptions) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target)) return;

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpacePressed(true);
      }

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
        }
      }

      if (e.key === "Escape") {
        selectImport(null);
        selectToolpath(false);
      }

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

      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        fitToView();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpacePressed(false);
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
    toolpathSelected,
    isJobActive,
    selectGroup,
    selectImport,
    removeImport,
    clearImports,
    selectToolpath,
    setGcodeToolpath,
    zoomBy,
    fitToView,
    setSpacePressed,
  ]);
}
