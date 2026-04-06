import { useState, useRef } from "react";
import { v4 as uuid } from "uuid";
import { useCanvasStore } from "../../../store/canvasStore";
import { useTaskStore } from "../../../store/taskStore";
import { type CanvasLayout } from "../../../../../types";

/** Orchestrates save, load, and close operations for canvas layout files. */
export function useLayoutActions() {
  const imports = useCanvasStore((s) => s.imports);
  const layerGroups = useCanvasStore((s) => s.layerGroups);
  const pageTemplate = useCanvasStore((s) => s.pageTemplate);
  const loadLayout = useCanvasStore((s) => s.loadLayout);
  const clearImports = useCanvasStore((s) => s.clearImports);
  const upsertTask = useTaskStore((s) => s.upsertTask);

  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [pendingLayout, setPendingLayout] = useState<CanvasLayout | null>(null);

  /** Prompts for a save path and writes the current canvas layout to disk. */
  const handleSaveLayout = async () => {
    if (imports.length === 0) return;
    const taskId = uuid();
    const baseName = imports.length === 1 ? imports[0].name : "layout";
    const defaultFilename = `${baseName}.tforge`;
    const savePath =
      await window.terraForge.fs.saveLayoutDialog(defaultFilename);
    if (!savePath) return;
    upsertTask({
      id: taskId,
      type: "svg-parse",
      label: "Saving layout…",
      progress: null,
      status: "running",
    });
    try {
      const layout: CanvasLayout = {
        tfVersion: 1,
        savedAt: new Date().toISOString(),
        imports,
        layerGroups,
        pageTemplate,
      };
      await window.terraForge.fs.writeFile(
        savePath,
        JSON.stringify(layout, null, 2),
      );
      upsertTask({
        id: taskId,
        type: "svg-parse",
        label: "Layout saved",
        progress: 100,
        status: "completed",
      });
    } catch (err) {
      upsertTask({
        id: taskId,
        type: "svg-parse",
        label: "Save failed",
        progress: null,
        status: "error",
        error: String(err),
      });
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
      const raw = await window.terraForge.fs.readFile(filePath);
      let layout: CanvasLayout;
      try {
        layout = JSON.parse(raw) as CanvasLayout;
      } catch {
        throw new Error("Not a valid terraForge layout file.");
      }
      if (!Array.isArray(layout.imports)) {
        throw new Error("Layout file does not contain a valid imports array.");
      }
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
