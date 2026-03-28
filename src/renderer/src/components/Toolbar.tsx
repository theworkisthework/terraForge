import { useState, useRef, useEffect } from "react";
import { v4 as uuid } from "uuid";
import { PenLine, Moon, Sun } from "lucide-react";
import { useMachineStore } from "../store/machineStore";
import { useCanvasStore } from "../store/canvasStore";
import { useTaskStore } from "../store/taskStore";
import { useThemeStore } from "../store/themeStore";
import {
  type VectorObject,
  type MachineConfig,
  type GcodeOptions,
  type SvgImport,
  type SvgPath,
  type CanvasLayout,
  type PageTemplate,
  DEFAULT_HATCH_SPACING_MM,
  DEFAULT_HATCH_ANGLE_DEG,
} from "../../../types";
import { MachineConfigDialog } from "./MachineConfigDialog";
import { GcodeOptionsDialog } from "./GcodeOptionsDialog";
import { CloseLayoutDialog } from "./CloseLayoutDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { AboutDialog } from "./AboutDialog";
import type { GcodePrefs } from "./GcodeOptionsDialog";
import {
  getAccumulatedTransform,
  applyMatrixToPathD,
  computePathsBounds,
} from "../utils/svgTransform";
import { generateHatchPaths } from "../utils/hatchFill";
import { parseGcode } from "../utils/gcodeParser";
import { importPdf } from "../utils/pdfImport";

// ─── Effective fill/stroke detection ─────────────────────────────────────────
// Helper: extract a single CSS property value from an inline style string.
// Splits on ";" to avoid a substring of one property name matching another
// (e.g. "opacity" must not accidentally match "fill-opacity").
function getStyleDecl(style: string, property: string): string {
  for (const decl of style.split(";").filter(Boolean)) {
    const colon = decl.indexOf(":");
    if (colon !== -1 && decl.slice(0, colon).trim() === property)
      return decl.slice(colon + 1).trim();
  }
  return "";
}

/**
 * Resolve an SVG presentation property by walking up the ancestor chain.
 * Returns the first explicit (non-"inherit") value found, or "" if none.
 * SVG fill, stroke, and opacity are all inheritable, so shapes styled via
 * a parent <g> (common in Inkscape/Illustrator exports) are handled correctly.
 */
function resolveInheritedProp(el: Element, property: string): string {
  let current: Element | null = el;
  while (current && current.tagName.toLowerCase() !== "svg") {
    const style = current.getAttribute("style") ?? "";
    const styleVal = getStyleDecl(style, property);
    if (styleVal && styleVal !== "inherit") return styleVal;
    const attrVal = current.getAttribute(property) ?? "";
    if (attrVal && attrVal !== "inherit") return attrVal;
    current = current.parentElement;
  }
  return "";
}

function getEffectiveFill(el: Element): string | null {
  // Resolve fill via ancestor chain: SVG fill is inheritable so parent <g> fills count.
  const fill = resolveInheritedProp(el, "fill");
  if (
    !fill ||
    fill === "none" ||
    fill === "transparent" ||
    fill.startsWith("url(")
  )
    return null;
  // Treat fully transparent fills as invisible (fill-opacity or overall opacity <= 0;
  // CSS clamps negative values to 0).
  const fillOpacityVal = resolveInheritedProp(el, "fill-opacity");
  const opacityVal = resolveInheritedProp(el, "opacity");
  if (
    (fillOpacityVal && parseFloat(fillOpacityVal) <= 0) ||
    (opacityVal && parseFloat(opacityVal) <= 0)
  )
    return null;
  return fill;
}

function hasVisibleStroke(el: Element): boolean {
  // Resolve stroke via ancestor chain: SVG stroke is inheritable so parent <g> strokes count.
  const stroke = resolveInheritedProp(el, "stroke");
  if (!stroke || stroke === "none" || stroke === "transparent") return false;
  // Also treat stroke-width of 0 as invisible
  const widthVal = resolveInheritedProp(el, "stroke-width");
  if (widthVal && parseFloat(widthVal) === 0) return false;
  // Treat fully transparent strokes as invisible (stroke-opacity or overall opacity <= 0;
  // CSS clamps negative values to 0).
  const strokeOpacityVal = resolveInheritedProp(el, "stroke-opacity");
  const opacityVal = resolveInheritedProp(el, "opacity");
  if (
    (strokeOpacityVal && parseFloat(strokeOpacityVal) <= 0) ||
    (opacityVal && parseFloat(opacityVal) <= 0)
  )
    return false;
  return true;
}

// ─── SVG length → mm conversion ─────────────────────────────────────────────────
// Handles unit suffixes from the SVG spec; unitless / px → 96 DPI
function parseSvgLengthMM(val: string | null | undefined): number | null {
  if (!val) return null;
  // Percentage values cannot be resolved to an absolute size without a viewport
  // (e.g. width="100%" height="100%") — treat as unknown so the caller falls
  // back to the viewBox dimensions instead of misinterpreting "100" as pixels.
  if (val.includes("%")) return null;
  const num = parseFloat(val);
  if (isNaN(num)) return null;
  if (val.endsWith("mm")) return num;
  if (val.endsWith("cm")) return num * 10;
  if (val.endsWith("in")) return num * 25.4;
  if (val.endsWith("pt")) return num * (25.4 / 72);
  if (val.endsWith("pc")) return num * (25.4 / 6);
  // px or unitless: 1 px = 25.4 / 96 mm  (SVG 1.1 / CSS default)
  return num * (25.4 / 96);
}

