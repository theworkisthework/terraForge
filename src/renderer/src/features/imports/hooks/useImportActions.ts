import { v4 as uuid } from "uuid";
import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "../../../store/canvasStore";
import { selectImportActionsCanvasState } from "../../../store/canvasSelectors";
import { useTaskStore } from "../../../store/taskStore";
import { useMachineStore } from "../../../store/machineStore";
import { useAppConfigStore } from "../../../store/appConfigStore";
import { buildSvgImport } from "../services/svgFileImport";
import { parseGcode } from "../../../utils/gcodeParser";
import { importPdf } from "../../../utils/pdfImport";
import { bitmapMimeType, buildBitmapImport } from "../services/bitmapFileImport";
import type { TaskStatus } from "../../../../../types";

/** Orchestrates SVG, PDF, and G-code file imports into the canvas store. */
export function useImportActions() {
  const { addImport, setGcodeToolpath, setGcodeSource, selectToolpath, pageTemplate, pageSizes } =
    useCanvasStore(useShallow(selectImportActionsCanvasState));
  const upsertTask = useTaskStore((s) => s.upsertTask);
  const setSelectedJobFile = useMachineStore((s) => s.setSelectedJobFile);
  const activeMachineConfig = useMachineStore((s) => s.activeConfig());
  const bitmapRendererEnabled = useAppConfigStore((s) => s.bitmapRendererEnabled);
  const report = (id: string, label: string, progress: number | null, status: TaskStatus, error?: string) =>
    upsertTask({ id, type: "svg-parse", label, progress, status, ...(error !== undefined ? { error } : {}) });

  /**
   * Imports a single SVG file — parses layers, shapes, fills, hatch lines, and
   * normalises all path coordinates before handing off to the canvas store.
   */
  const handleImportSvgFile = async (filePath: string) => {
    const taskId = uuid();
    report(taskId, "Parsing SVG…", null, "running");

    try {
      const raw = await window.terraForge.fs.readFile(filePath);
      const name = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "import";
      const { imp, skippedTextCount } = buildSvgImport(raw, name, activeMachineConfig);

      if (!imp) {
        const textSkipSuffix =
          skippedTextCount > 0
            ? ` (${skippedTextCount} text element${skippedTextCount === 1 ? "" : "s"} skipped; convert text to outlines)`
            : "";
        report(taskId, `No paths found in SVG${textSkipSuffix}`, null, "error");
        return;
      }

      addImport(imp);
      const skippedTextMessage =
        skippedTextCount > 0
          ? `${skippedTextCount} text element${skippedTextCount === 1 ? "" : "s"} skipped; convert text to outlines`
          : undefined;
      report(taskId, "SVG imported", 100, skippedTextCount > 0 ? "warning" : "completed", skippedTextMessage);
    } catch (err) {
      report(taskId, "SVG import failed", null, "error", String(err));
    }
  };

  /** Imports a PDF file, converting each page to an SvgImport. */
  const handleImportPdfFile = async (filePath: string) => {
    const name =
      filePath
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.[^.]+$/i, "") ?? "import";

    const taskId = uuid();
    report(taskId, `Importing ${name}.pdf…`, null, "running");

    try {
      const data = await window.terraForge.fs.readFileBinary(filePath);
      const pdfImports = await importPdf(data, name);

      if (pdfImports.length === 0) {
        report(taskId, "No vector paths found in PDF", null, "error");
        return;
      }

      for (const imp of pdfImports) {
        addImport(imp);
      }

      report(taskId, pdfImports.length === 1 ? `PDF imported: ${pdfImports[0].name}` : `PDF imported: ${pdfImports.length} pages`, 100, "completed");
    } catch (err) {
      report(taskId, "PDF import failed", null, "error", String(err));
    }
  };

  const handleImportBitmapFile = async (filePath: string) => {
    const taskId = uuid();
    const mimeType = bitmapMimeType(filePath);
    const name = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "bitmap";
    report(taskId, `Importing ${name}…`, null, "running");
    try {
      const bytes = await window.terraForge.fs.readFileBinary(filePath);
      const currentPage = useCanvasStore.getState().pageTemplate;
      addImport(
        await buildBitmapImport(bytes, name, mimeType, { machine: activeMachineConfig, pageTemplate, pageSizes, currentPage }),
      );
      report(taskId, `Bitmap imported: ${name}`, 100, "completed");
    } catch (err) {
      report(taskId, "Bitmap import failed", null, "error", String(err));
    }
  };

  /** Imports a G-code file directly into the canvas toolpath. */
  const handleImportGcodeFile = async (filePath: string) => {
    const name = filePath.split(/[\\/]/).pop() ?? "import.gcode";
    const taskId = uuid();
    report(taskId, `Importing ${name}…`, null, "running");

    try {
      const text = await window.terraForge.fs.readFile(filePath);
      const toolpath = parseGcode(text);
      setGcodeToolpath(toolpath);
      setGcodeSource({ path: filePath, name, source: "local" });
      selectToolpath(true);
      setSelectedJobFile({ path: filePath, source: "local", name });
      report(taskId, `G-code imported: ${name}`, 100, "completed");
    } catch (err) {
      report(taskId, "G-code import failed", null, "error", String(err));
    }
  };

  /** Unified import entry point — opens the file dialog and routes by extension. */
  const handleImport = async () => {
    const filePath = await window.terraForge.fs.openImportDialog({ allowBitmap: bitmapRendererEnabled });
    if (!filePath) return;
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "svg") {
      await handleImportSvgFile(filePath);
    } else if (ext === "pdf") {
      await handleImportPdfFile(filePath);
    } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      // The dialog itself already hides bitmap extensions when the feature
      // is off; this is defence in depth against an OS-level "All Files"
      // fallback some platforms add regardless of the filters we pass.
      if (!bitmapRendererEnabled) {
        report(uuid(), "Bitmap import is an experimental feature — enable it in Application Configuration.", null, "error");
        return;
      }
      await handleImportBitmapFile(filePath);
    } else {
      await handleImportGcodeFile(filePath);
    }
  };

  return {
    handleImport,
    handleImportSvgFile,
    handleImportPdfFile,
    handleImportBitmapFile,
    handleImportGcodeFile,
  };
}
