import { useState, useRef } from "react";
import { v4 as uuid } from "uuid";
import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "../../../store/canvasStore";
import { selectLayoutActionsCanvasState } from "../../../store/canvasSelectors";
import { useTaskStore } from "../../../store/taskStore";
import { type CanvasLayout } from "../../../../../types";
import { LAYOUT_VERSION, parseLayout } from "../utils/parseLayout";

/** Orchestrates save, load, and close operations for canvas layout files. */
export function useLayoutActions() {
  const { imports, loadLayout, clearImports } = useCanvasStore(
    useShallow(selectLayoutActionsCanvasState),
  );
  const upsertTask = useTaskStore((s) => s.upsertTask);

  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [pendingLayout, setPendingLayout] = useState<CanvasLayout | null>(null);

  /**
   * Prompts for a save path and writes the current canvas layout to disk.
   * Resolves to whether it was saved: false if the prompt was cancelled or
   * the write failed.
   */
  const handleSaveLayout = async (): Promise<boolean> => {
    if (imports.length === 0) return false;
    const taskId = uuid();
    const baseName = imports.length === 1 ? imports[0].name : "layout";
    const defaultFilename = `${baseName}.tforge`;
    const savePath =
      await window.terraForge.fs.saveLayoutDialog(defaultFilename);
    if (!savePath) return false;
    upsertTask({
      id: taskId,
      type: "svg-parse",
      label: "Saving layout…",
      progress: null,
      status: "running",
    });
    try {
      // The document as it is now, with its revision: that revision, not
      // whatever the canvas holds once the write has finished, is what the
      // file contains.
      const doc = useCanvasStore.getState();
      const layout: CanvasLayout = {
        tfVersion: LAYOUT_VERSION,
        savedAt: new Date().toISOString(),
        imports: doc.imports,
        layerGroups: doc.layerGroups,
        pageTemplate: doc.pageTemplate,
      };
      await window.terraForge.fs.writeFile(
        savePath,
        JSON.stringify(layout, null, 2),
      );
      doc.markSaved(doc.revision);
      upsertTask({
        id: taskId,
        type: "svg-parse",
        label: "Layout saved",
        progress: 100,
        status: "completed",
      });
      return true;
    } catch (err) {
      upsertTask({
        id: taskId,
        type: "svg-parse",
        label: "Save failed",
        progress: null,
        status: "error",
        error: String(err),
      });
      return false;
    }
  };

  /** Prompts for a layout file and loads it, warning before overwriting an existing canvas. */
  const handleLoadLayout = async () => {
    const filePath = await window.terraForge.fs.openLayoutDialog();
    if (!filePath) return;
    const taskId = uuid();
    upsertTask({
      id: taskId,
      type: "svg-parse",
      label: "Loading layout…",
      progress: null,
      status: "running",
    });
    try {
      // Checked in full before anything on the canvas is replaced.
      const layout = parseLayout(await window.terraForge.fs.readFile(filePath));
      upsertTask({
        id: taskId,
        type: "svg-parse",
        label: "Layout ready",
        progress: 100,
        status: "completed",
      });
      if (imports.length > 0) {
        setPendingLayout(layout);
      } else {
        loadLayout(layout.imports, layout.layerGroups, layout.pageTemplate);
      }
    } catch (err) {
      upsertTask({
        id: taskId,
        type: "svg-parse",
        label: "Load layout failed",
        progress: null,
        status: "error",
        error: String(err),
      });
    }
  };

  /** Initiates the close-layout flow — shows a confirmation dialog if the canvas has content. */
  const handleCloseLayout = () => {
    if (imports.length === 0) return;
    setShowCloseDialog(true);
  };

  /** Confirms and executes the close — clears all canvas imports. */
  const doCloseLayout = () => {
    clearImports();
    setShowCloseDialog(false);
  };

  // Keep refs current so IPC listeners (subscribed once on mount) always call
  // the latest function closures without stale-closure reads.
  const saveLayoutRef = useRef(handleSaveLayout);
  const loadLayoutRef = useRef(handleLoadLayout);
  const closeLayoutRef = useRef(handleCloseLayout);
  saveLayoutRef.current = handleSaveLayout;
  loadLayoutRef.current = handleLoadLayout;
  closeLayoutRef.current = handleCloseLayout;

  return {
    handleSaveLayout,
    handleLoadLayout,
    handleCloseLayout,
    doCloseLayout,
    saveLayoutRef,
    loadLayoutRef,
    closeLayoutRef,
    showCloseDialog,
    setShowCloseDialog,
    pendingLayout,
    setPendingLayout,
  };
}
