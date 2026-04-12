import { v4 as uuid } from "uuid";
import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "../../../store/canvasStore";
import { selectImportActionsCanvasState } from "../../../store/canvasSelectors";
import { useTaskStore } from "../../../store/taskStore";
import { useMachineStore } from "../../../store/machineStore";
import {
  findContainingLayerId,
  getEffectiveFill,
  getLayerName,
  hasVisibleStroke,
  isDisplayNone,
  isLayerGroup,
  parseSvgLengthMM,
  parseSvgStylesheet,
  shapeToPathD,
} from "../services/svgImportHelpers";
import {
  getAccumulatedTransform,
  applyMatrixToPathD,
  computePathsBounds,
} from "../../../utils/svgTransform";
import { generateHatchPaths } from "../../../utils/hatchFill";
import { parseGcode } from "../../../utils/gcodeParser";
import { importPdf } from "../../../utils/pdfImport";
import {
  type SvgImport,
  type SvgPath,
  type SvgLayer,
  DEFAULT_HATCH_SPACING_MM,
  DEFAULT_HATCH_ANGLE_DEG,
} from "../../../../../types";

function computeRenderedPathBounds(pathDs: string[]) {
  if (typeof document === "undefined" || pathDs.length === 0) return null;

  const ns = "http://www.w3.org/2000/svg";
  const probeSvg = document.createElementNS(ns, "svg");
  probeSvg.setAttribute("width", "0");
  probeSvg.setAttribute("height", "0");
  probeSvg.style.position = "fixed";
  probeSvg.style.left = "-10000px";
  probeSvg.style.top = "-10000px";
  probeSvg.style.pointerEvents = "none";

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  document.body.appendChild(probeSvg);
  try {
    for (const d of pathDs) {
      if (!d) continue;
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      probeSvg.appendChild(p);
      try {
        const b = p.getBBox();
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
        if (b.x < minX) minX = b.x;
        if (b.y < minY) minY = b.y;
        if (b.x + b.width > maxX) maxX = b.x + b.width;
        if (b.y + b.height > maxY) maxY = b.y + b.height;
      } catch {
        // Ignore invalid individual paths; parser fallback covers full import.
      }
      p.remove();
    }
  } finally {
    probeSvg.remove();
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** Orchestrates SVG, PDF, and G-code file imports into the canvas store. */
export function useImportActions() {
  const { addImport, setGcodeToolpath, setGcodeSource, selectToolpath } =
    useCanvasStore(useShallow(selectImportActionsCanvasState));
  const upsertTask = useTaskStore((s) => s.upsertTask);
  const setSelectedJobFile = useMachineStore((s) => s.setSelectedJobFile);

  /**
   * Imports a single SVG file — parses layers, shapes, fills, hatch lines, and
   * normalises all path coordinates before handing off to the canvas store.
   */
  const handleImportSvgFile = async (filePath: string) => {
    const taskId = uuid();
    upsertTask({
      id: taskId,
      type: "svg-parse",
      label: "Parsing SVG…",
      progress: null,
      status: "running",
    });

    try {
      const raw = await window.terraForge.fs.readFile(filePath);
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, "image/svg+xml");

      const svgEl = doc.querySelector("svg");
      const stylesheet = parseSvgStylesheet(doc);
      const vbParts = svgEl
        ?.getAttribute("viewBox")
        ?.trim()
        .split(/[\s,]+/)
        .map(Number);
      const viewBoxX = vbParts?.[0] ?? 0;
      const viewBoxY = vbParts?.[1] ?? 0;
      const svgWidth = vbParts?.[2] ?? +(svgEl?.getAttribute("width") ?? 100);
      const svgHeight = vbParts?.[3] ?? +(svgEl?.getAttribute("height") ?? 100);

      // Compute initial scale: mm per SVG user-unit.
      const physW = parseSvgLengthMM(svgEl?.getAttribute("width"));
      const physH = parseSvgLengthMM(svgEl?.getAttribute("height"));
      const initScale =
        physW != null
          ? physW / svgWidth
          : physH != null
            ? physH / svgHeight
            : 25.4 / 96;

      const name =
        filePath
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.[^.]+$/, "") ?? "import";

      // Detect logical layer groups (<g> elements with explicit display or Inkscape markers).
      const layerGroupEls = Array.from(doc.querySelectorAll("g")).filter(
        (g) => !g.closest("defs, clipPath, mask, symbol") && isLayerGroup(g),
      );
      const layers: SvgLayer[] = layerGroupEls.map((g, i) => ({
        id: g.id || `layer_${i}`,
        name: getLayerName(g, i),
        visible: !isDisplayNone(g, stylesheet),
      }));
      layerGroupEls.forEach((g, i) => {
        if (!g.id) g.id = `layer_${i}`;
      });
      const layerGroupIds = new Set(layers.map((l) => l.id));

      // Collect shape elements, skipping those inside hidden non-layer ancestors.
      const els = Array.from(
        doc.querySelectorAll(
          "path, rect, circle, ellipse, line, polyline, polygon",
        ),
      ).filter((el) => {
        let cur = el.parentElement;
        while (cur && cur.tagName.toLowerCase() !== "svg") {
          if (isDisplayNone(cur, stylesheet)) {
            if (cur.id && layerGroupIds.has(cur.id)) {
              cur = cur.parentElement;
              continue;
            }
            return false;
          }
          cur = cur.parentElement;
        }
        return true;
      });

      const fillFlags: boolean[] = [];

      const paths: SvgPath[] = els.flatMap((el): SvgPath[] => {
        const rawD = shapeToPathD(el);
        if (!rawD) return [];
        const matrix = getAccumulatedTransform(el);
        const d = applyMatrixToPathD(rawD, matrix);

        // Avoid per-path viewBox culling here: complex Illustrator paths can
        // yield conservative or noisy bounds during parsing and get dropped,
        // resulting in partially imported artwork.

        fillFlags.push(getEffectiveFill(el, stylesheet) !== null);
        const hasFill = fillFlags[fillFlags.length - 1];
        const outlineVisible = hasVisibleStroke(el, stylesheet);
        const tag = el.tagName.toLowerCase();
        const pathIndex = fillFlags.length;

        const inkLabel =
          el.getAttribute("inkscape:label") ??
          el.getAttributeNS(
            "http://www.inkscape.org/namespaces/inkscape",
            "label",
          );
        const titleText = el
          .querySelector(":scope > title")
          ?.textContent?.trim();
        const ownId =
          el.id && !/^[a-f0-9-]{36}$/.test(el.id) ? el.id : undefined;
        const label =
          inkLabel?.trim() || titleText || ownId || `${tag}_${pathIndex}`;

        return [
          {
            id: uuid(),
            d,
            svgSource: el.outerHTML,
            visible: true,
            hasFill,
            outlineVisible,
            label,
            layer: findContainingLayerId(el, layerGroupIds),
          },
        ];
      });

      if (paths.length === 0) {
        upsertTask({
          id: taskId,
          type: "svg-parse",
          label: "No paths found in SVG",
          progress: null,
          status: "error",
        });
        return;
      }

      const pathDs = paths.map((p) => p.d);
      const bounds =
        computeRenderedPathBounds(pathDs) ?? computePathsBounds(pathDs);
      const normX = bounds?.minX ?? viewBoxX;
      const normY = bounds?.minY ?? viewBoxY;
      const effW = bounds ? bounds.maxX - bounds.minX : svgWidth;
      const effH = bounds ? bounds.maxY - bounds.minY : svgHeight;

      let finalPaths = paths;
      if (initScale > 0) {
        const spacingUnits = DEFAULT_HATCH_SPACING_MM / initScale;
        finalPaths = paths.map((np, i) => {
          if (!fillFlags[i]) return np;
          const hatchLines = generateHatchPaths(
            np.d,
            spacingUnits,
            DEFAULT_HATCH_ANGLE_DEG,
          );
          return hatchLines.length ? { ...np, hatchLines } : np;
        });
      }

      const imp: SvgImport = {
        id: uuid(),
        name,
        paths: finalPaths,
        x: 0,
        y: 0,
        scale: initScale,
        rotation: 0,
        visible: true,
        svgWidth: effW,
        svgHeight: effH,
        viewBoxX: normX,
        viewBoxY: normY,
        hatchEnabled: true,
        hatchSpacingMM: DEFAULT_HATCH_SPACING_MM,
        hatchAngleDeg: DEFAULT_HATCH_ANGLE_DEG,
        layers: layers.length > 0 ? layers : undefined,
      };

      addImport(imp);
      upsertTask({
        id: taskId,
        type: "svg-parse",
        label: "SVG imported",
        progress: 100,
        status: "completed",
      });
    } catch (err) {
      upsertTask({
        id: taskId,
        type: "svg-parse",
        label: "SVG import failed",
        progress: null,
        status: "error",
        error: String(err),
      });
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
    upsertTask({
      id: taskId,
      type: "svg-parse",
      label: `Importing ${name}.pdf…`,
      progress: null,
      status: "running",
    });

    try {
      const data = await window.terraForge.fs.readFileBinary(filePath);
      const pdfImports = await importPdf(data, name);

      if (pdfImports.length === 0) {
        upsertTask({
          id: taskId,
          type: "svg-parse",
          label: "No vector paths found in PDF",
          progress: null,
          status: "error",
        });
        return;
      }

      for (const imp of pdfImports) {
        addImport(imp);
      }

      upsertTask({
        id: taskId,
        type: "svg-parse",
        label:
          pdfImports.length === 1
            ? `PDF imported: ${pdfImports[0].name}`
            : `PDF imported: ${pdfImports.length} pages`,
        progress: 100,
        status: "completed",
      });
    } catch (err) {
      upsertTask({
        id: taskId,
        type: "svg-parse",
        label: "PDF import failed",
        progress: null,
        status: "error",
        error: String(err),
      });
    }
  };

  /** Imports a G-code file directly into the canvas toolpath. */
  const handleImportGcodeFile = async (filePath: string) => {
    const name = filePath.split(/[\\/]/).pop() ?? "import.gcode";
    const taskId = uuid();
    upsertTask({
      id: taskId,
      type: "svg-parse",
      label: `Importing ${name}…`,
      progress: null,
      status: "running",
    });

    try {
      const text = await window.terraForge.fs.readFile(filePath);
      const toolpath = parseGcode(text);
      setGcodeToolpath(toolpath);
      setGcodeSource({ path: filePath, name, source: "local" });
      selectToolpath(true);
      setSelectedJobFile({ path: filePath, source: "local", name });
      upsertTask({
        id: taskId,
        type: "svg-parse",
        label: `G-code imported: ${name}`,
        progress: 100,
        status: "completed",
      });
    } catch (err) {
      upsertTask({
        id: taskId,
        type: "svg-parse",
        label: "G-code import failed",
        progress: null,
        status: "error",
        error: String(err),
      });
    }
  };

  /** Unified import entry point — opens the file dialog and routes by extension. */
  const handleImport = async () => {
    const filePath = await window.terraForge.fs.openImportDialog();
    if (!filePath) return;
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "svg") {
      await handleImportSvgFile(filePath);
    } else if (ext === "pdf") {
      await handleImportPdfFile(filePath);
    } else {
      await handleImportGcodeFile(filePath);
    }
  };

  return {
    handleImport,
    handleImportSvgFile,
    handleImportPdfFile,
    handleImportGcodeFile,
  };
}
