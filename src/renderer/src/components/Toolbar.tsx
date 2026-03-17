import { useState, useRef } from "react";
import { v4 as uuid } from "uuid";
import { useMachineStore } from "../store/machineStore";
import { useCanvasStore } from "../store/canvasStore";
import { useTaskStore } from "../store/taskStore";
import type {
  VectorObject,
  MachineConfig,
  GcodeOptions,
  SvgImport,
  SvgPath,
} from "../../../types";
import { JogControls } from "./JogControls";
import { MachineConfigDialog } from "./MachineConfigDialog";
import { GcodeOptionsDialog } from "./GcodeOptionsDialog";
import type { GcodePrefs } from "./GcodeOptionsDialog";
import {
  getAccumulatedTransform,
  applyMatrixToPathD,
  computePathsBounds,
} from "../utils/svgTransform";
import { parseGcode } from "../utils/gcodeParser";
import { importPdf } from "../utils/pdfImport";

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

export function Toolbar() {
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
  const addImport = useCanvasStore((s) => s.addImport);
  const setGcodeToolpath = useCanvasStore((s) => s.setGcodeToolpath);
  const setGcodeSource = useCanvasStore((s) => s.setGcodeSource);
  const selectToolpath = useCanvasStore((s) => s.selectToolpath);
  const upsertTask = useTaskStore((s) => s.upsertTask);
  const registerCancelCallback = useTaskStore((s) => s.registerCancelCallback);
  const unregisterCancelCallback = useTaskStore(
    (s) => s.unregisterCancelCallback,
  );

  // Holds a reference to the active G-code worker so cancellation can reach it.
  const activeWorkerRef = useRef<{ worker: Worker; taskId: string } | null>(
    null,
  );

  const [showJog, setShowJog] = useState(false);
  const [showGcodeDialog, setShowGcodeDialog] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [jogPos, setJogPos] = useState(() => ({
    x: Math.max(0, window.innerWidth - 300),
    y: 60,
  }));
  const jogDragRef = useRef<{
    startX: number;
    startY: number;
    panelX: number;
    panelY: number;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const startJogDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    jogDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panelX: jogPos.x,
      panelY: jogPos.y,
    };
  };
  const onJogPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!jogDragRef.current) return;
    const { startX, startY, panelX, panelY } = jogDragRef.current;
    setJogPos({
      x: panelX + e.clientX - startX,
      y: panelY + e.clientY - startY,
    });
  };
  const onJogPointerUp = () => {
    jogDragRef.current = null;
  };

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
      // Prefer width-based scale; fall back to height, then to 1 (1 unit = 1 mm).
      const initScale =
        physW != null
          ? physW / svgWidth
          : physH != null
            ? physH / svgHeight
            : 1;

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

      const paths: SvgPath[] = els
        .map((el): SvgPath | null => {
          const rawD = shapeToPathD(el);
          if (!rawD) return null;
          // Resolve all ancestor transform attributes and bake them into the
          // path coordinates so the canvas and G-code worker see pre-transformed
          // positions (fixes Inkscape layer/group transforms).
          const matrix = getAccumulatedTransform(el);
          const d = applyMatrixToPathD(rawD, matrix);
          return {
            id: uuid(),
            d,
            svgSource: el.outerHTML,
            visible: true,
            layer:
              (el.closest("[id]:not(svg)") as Element | null)?.id ??
              el.id ??
              undefined,
          };
        })
        .filter((p): p is SvgPath => p !== null);

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

      const imp: SvgImport = {
        id: uuid(),
        name,
        paths: normalizedPaths,
        x: 0,
        y: 0,
        scale: initScale,
        rotation: 0,
        visible: true,
        svgWidth: effW,
        svgHeight: effH,
        viewBoxX: 0,
        viewBoxY: 0,
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

  const handleGenerateGcode = async (prefs: GcodePrefs) => {
    const cfg = activeConfig();
    if (!cfg || imports.length === 0) return;

    setGenerating(true);
    const taskId = uuid();
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
      label: prefs.optimise
        ? "Generating G-code (optimised)"
        : "Generating G-code",
      progress: 0,
      status: "running",
    });

    worker.onmessage = async (e) => {
      const msg = e.data;
      if (msg.type === "progress") {
        upsertTask({
          id: taskId,
          type: "gcode-generate",
          label: prefs.optimise
            ? "Generating G-code (optimised)"
            : "Generating G-code",
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

  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-[#16213e] border-b border-[#0f3460] shrink-0">
      {/* Brand */}
      <span className="text-[#e94560] font-bold tracking-widest uppercase text-sm mr-2">
        terraForge
      </span>

      {/* Machine selector — locked while connected */}
      <select
        className="bg-[#1a1a2e] border border-[#0f3460] rounded px-2 py-1 text-sm text-gray-200 min-w-[180px] disabled:opacity-50 disabled:cursor-not-allowed"
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
          className="px-3 py-1 rounded text-sm bg-[#0f3460] hover:bg-[#e94560] transition-colors"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={handleConnect}
          disabled={!activeConfigId || isConnecting}
          className="px-3 py-1 rounded text-sm bg-[#e94560] hover:bg-[#c73d56] disabled:opacity-40 transition-colors flex items-center gap-1.5"
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

      <div className="h-4 w-px bg-[#0f3460]" />

      {/* Import — SVG / PDF / G-code, detected from extension */}
      <button
        onClick={handleImport}
        className="px-3 py-1 rounded text-sm bg-[#0f3460] hover:bg-[#1a4a8a] transition-colors"
        title="Import an SVG, PDF, or G-code file"
      >
        Import
      </button>

      {/* Generate G-code — opens options dialog */}
      <button
        onClick={() => setShowGcodeDialog(true)}
        disabled={generating || imports.length === 0}
        className="px-3 py-1 rounded text-sm bg-[#e94560] hover:bg-[#c73d56] disabled:opacity-40 transition-colors"
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

      <div className="h-4 w-px bg-[#0f3460]" />

      {/* Home */}
      <button
        onClick={() => window.terraForge.fluidnc.sendCommand("$H")}
        disabled={!connected}
        title="Run homing cycle ($H)"
        className="px-3 py-1 rounded text-sm bg-[#0f3460] hover:bg-[#1a4a8a] disabled:opacity-40 transition-colors"
      >
        Home
      </button>

      {/* Jog toggle */}
      <button
        onClick={() => setShowJog((v) => !v)}
        className={`px-3 py-1 rounded text-sm transition-colors ${showJog ? "bg-[#e94560]" : "bg-[#0f3460] hover:bg-[#1a4a8a]"}`}
      >
        Jog
      </button>

      {showJog && (
        <div
          className="fixed z-50 bg-[#16213e] border border-[#0f3460] rounded-lg shadow-2xl overflow-hidden"
          style={{ left: jogPos.x, top: jogPos.y }}
          onPointerMove={onJogPointerMove}
          onPointerUp={onJogPointerUp}
          onPointerCancel={onJogPointerUp}
        >
          {/* Drag handle */}
          <div
            className="h-2.5 w-full cursor-grab active:cursor-grabbing bg-[#0f3460]/50 hover:bg-[#0f3460] transition-colors"
            title="Drag to move"
            onPointerDown={startJogDrag}
          />
          <div className="p-4">
            <JogControls onClose={() => setShowJog(false)} />
          </div>
        </div>
      )}

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
              ? "bg-gray-600"
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
        <span className="text-xs text-gray-400">
          {!connected ? "Offline" : wsLive ? "Connected" : "Connecting…"}
        </span>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          title="Machine settings"
          className="ml-2 px-2 py-1 rounded text-sm bg-[#0f3460] hover:bg-[#1a4a8a] transition-colors"
        >
          ⚙
        </button>
      </div>

      {showSettings && (
        <MachineConfigDialog onClose={() => setShowSettings(false)} />
      )}
    </header>
  );
}