// ─── Shape-to-path conversion ──────────────────────────────────────────────────
// Converts SVG basic shapes (rect, circle, ellipse, line, polyline, polygon)
// into a path `d` string so the G-code worker can process them uniformly.

function shapeToPathD(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const g = (attr: string) => parseFloat(el.getAttribute(attr) ?? "0");

  if (tag === "path") return el.getAttribute("d") ?? "";

  if (tag === "rect") {
    const x = g("x"),
      y = g("y"),
      w = g("width"),
      h = g("height");
    const rx = Math.min(g("rx") || g("ry"), w / 2);
    const ry = Math.min(g("ry") || g("rx"), h / 2);
    if (rx === 0 && ry === 0) {
      return `M${x},${y} H${x + w} V${y + h} H${x} Z`;
    }
    // Rounded rect via arcs
    return [
      `M${x + rx},${y}`,
      `H${x + w - rx}`,
      `A${rx},${ry},0,0,1,${x + w},${y + ry}`,
      `V${y + h - ry}`,
      `A${rx},${ry},0,0,1,${x + w - rx},${y + h}`,
      `H${x + rx}`,
      `A${rx},${ry},0,0,1,${x},${y + h - ry}`,
      `V${y + ry}`,
      `A${rx},${ry},0,0,1,${x + rx},${y}`,
      "Z",
    ].join(" ");
  }

  if (tag === "circle") {
    const cx = g("cx"),
      cy = g("cy"),
      r = g("r");
    return `M${cx - r},${cy} A${r},${r},0,0,1,${cx + r},${cy} A${r},${r},0,0,1,${cx - r},${cy} Z`;
  }

  if (tag === "ellipse") {
    const cx = g("cx"),
      cy = g("cy"),
      rx2 = g("rx"),
      ry2 = g("ry");
    return `M${cx - rx2},${cy} A${rx2},${ry2},0,0,1,${cx + rx2},${cy} A${rx2},${ry2},0,0,1,${cx - rx2},${cy} Z`;
  }

  if (tag === "line") {
    return `M${g("x1")},${g("y1")} L${g("x2")},${g("y2")}`;
  }

  if (tag === "polyline") {
    const pts = (el.getAttribute("points") ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (pts.length < 2) return "";
    const cmds = [`M${pts[0]},${pts[1]}`];
    for (let i = 2; i < pts.length; i += 2)
      cmds.push(`L${pts[i]},${pts[i + 1]}`);
    return cmds.join(" ");
  }

  if (tag === "polygon") {
    const pts = (el.getAttribute("points") ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (pts.length < 2) return "";
    const cmds = [`M${pts[0]},${pts[1]}`];
    for (let i = 2; i < pts.length; i += 2)
      cmds.push(`L${pts[i]},${pts[i + 1]}`);
    cmds.push("Z");
    return cmds.join(" ");
  }

  return "";
}

function getBBox(el: Element): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const tag = el.tagName.toLowerCase();
  const g = (attr: string) => parseFloat(el.getAttribute(attr) ?? "0");

  if (tag === "rect")
    return { x: g("x"), y: g("y"), width: g("width"), height: g("height") };
  if (tag === "circle") {
    const r = g("r");
    return { x: g("cx") - r, y: g("cy") - r, width: r * 2, height: r * 2 };
  }
  if (tag === "ellipse") {
    const rx = g("rx"),
      ry = g("ry");
    return { x: g("cx") - rx, y: g("cy") - ry, width: rx * 2, height: ry * 2 };
  }
  if (tag === "line") {
    const x1 = g("x1"),
      y1 = g("y1"),
      x2 = g("x2"),
      y2 = g("y2");
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }
  if (tag === "polyline" || tag === "polygon") {
    const pts = (el.getAttribute("points") ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const xs = pts.filter((_, i) => i % 2 === 0),
      ys = pts.filter((_, i) => i % 2 === 1);
    const minX = Math.min(...xs),
      minY = Math.min(...ys);
    return {
      x: minX,
      y: minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY,
    };
  }
  // path — use a rough estimate from the d attribute numbers
  const nums =
    (el.getAttribute("d") ?? "").match(/-?[\d.]+/g)?.map(Number) ?? [];
  const xs = nums.filter((_, i) => i % 2 === 0),
    ys = nums.filter((_, i) => i % 2 === 1);
  if (!xs.length) return { x: 0, y: 0, width: 100, height: 100 };
  const minX = Math.min(...xs),
    minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

interface ToolbarProps {
  showJog?: boolean;
  onToggleJog?: () => void;
}

export function Toolbar({
  showJog = false,
  onToggleJog = () => {},
}: ToolbarProps = {}) {
  const configs = useMachineStore((s) => s.configs);
  const activeConfigId = useMachineStore((s) => s.activeConfigId);
  const setActiveConfigId = useMachineStore((s) => s.setActiveConfigId);
  const activeConfig = useMachineStore((s) => s.activeConfig);
  const connected = useMachineStore((s) => s.connected);
  const wsLive = useMachineStore((s) => s.wsLive);
  const fwInfo = useMachineStore((s) => s.fwInfo);
  const setConnected = useMachineStore((s) => s.setConnected);
  const setSelectedJobFile = useMachineStore((s) => s.setSelectedJobFile);
  const imports = useCanvasStore((s) => s.imports);
  const selectedImportId = useCanvasStore((s) => s.selectedImportId);
  const addImport = useCanvasStore((s) => s.addImport);
  const clearImports = useCanvasStore((s) => s.clearImports);
  const loadLayout = useCanvasStore((s) => s.loadLayout);
  const layerGroups = useCanvasStore((s) => s.layerGroups);
  const toVectorObjectsForGroup = useCanvasStore(
    (s) => s.toVectorObjectsForGroup,
  );
  const toVectorObjectsUngrouped = useCanvasStore(
    (s) => s.toVectorObjectsUngrouped,
  );
  const setGcodeToolpath = useCanvasStore((s) => s.setGcodeToolpath);
  const setGcodeSource = useCanvasStore((s) => s.setGcodeSource);
  const selectToolpath = useCanvasStore((s) => s.selectToolpath);
  const copyImport = useCanvasStore((s) => s.copyImport);
  const cutImport = useCanvasStore((s) => s.cutImport);
  const pasteImport = useCanvasStore((s) => s.pasteImport);
  const selectAllImports = useCanvasStore((s) => s.selectAllImports);
  const clipboardImport = useCanvasStore((s) => s.clipboardImport);
  const allImportsSelected = useCanvasStore((s) => s.allImportsSelected);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const pageTemplate = useCanvasStore((s) => s.pageTemplate);
  const setPageTemplate = useCanvasStore((s) => s.setPageTemplate);
  const pageSizes = useCanvasStore((s) => s.pageSizes);
  const setPageSizes = useCanvasStore((s) => s.setPageSizes);
  const upsertTask = useTaskStore((s) => s.upsertTask);
  const registerCancelCallback = useTaskStore((s) => s.registerCancelCallback);
  const unregisterCancelCallback = useTaskStore(
    (s) => s.unregisterCancelCallback,
  );
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  // Holds a reference to the active G-code worker so cancellation can reach it.
  const activeWorkerRef = useRef<{ worker: Worker; taskId: string } | null>(
    null,
  );

  const [showGcodeDialog, setShowGcodeDialog] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  /** Parsed layout waiting for the user to confirm overwriting the canvas. */
  const [pendingLayout, setPendingLayout] = useState<CanvasLayout | null>(null);

  const handleConnect = async () => {
    const cfg = activeConfig();
    if (!cfg) return;
    const taskId = uuid();
    const label =
      cfg.connection.type === "wifi"
        ? `Connecting to ${cfg.connection.host}…`
        : `Connecting to ${cfg.connection.serialPath}…`;
    upsertTask({
      id: taskId,
      type: "ws-connect",
      label,
      progress: null,
      status: "running",
    });
    setIsConnecting(true);
    try {
      if (cfg.connection.type === "wifi") {
        await window.terraForge.fluidnc.connectWebSocket(
          cfg.connection.host!,
          cfg.connection.port ?? 80,
          cfg.connection.wsPort,
        );
      } else {
        await window.terraForge.serial.connect(
          cfg.connection.serialPath!,
          115200,
        );
      }
      setConnected(true);
      upsertTask({
        id: taskId,
        type: "ws-connect",
        label: "Connected",
        progress: 100,
        status: "completed",
      });
    } catch (err) {
      console.error("Connection failed", err);
      upsertTask({
        id: taskId,
        type: "ws-connect",
        label: "Connection failed",
        progress: null,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const cfg = activeConfig();
    if (!cfg) return;
    if (cfg.connection.type === "wifi") {
      await window.terraForge.fluidnc.disconnectWebSocket();
    } else {
      await window.terraForge.serial.disconnect();
    }
    setConnected(false);
  };

  // ── Unified import handler — routes by file extension ─────────────────────
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
      // SVG width/height attrs carry the physical size (may have mm/cm/in/px units).
      // If they're in mm the result is exact; px/unitless uses 96 DPI.
      const physW = parseSvgLengthMM(svgEl?.getAttribute("width"));
      const physH = parseSvgLengthMM(svgEl?.getAttribute("height"));
      // Prefer width-based scale; fall back to height, then to the SVG/CSS default
      // of 1 user unit = 1 CSS pixel at 96dpi (25.4/96 mm/px).  Using 1 mm/unit
      // here is wrong for percentage-dimensioned SVGs and makes content invisible.
      const initScale =
        physW != null
          ? physW / svgWidth
          : physH != null
            ? physH / svgHeight
            : 25.4 / 96;

      // Default name = filename without extension
      const name =
        filePath
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.[^.]+$/, "") ?? "import";

      const els = Array.from(
        doc.querySelectorAll(
          "path, rect, circle, ellipse, line, polyline, polygon",
        ),
      );

      // Track which elements have a visible fill so we can generate hatch lines
      // for them after coordinates are normalized.
      const fillFlags: boolean[] = [];

      const paths: SvgPath[] = els.flatMap((el): SvgPath[] => {
        const rawD = shapeToPathD(el);
        if (!rawD) return [];
        // Resolve all ancestor transform attributes and bake them into the
        // path coordinates so the canvas and G-code worker see pre-transformed
        // positions (fixes Inkscape layer/group transforms).
        const matrix = getAccumulatedTransform(el);
        const d = applyMatrixToPathD(rawD, matrix);
        fillFlags.push(getEffectiveFill(el) !== null);
        const hasFill = fillFlags[fillFlags.length - 1];
        const outlineVisible = hasVisibleStroke(el);
        const tag = el.tagName.toLowerCase();
        const pathIndex = fillFlags.length; // 1-based after push

        // Best-effort display name: Inkscape label > <title> child > element id >
        // tagname_N fallback.
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
            layer:
              (el.closest("[id]:not(svg)") as Element | null)?.id ??
              el.id ??
              undefined,
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

      // After baking transforms the paths live in the transformed coordinate
      // space. Recompute the content extents so the selection bounding box,
      // canvas group transform, and G-code origin all reflect the actual
      // occupied area rather than the raw SVG viewBox.
      //
      // We also normalize path coordinates to start at (0, 0) by translating
      // every path by (-minX, -minY). This ensures the G-code worker always
      // receives coordinates whose origin is the top-left of the content
      // bounding box, which is what its transformPt formula expects.
      const bounds = computePathsBounds(paths.map((p) => p.d));
      const effW = bounds ? bounds.maxX - bounds.minX : svgWidth;
      const effH = bounds ? bounds.maxY - bounds.minY : svgHeight;

      const normalizedPaths = bounds
        ? paths.map((p) => ({
            ...p,
            d: applyMatrixToPathD(
              p.d,
              new DOMMatrix([1, 0, 0, 1, -bounds.minX, -bounds.minY]),
            ),
          }))
        : paths;

      // Generate hatch-fill lines for shapes that had a visible fill and embed
      // them on their parent SvgPath so they toggle as a unit.
      // Spacing is converted from mm to SVG user units using initScale.
      let finalPaths = normalizedPaths;
      if (initScale > 0) {
        const spacingUnits = DEFAULT_HATCH_SPACING_MM / initScale;
        finalPaths = normalizedPaths.map((np, i) => {
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
        viewBoxX: 0,
        viewBoxY: 0,
        hatchEnabled: true,
        hatchSpacingMM: DEFAULT_HATCH_SPACING_MM,
        hatchAngleDeg: DEFAULT_HATCH_ANGLE_DEG,
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
      // Auto-select the toolpath so the canvas, Properties panel, and
      // Job panel are all in sync from the moment of import.
      selectToolpath(true);
      // Selecting this as the queued job (local source — will upload on Start)
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
        // Canvas already has content — ask before overwriting.
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

  const handleCloseLayout = () => {
    // Nothing to close.
    if (imports.length === 0) return;
    setShowCloseDialog(true);
  };

  const doCloseLayout = () => {
    clearImports();
    setShowCloseDialog(false);
  };

  // Keep refs current so the menu IPC listeners (subscribed once on mount)
  // always call the latest function closures without stale state.
  const saveLayoutRef = useRef(handleSaveLayout);
  const loadLayoutRef = useRef(handleLoadLayout);
  const closeLayoutRef = useRef(handleCloseLayout);
  saveLayoutRef.current = handleSaveLayout;
  loadLayoutRef.current = handleLoadLayout;
  closeLayoutRef.current = handleCloseLayout;

  // ── Edit clipboard — keep refs current for use in stable IPC/keyboard listeners ─
  const selectedImportIdRef = useRef(selectedImportId);
  const clipboardImportRef = useRef(clipboardImport);
  const allImportsSelectedRef = useRef(allImportsSelected);
  selectedImportIdRef.current = selectedImportId;
  clipboardImportRef.current = clipboardImport;
  allImportsSelectedRef.current = allImportsSelected;
  const copyImportRef = useRef(copyImport);
  const cutImportRef = useRef(cutImport);
  const pasteImportRef = useRef(pasteImport);
  const selectAllImportsRef = useRef(selectAllImports);
  const clearImportsRef = useRef(clearImports);
  copyImportRef.current = copyImport;
  cutImportRef.current = cutImport;
  pasteImportRef.current = pasteImport;
  selectAllImportsRef.current = selectAllImports;
  clearImportsRef.current = clearImports;
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;

  /** Returns true if the event originates from a text editing element. */
  function isTextInputFocused(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return (
      tag === "input" ||
      tag === "textarea" ||
      (el as HTMLElement).isContentEditable
    );
  }

  /** Handle a copy request from menu or keyboard — canvas items only. */
  function handleEditCopy() {
    const id = selectedImportIdRef.current;
    if (id) copyImportRef.current(id);
  }

  /** Handle a cut request from menu or keyboard — canvas items only. */
  function handleEditCut() {
    if (allImportsSelectedRef.current) {
      clearImportsRef.current();
      return;
    }
    const id = selectedImportIdRef.current;
    if (id) cutImportRef.current(id);
  }

  /** Handle a paste request from menu or keyboard. */
  function handleEditPaste() {
    if (clipboardImportRef.current) pasteImportRef.current();
  }

  /** Handle select-all from menu or keyboard — canvas items only. */
  function handleEditSelectAll() {
    selectAllImportsRef.current();
  }

  // Subscribe to native File-menu → layout action events.
  useEffect(() => {
    const unsubImport = window.terraForge.fs.onMenuImport(() => handleImport());
    const unsubOpen = window.terraForge.fs.onMenuOpenLayout(() =>
      loadLayoutRef.current(),
    );
    const unsubSave = window.terraForge.fs.onMenuSaveLayout(() =>
      saveLayoutRef.current(),
    );
    const unsubClose = window.terraForge.fs.onMenuCloseLayout(() =>
      closeLayoutRef.current(),
    );
    const unsubAbout = window.terraForge.app.onMenuAbout(() =>
      setShowAbout(true),
    );

    // ── Edit menu events (fired alongside native webContents ops) ────────────
    const unsubCopy = window.terraForge.edit.onMenuCopy(() => {
      if (!isTextInputFocused()) handleEditCopy();
    });
    const unsubCut = window.terraForge.edit.onMenuCut(() => {
      if (!isTextInputFocused()) handleEditCut();
    });
    const unsubPaste = window.terraForge.edit.onMenuPaste(() => {
      if (!isTextInputFocused()) handleEditPaste();
    });
    const unsubSelectAll = window.terraForge.edit.onMenuSelectAll(() => {
      if (!isTextInputFocused()) handleEditSelectAll();
    });

    // ── Keyboard shortcuts — intercept only when no text field is focused ────
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (isTextInputFocused()) return;
      switch (e.key.toLowerCase()) {
        case "c":
          handleEditCopy();
          break;
        case "x":
          handleEditCut();
          break;
        case "v":
          handleEditPaste();
          break;
        case "a":
          handleEditSelectAll();
          e.preventDefault(); // prevent browser select-all of page text
          break;
        case "z":
          e.preventDefault();
          if (e.shiftKey) {
            redoRef.current();
          } else {
            undoRef.current();
          }
          break;
        case "y":
          e.preventDefault();
          redoRef.current();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      unsubImport();
      unsubOpen();
      unsubSave();
      unsubClose();
      unsubAbout();
      unsubCopy();
      unsubCut();
      unsubPaste();
      unsubSelectAll();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load custom page sizes from the main process on mount.
  // Falls back to the built-in defaults (already in the store) if IPC fails.
  useEffect(() => {
    window.terraForge.config
      .loadPageSizes()
      .then((sizes) => {
        if (sizes.length > 0) setPageSizes(sizes);
      })
      .catch(() => {
        /* keep built-in defaults */
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep Save Layout / Close Layout menu items enabled only when there are imports.
  useEffect(() => {
    window.terraForge.fs.setLayoutMenuState(imports.length > 0);
  }, [imports.length]);

  // Keep Edit → Cut / Copy menu items enabled only when a canvas import is selected.
  useEffect(() => {
    window.terraForge.edit.setHasSelection(selectedImportId !== null);
  }, [selectedImportId]);

  const handleGenerateGcode = async (prefs: GcodePrefs) => {
    const cfg = activeConfig();
    if (!cfg || imports.length === 0) return;

    // Route to per-group export when the option is enabled and groups exist.
    if (prefs.exportPerGroup && layerGroups.length > 0) {
      await handleGenerateGcodePerGroup(prefs, cfg);
      return;
    }

    setGenerating(true);
    const taskId = uuid();
    const activePageSize = pageTemplate
      ? pageSizes.find((ps) => ps.id === pageTemplate.sizeId)
      : undefined;
    const options: GcodeOptions = {
      arcFitting: false,
      arcTolerance: 0.01,
      optimisePaths: prefs.optimise,
      joinPaths: prefs.joinPaths,
      joinTolerance: prefs.joinTolerance,
      liftPenAtEnd: prefs.liftPenAtEnd,
      returnToHome: prefs.returnToHome,
      customStartGcode: prefs.customStartGcode,
      customEndGcode: prefs.customEndGcode,
      pageClip:
        activePageSize && prefs.clipMode !== "none"
          ? {
              widthMM: pageTemplate!.landscape
                ? activePageSize.heightMM
                : activePageSize.widthMM,
              heightMM: pageTemplate!.landscape
                ? activePageSize.widthMM
                : activePageSize.heightMM,
              marginMM:
                prefs.clipMode === "margin"
                  ? (pageTemplate!.marginMM ?? 20)
                  : (prefs.clipOffsetMM ?? 0),
            }
          : undefined,
    };

    const worker = new Worker(
      new URL("../../../workers/svgWorker.ts", import.meta.url),
      { type: "module" },
    );

    activeWorkerRef.current = { worker, taskId };

    // Register a direct cancel callback so TaskBar can stop the worker without
    // an IPC round-trip through the main process.
    registerCancelCallback(taskId, () => {
      worker.postMessage({ type: "cancel", taskId });
    });

    upsertTask({
      id: taskId,
      type: "gcode-generate",
      label: "Generating G-code",
      progress: 0,
      status: "running",
    });

    worker.onmessage = async (e) => {
      const msg = e.data;
      if (msg.type === "progress") {
        upsertTask({
          id: taskId,
          type: "gcode-generate",
          label: "Generating G-code",
          progress: msg.percent,
          status: "running",
        });
      } else if (msg.type === "complete") {
        worker.terminate();
        activeWorkerRef.current = null;
        unregisterCancelCallback(taskId);
        setGenerating(false);

        // Build a meaningful default filename from the import names.
        const baseName =
          imports.length === 1
            ? imports[0].name
            : `${imports[0].name}+${imports.length - 1}`;
        const safeName = baseName
          .replace(/\.[^.]+$/, "") // strip any existing extension
          .replace(/[\\/:*?"<>|]/g, "_"); // remove filesystem-illegal chars
        const defaultFilename = prefs.optimise
          ? `${safeName}_opt.gcode`
          : `${safeName}.gcode`;

        upsertTask({
          id: taskId,
          type: "gcode-generate",
          label: "G-code ready",
          progress: 100,
          status: "completed",
        });

        // ── Load toolpath preview into canvas (enables tracing during job) ──
        const toolpath = parseGcode(msg.gcode);
        setGcodeToolpath(toolpath);
        selectToolpath(true);

        // ── Upload to SD card (if opted in and connected) ─────────────────
        if (prefs.uploadToSd && useMachineStore.getState().connected) {
          const uploadTaskId = uuid();
          const remotePath = "/" + defaultFilename;
          try {
            await window.terraForge.fluidnc.uploadGcode(
              uploadTaskId,
              msg.gcode,
              remotePath,
            );
            // Auto-select the uploaded file so Start Job is ready immediately
            setSelectedJobFile({
              path: remotePath,
              source: "sd",
              name: defaultFilename,
            });
            setGcodeSource({
              path: remotePath,
              name: defaultFilename,
              source: "sd",
            });
          } catch {
            // Upload error is already surfaced via the upload task toast
          }
        }

        // ── Save to local computer (if opted in) ──────────────────────────
        if (prefs.saveLocally) {
          const savePath =
            await window.terraForge.fs.saveGcodeDialog(defaultFilename);
          if (savePath) {
            await window.terraForge.fs.writeFile(savePath, msg.gcode);
            setGcodeSource({
              path: savePath,
              name: defaultFilename,
              source: "local",
            });
          }
        }
      } else if (msg.type === "cancelled") {
        upsertTask({
          id: taskId,
          type: "gcode-generate",
          label: "G-code cancelled",
          progress: null,
          status: "cancelled",
        });
        worker.terminate();
        activeWorkerRef.current = null;
        unregisterCancelCallback(taskId);
        setGenerating(false);
      } else if (msg.type === "error") {
        upsertTask({
          id: taskId,
          type: "gcode-generate",
          label: "G-code failed",
          progress: null,
          status: "error",
          error: msg.error,
        });
        worker.terminate();
        activeWorkerRef.current = null;
        unregisterCancelCallback(taskId);
        setGenerating(false);
      }
    };

    worker.postMessage({
      type: "generate",
      taskId,
      objects: useCanvasStore.getState().toVectorObjects(),
      config: cfg,
      options,
    });
  };

  // ── Per-group G-code export ───────────────────────────────────────────────
  const handleGenerateGcodePerGroup = async (
    prefs: GcodePrefs,
    cfg: ReturnType<typeof activeConfig>,
  ) => {
    if (!cfg) return;
    const activePageSize = pageTemplate
      ? pageSizes.find((ps) => ps.id === pageTemplate.sizeId)
      : undefined;
    const options: GcodeOptions = {
      arcFitting: false,
      arcTolerance: 0.01,
      optimisePaths: prefs.optimise,
      joinPaths: prefs.joinPaths,
      joinTolerance: prefs.joinTolerance,
      liftPenAtEnd: prefs.liftPenAtEnd,
      returnToHome: prefs.returnToHome,
      customStartGcode: prefs.customStartGcode,
      customEndGcode: prefs.customEndGcode,
      pageClip:
        activePageSize && prefs.clipMode !== "none"
          ? {
              widthMM: pageTemplate!.landscape
                ? activePageSize.heightMM
                : activePageSize.widthMM,
              heightMM: pageTemplate!.landscape
                ? activePageSize.widthMM
                : activePageSize.heightMM,
              marginMM:
                prefs.clipMode === "margin"
                  ? (pageTemplate!.marginMM ?? 20)
                  : (prefs.clipOffsetMM ?? 0),
            }
          : undefined,
    };

    // Only process groups that have at least one visible path in them.
    // Also include a synthetic "ungrouped" entry for imports not in any group.
    type GroupEntry = {
      id: string | null;
      name: string;
      objects: VectorObject[];
    };
    const ungroupedObjects = toVectorObjectsUngrouped();
    const allEntries: GroupEntry[] = [
      ...(ungroupedObjects.length > 0
        ? [{ id: null, name: "ungrouped", objects: ungroupedObjects }]
        : []),
      ...layerGroups
        .map((g) => ({
          id: g.id,
          name: g.name,
          objects: toVectorObjectsForGroup(g.id),
        }))
        .filter((e) => e.objects.length > 0),
    ];
    if (allEntries.length === 0) return;

    // Ask for a save directory once when the user wants local files.
    let saveDir: string | null = null;
    if (prefs.saveLocally) {
      saveDir = await window.terraForge.fs.chooseDirectory();
      if (!saveDir) return; // user cancelled
    }

    setGenerating(true);

    for (const group of allEntries) {
      const objects = group.objects;
      const taskId = uuid();
      const safeName = group.name.replace(/[\\/:*?"<>|]/g, "_");
      const defaultFilename = prefs.optimise
        ? `${safeName}_opt.gcode`
        : `${safeName}.gcode`;

      upsertTask({
        id: taskId,
        type: "gcode-generate",
        label: `Generating ${group.name}…`,
        progress: 0,
        status: "running",
      });

      const gcode = await new Promise<string | null>((resolve) => {
        const worker = new Worker(
          new URL("../../../workers/svgWorker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = (e) => {
          const msg = e.data;
          if (msg.type === "progress") {
            upsertTask({
              id: taskId,
              type: "gcode-generate",
              label: `Generating ${group.name}…`,
              progress: msg.percent,
              status: "running",
            });
          } else if (msg.type === "complete") {
            worker.terminate();
            upsertTask({
              id: taskId,
              type: "gcode-generate",
              label: `${group.name} ready`,
              progress: 100,
              status: "completed",
            });
            resolve(msg.gcode as string);
          } else {
            worker.terminate();
            upsertTask({
              id: taskId,
              type: "gcode-generate",
              label: `${group.name} failed`,
              progress: null,
              status: "error",
            });
            resolve(null);
          }
        };
        worker.postMessage({
          type: "generate",
          taskId,
          objects,
          config: cfg,
          options,
        });
      });

      if (!gcode) continue;

      if (prefs.saveLocally && saveDir) {
        const savePath = `${saveDir}/${defaultFilename}`;
        await window.terraForge.fs.writeFile(savePath, gcode);
      }

      if (prefs.uploadToSd && useMachineStore.getState().connected) {
        const uploadTaskId = uuid();
        const remotePath = "/" + defaultFilename;
        try {
          await window.terraForge.fluidnc.uploadGcode(
            uploadTaskId,
            gcode,
            remotePath,
          );
        } catch {
          // Upload error surfaced via upload task toast
        }
      }
    }

    setGenerating(false);
  };

  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-panel border-b border-border-ui shrink-0">
      {/* Brand */}
      <span className="text-accent font-bold tracking-widest text-sm mr-2">
        terraForge
      </span>

      {/* Machine selector — locked while connected */}
      <select
        aria-label="Machine selector"
        className="bg-app border border-border-ui rounded px-2 py-1 text-sm text-content min-w-[180px] disabled:opacity-50 disabled:cursor-not-allowed"
        value={activeConfigId ?? ""}
        onChange={(e) => setActiveConfigId(e.target.value || null)}
        disabled={connected}
        title={connected ? "Disconnect before switching machine" : undefined}
      >
        <option value="">— Select machine —</option>
        {configs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {/* Connect / disconnect */}
      {connected ? (
        <button
          onClick={handleDisconnect}
          className="px-3 py-1 rounded text-sm bg-secondary hover:bg-accent transition-colors"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={handleConnect}
          disabled={!activeConfigId || isConnecting}
          className="px-3 py-1 rounded text-sm bg-accent hover:bg-accent-hover disabled:opacity-40 transition-colors flex items-center gap-1.5"
        >
          {isConnecting ? (
            <>
              <svg
                className="animate-spin h-3 w-3 shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              Connecting…
            </>
          ) : (
            "Connect"
          )}
        </button>
      )}

      <div className="h-4 w-px bg-border-ui" />

      {/* Import — SVG / PDF / G-code, detected from extension */}
      <button
        onClick={handleImport}
        className="px-3 py-1 rounded text-sm bg-secondary hover:bg-secondary-hover transition-colors"
        title="Import an SVG, PDF, or G-code file"
      >
        Import
      </button>

      {/* Generate G-code — opens options dialog */}
      <button
        onClick={() => setShowGcodeDialog(true)}
        disabled={generating || imports.length === 0}
        className="px-3 py-1 rounded text-sm bg-accent hover:bg-accent-hover disabled:opacity-40 transition-colors"
        title="Choose generation options then generate G-code"
      >
        {generating ? "Generating…" : "Generate G-code"}
      </button>

      {showGcodeDialog && (
        <GcodeOptionsDialog
          onConfirm={(prefs) => {
            setShowGcodeDialog(false);
            handleGenerateGcode(prefs);
          }}
          onCancel={() => setShowGcodeDialog(false)}
        />
      )}

      <div className="h-4 w-px bg-border-ui" />

      {/* ── Page Template ─────────────────────────────────────────────────────
           Shows a non-interactive page-size overlay on the canvas.
           Sizes come from the store (loaded from IPC / built-in defaults). */}
      <div className="flex items-center gap-1">
        <select
          className="bg-app border border-border-ui rounded px-2 py-1 text-sm text-content max-w-[110px]"
          value={pageTemplate?.sizeId ?? "none"}
          title="Page template — adds a size guide overlay to the canvas"
          onChange={(e) => {
            const id = e.target.value;
            if (id === "none") {
              setPageTemplate(null);
            } else {
              setPageTemplate({
                sizeId: id,
                landscape: pageTemplate?.landscape ?? true,
                marginMM: pageTemplate?.marginMM ?? 20,
              });
            }
          }}
        >
          <option value="none">No page</option>
          {pageSizes.map((ps) => (
            <option key={ps.id} value={ps.id}>
              {ps.name}
            </option>
          ))}
        </select>

        {/* Portrait / landscape toggle — only shown when a page is selected */}
        {pageTemplate && (
          <button
            onClick={() =>
              setPageTemplate({
                ...pageTemplate,
                landscape: !pageTemplate.landscape,
                marginMM: pageTemplate.marginMM ?? 20,
              })
            }
            className="w-7 h-7 rounded bg-secondary hover:bg-secondary-hover transition-colors flex items-center justify-center text-content-muted"
            title={
              pageTemplate.landscape
                ? "Landscape — click to switch to portrait"
                : "Portrait — click to switch to landscape"
            }
          >
            {pageTemplate.landscape ? (
              /* Landscape page icon */
              <svg
                width="16"
                height="12"
                viewBox="0 0 16 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="0.75" y="0.75" width="14.5" height="10.5" rx="1" />
              </svg>
            ) : (
              /* Portrait page icon */
              <svg
                width="11"
                height="15"
                viewBox="0 0 11 15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="0.75" y="0.75" width="9.5" height="13.5" rx="1" />
              </svg>
            )}
          </button>
        )}

        {/* Margin input — only shown when a page is selected */}
        {pageTemplate && (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={pageTemplate.marginMM ?? 20}
              onChange={(e) =>
                setPageTemplate({
                  ...pageTemplate,
                  marginMM: Math.max(
                    0,
                    Math.min(100, Number(e.target.value) || 0),
                  ),
                })
              }
              className="w-14 bg-app border border-border-ui rounded px-2 py-1 text-sm text-content text-right"
              title="Page margin in mm"
            />
            <span className="text-xs text-content-muted">mm</span>
          </div>
        )}

        {/* Edit custom page sizes file */}
        <button
          onClick={() => window.terraForge.config.openPageSizesFile()}
          className="w-7 h-7 rounded bg-secondary hover:bg-secondary-hover transition-colors flex items-center justify-center text-content-faint"
          title="Edit custom page sizes (opens page-sizes.json in your default editor)"
        >
          <PenLine size={12} />
        </button>
      </div>

      <div className="h-4 w-px bg-border-ui" />

      {/* Home */}
      <button
        onClick={() => window.terraForge.fluidnc.sendCommand("$H")}
        disabled={!connected}
        title="Run homing cycle ($H)"
        className="px-3 py-1 rounded text-sm bg-secondary hover:bg-secondary-hover disabled:opacity-40 transition-colors"
      >
        Home
      </button>

      {/* Jog toggle */}
      <button
        onClick={onToggleJog}
        className={`px-3 py-1 rounded text-sm transition-colors ${showJog ? "bg-accent" : "bg-secondary hover:bg-secondary-hover"}`}
      >
        Jog
      </button>

      {/* Connection status indicator */}
      <div className="ml-auto flex items-center gap-3">
        {/* Firmware version — shown when connected and version was detected */}
        {connected && fwInfo && (
          <span
            className="text-xs text-gray-500 font-mono"
            title="Detected firmware version"
          >
            {fwInfo}
          </span>
        )}

        <span
          className={`w-2 h-2 rounded-full transition-colors ${
            !connected
              ? "bg-content-faint"
              : wsLive
                ? "bg-green-400"
                : "bg-amber-400 animate-pulse"
          }`}
          title={
            !connected
              ? "Offline"
              : wsLive
                ? "Connected — WebSocket live"
                : "Connected — waiting for WebSocket"
          }
        />
        <span className="text-xs text-content-muted">
          {!connected ? "Offline" : wsLive ? "Connected" : "Connecting…"}
        </span>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          aria-pressed={theme === "light"}
          title={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          className="p-1.5 rounded bg-secondary hover:bg-secondary-hover transition-colors text-content-muted"
        >
          {theme === "dark" ? (
            <Sun size={14} aria-hidden="true" />
          ) : (
            <Moon size={14} aria-hidden="true" />
          )}
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          aria-label="Machine settings"
          title="Machine settings"
          className="px-2 py-1 rounded text-sm bg-secondary hover:bg-secondary-hover transition-colors"
        >
          ⚙
        </button>
      </div>

      {showSettings && (
        <MachineConfigDialog onClose={() => setShowSettings(false)} />
      )}

      {showCloseDialog && (
        <CloseLayoutDialog
          importCount={imports.length}
          onSave={async () => {
            setShowCloseDialog(false);
            await handleSaveLayout();
            // Only clear canvas once save dialog resolves (user may cancel it)
            // We clear unconditionally because the user explicitly chose Save —
            // if they cancelled the file picker we still dismiss the close dialog.
            clearImports();
          }}
          onDiscard={doCloseLayout}
          onCancel={() => setShowCloseDialog(false)}
        />
      )}

      {pendingLayout !== null && (
        <ConfirmDialog
          title="Replace Canvas?"
          message={`The canvas already has ${imports.length} object${imports.length !== 1 ? "s" : ""}. Opening this layout will replace it.\n\nContinue?`}
          confirmLabel="Replace"
          onConfirm={() => {
            loadLayout(
              pendingLayout.imports,
              pendingLayout.layerGroups,
              pendingLayout.pageTemplate,
            );
            setPendingLayout(null);
          }}
          onCancel={() => setPendingLayout(null)}
        />
      )}

      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
    </header>
  );
}
