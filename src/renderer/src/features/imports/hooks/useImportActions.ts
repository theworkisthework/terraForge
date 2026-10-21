import { v4 as uuid } from "uuid";
import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "../../../store/canvasStore";
import { selectImportActionsCanvasState } from "../../../store/canvasSelectors";
import { useTaskStore } from "../../../store/taskStore";
import { useMachineStore } from "../../../store/machineStore";
import {
  findContainingLayerId,
  getEffectiveFill,
  getEffectiveStrokeColor,
  getLayerName,
  hasVisibleStroke,
  isDisplayNone,
  isLayerGroup,
  normalizeSvgColor,
  parseSvgStylesheet,
  resolveSvgUserSpace,
  shapeToPathD,
} from "../services/svgImportHelpers";
import {
  getAccumulatedTransform,
  applyMatrixToPathD,
  computeImportPathBounds,
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

/** Orchestrates SVG, PDF, and G-code file imports into the canvas store. */
export function useImportActions() {
  const { addImport, setGcodeToolpath, setGcodeSource, selectToolpath } =
    useCanvasStore(useShallow(selectImportActionsCanvasState));
  const upsertTask = useTaskStore((s) => s.upsertTask);
  const setSelectedJobFile = useMachineStore((s) => s.setSelectedJobFile);
  const activeMachineConfig = useMachineStore((s) => s.activeConfig());

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
      const {
        viewBoxX,
        viewBoxY,
        width: svgWidth,
        height: svgHeight,
        scale: initScale,
      } = resolveSvgUserSpace(svgEl);

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

      const isIncludedByDisplayRules = (el: Element): boolean => {
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
      };

      const skippedTextCount = Array.from(doc.querySelectorAll("text")).filter(
        (textEl) =>
          !textEl.closest("defs, clipPath, mask, symbol") &&
          isIncludedByDisplayRules(textEl),
      ).length;

      // Collect shape elements, skipping those inside hidden non-layer ancestors.
      const els = Array.from(
        doc.querySelectorAll(
          "path, rect, circle, ellipse, line, polyline, polygon",
        ),
      ).filter((el) => isIncludedByDisplayRules(el));

      const fillFlags: boolean[] = [];

      const paths: SvgPath[] = els.flatMap((el): SvgPath[] => {
        const rawD = shapeToPathD(el);
        if (!rawD) return [];
        const matrix = getAccumulatedTransform(el);
        const d = applyMatrixToPathD(rawD, matrix);

        // Avoid per-path viewBox culling here: complex Illustrator paths can
        // yield conservative or noisy bounds during parsing and get dropped,
        // resulting in partially imported artwork.

        const effectiveFill = getEffectiveFill(el, stylesheet);
        const hasFill = effectiveFill !== null;
        fillFlags.push(hasFill);
        const effectiveStroke = getEffectiveStrokeColor(el, stylesheet);
        const normalizedFill = effectiveFill
          ? normalizeSvgColor(effectiveFill)
          : undefined;
        const normalizedStroke = effectiveStroke
          ? normalizeSvgColor(effectiveStroke)
          : undefined;
        const sourceOutlineVisible = hasVisibleStroke(el, stylesheet);
        const tag = el.tagName.toLowerCase();
        const pathIndex = fillFlags.length;
        const pointTap =
          tag === "circle"
            ? (() => {
                const cx = Number.parseFloat(el.getAttribute("cx") ?? "");
                const cy = Number.parseFloat(el.getAttribute("cy") ?? "");
                if (!Number.isFinite(cx) || !Number.isFinite(cy))
                  return undefined;
                const pt = matrix.transformPoint({ x: cx, y: cy, z: 0, w: 1 });
                return { x: pt.x, y: pt.y };
              })()
            : undefined;

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
            fillColor: normalizedFill,
            strokeColor: normalizedStroke,
            sourceColor: normalizedFill ?? normalizedStroke,
            sourceOutlineVisible,
            outlineVisible: sourceOutlineVisible,
            strokeEnabled: true,
            pointTap,
            label,
            layer: findContainingLayerId(el, layerGroupIds),
          },
        ];
      });

      if (paths.length === 0) {
        const textSkipSuffix =
          skippedTextCount > 0
            ? ` (${skippedTextCount} text element${skippedTextCount === 1 ? "" : "s"} skipped; convert text to outlines)`
            : "";
        upsertTask({
          id: taskId,
          type: "svg-parse",
          label: `No paths found in SVG${textSkipSuffix}`,
          progress: null,
          status: "error",
        });
        return;
      }

      const pathDs = paths.map((p) => p.d);
      const bounds = computeImportPathBounds(pathDs);
      const normX = bounds?.minX ?? viewBoxX;
      const normY = bounds?.minY ?? viewBoxY;
      const effW = bounds ? bounds.maxX - bounds.minX : svgWidth;
      const effH = bounds ? bounds.maxY - bounds.minY : svgHeight;
      const objW = effW * initScale;
      const objH = effH * initScale;
      const origin = activeMachineConfig?.origin ?? "bottom-left";
      const bedW = activeMachineConfig?.bedWidth ?? 220;
      const isRightOrigin = origin === "bottom-right" || origin === "top-right";
      const isTopOrigin = origin === "top-left" || origin === "top-right";
      const initialX = isRightOrigin ? bedW - objW : 0;
      const initialY = isTopOrigin ? -objH : 0;

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
        x: initialX,
        y: initialY,
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
        strokeEnabled: true,
        plotPointsEnabled: false,
        generatedStrokeForNoStroke: false,
        layers: layers.length > 0 ? layers : undefined,
      };

      addImport(imp);
      const skippedTextMessage =
        skippedTextCount > 0
          ? `${skippedTextCount} text element${skippedTextCount === 1 ? "" : "s"} skipped; convert text to outlines`
          : undefined;
      upsertTask({
        id: taskId,
        type: "svg-parse",
        label: "SVG imported",
        progress: 100,
        status: skippedTextCount > 0 ? "warning" : "completed",
        error: skippedTextMessage,
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
