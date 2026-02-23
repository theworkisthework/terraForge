import { useState } from "react";
import { v4 as uuid } from "uuid";
import { useMachineStore } from "../store/machineStore";
import { useCanvasStore } from "../store/canvasStore";
import { useTaskStore } from "../store/taskStore";
import type {
  VectorObject,
  MachineConfig,
  GcodeOptions,
} from "../../../types";
import { JogControls } from "./JogControls";
import { MachineConfigDialog } from "./MachineConfigDialog";

// ─── Shape-to-path conversion ──────────────────────────────────────────────────
// Converts SVG basic shapes (rect, circle, ellipse, line, polyline, polygon)
// into a path `d` string so the G-code worker can process them uniformly.

function shapeToPathD(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const g = (attr: string) => parseFloat(el.getAttribute(attr) ?? "0");

  if (tag === "path") return el.getAttribute("d") ?? "";

  if (tag === "rect") {
    const x = g("x"), y = g("y"), w = g("width"), h = g("height");
    const rx = Math.min(g("rx") || g("ry"), w / 2);
    const ry = Math.min(g("ry") || g("rx"), h / 2);
    if (rx === 0 && ry === 0) {
      return `M${x},${y} H${x+w} V${y+h} H${x} Z`;
    }
    // Rounded rect via arcs
    return [
      `M${x+rx},${y}`,
      `H${x+w-rx}`,
      `A${rx},${ry},0,0,1,${x+w},${y+ry}`,
      `V${y+h-ry}`,
      `A${rx},${ry},0,0,1,${x+w-rx},${y+h}`,
      `H${x+rx}`,
      `A${rx},${ry},0,0,1,${x},${y+h-ry}`,
      `V${y+ry}`,
      `A${rx},${ry},0,0,1,${x+rx},${y}`,
      "Z",
    ].join(" ");
  }

  if (tag === "circle") {
    const cx = g("cx"), cy = g("cy"), r = g("r");
    return `M${cx-r},${cy} A${r},${r},0,0,1,${cx+r},${cy} A${r},${r},0,0,1,${cx-r},${cy} Z`;
  }

  if (tag === "ellipse") {
    const cx = g("cx"), cy = g("cy"), rx2 = g("rx"), ry2 = g("ry");
    return `M${cx-rx2},${cy} A${rx2},${ry2},0,0,1,${cx+rx2},${cy} A${rx2},${ry2},0,0,1,${cx-rx2},${cy} Z`;
  }

  if (tag === "line") {
    return `M${g("x1")},${g("y1")} L${g("x2")},${g("y2")}`;
  }

  if (tag === "polyline") {
    const pts = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
    if (pts.length < 2) return "";
    const cmds = [`M${pts[0]},${pts[1]}`];
    for (let i = 2; i < pts.length; i += 2) cmds.push(`L${pts[i]},${pts[i+1]}`);
    return cmds.join(" ");
  }

  if (tag === "polygon") {
    const pts = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
    if (pts.length < 2) return "";
    const cmds = [`M${pts[0]},${pts[1]}`];
    for (let i = 2; i < pts.length; i += 2) cmds.push(`L${pts[i]},${pts[i+1]}`);
    cmds.push("Z");
    return cmds.join(" ");
  }

  return "";
}

function getBBox(el: Element): { x: number; y: number; width: number; height: number } {
  const tag = el.tagName.toLowerCase();
  const g = (attr: string) => parseFloat(el.getAttribute(attr) ?? "0");

  if (tag === "rect")    return { x: g("x"), y: g("y"), width: g("width"), height: g("height") };
  if (tag === "circle")  { const r = g("r"); return { x: g("cx")-r, y: g("cy")-r, width: r*2, height: r*2 }; }
  if (tag === "ellipse") { const rx=g("rx"),ry=g("ry"); return { x:g("cx")-rx, y:g("cy")-ry, width:rx*2, height:ry*2 }; }
  if (tag === "line")    { const x1=g("x1"),y1=g("y1"),x2=g("x2"),y2=g("y2"); return { x:Math.min(x1,x2), y:Math.min(y1,y2), width:Math.abs(x2-x1), height:Math.abs(y2-y1) }; }
  if (tag === "polyline" || tag === "polygon") {
    const pts = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
    const xs = pts.filter((_,i) => i % 2 === 0), ys = pts.filter((_,i) => i % 2 === 1);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    return { x: minX, y: minY, width: Math.max(...xs)-minX, height: Math.max(...ys)-minY };
  }
  // path — use a rough estimate from the d attribute numbers
  const nums = (el.getAttribute("d") ?? "").match(/-?[\d.]+/g)?.map(Number) ?? [];
  const xs = nums.filter((_,i) => i%2===0), ys = nums.filter((_,i) => i%2===1);
  if (!xs.length) return { x:0, y:0, width:100, height:100 };
  const minX=Math.min(...xs), minY=Math.min(...ys);
  return { x:minX, y:minY, width:Math.max(...xs)-minX, height:Math.max(...ys)-minY };
}

export function Toolbar() {
  const configs = useMachineStore((s) => s.configs);
  const activeConfigId = useMachineStore((s) => s.activeConfigId);
  const setActiveConfigId = useMachineStore((s) => s.setActiveConfigId);
  const activeConfig = useMachineStore((s) => s.activeConfig);
  const connected = useMachineStore((s) => s.connected);
  const wsLive = useMachineStore((s) => s.wsLive);
  const setConnected = useMachineStore((s) => s.setConnected);
  const objects = useCanvasStore((s) => s.objects);
  const addObject = useCanvasStore((s) => s.addObject);
  const upsertTask = useTaskStore((s) => s.upsertTask);

  const [showJog, setShowJog] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleConnect = async () => {
    const cfg = activeConfig();
    if (!cfg) return;
    try {
      if (cfg.connection.type === "wifi") {
        await window.terraForge.fluidnc.connectWebSocket(
          cfg.connection.host!,
          cfg.connection.port ?? 80,
        );
      } else {
        await window.terraForge.serial.connect(
          cfg.connection.serialPath!,
          115200,
        );
      }
      setConnected(true);
    } catch (err) {
      console.error("Connection failed", err);
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

  const handleImportSvg = async () => {
    const filePath = await window.terraForge.fs.openSvgDialog();
    if (!filePath) return;

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

      // Extract viewBox to determine original dimensions
      const svgEl = doc.querySelector("svg");
      const vb = svgEl?.getAttribute("viewBox")?.split(" ").map(Number);
      const origW = vb ? vb[2] : +(svgEl?.getAttribute("width") ?? 100);
      const origH = vb ? vb[3] : +(svgEl?.getAttribute("height") ?? 100);

      const paths = Array.from(
        doc.querySelectorAll(
          "path, rect, circle, ellipse, line, polyline, polygon",
        ),
      );

      paths.forEach((el, _i) => {
        const pathD = shapeToPathD(el);
        if (!pathD) return; // skip empty

        const bb = getBBox(el);
        const origW = bb.width || 10;
        const origH = bb.height || 10;

        const obj: VectorObject = {
          id: uuid(),
          svgSource: el.outerHTML,
          path: pathD,
          x: 10,
          y: 10,
          scale: 1,
          rotation: 0,
          visible: true,
          originalWidth: origW,
          originalHeight: origH,
          layer: el.closest("[id]")?.id ?? undefined,
        };
        addObject(obj);
      });

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

  const handleGenerateGcode = async () => {
    const cfg = activeConfig();
    if (!cfg || objects.length === 0) return;

    setGenerating(true);
    const taskId = uuid();
    const options: GcodeOptions = { arcFitting: false, arcTolerance: 0.01 };

    const worker = new Worker(
      new URL("../../../workers/svgWorker.ts", import.meta.url),
      { type: "module" },
    );

    upsertTask({
      id: taskId,
      type: "gcode-generate",
      label: "Generating G-code…",
      progress: 0,
      status: "running",
    });

    worker.onmessage = async (e) => {
      const msg = e.data;
      if (msg.type === "progress") {
        upsertTask({
          id: taskId,
          type: "gcode-generate",
          label: "Generating G-code…",
          progress: msg.percent,
          status: "running",
        });
      } else if (msg.type === "complete") {
        upsertTask({
          id: taskId,
          type: "gcode-generate",
          label: "G-code ready",
          progress: 100,
          status: "completed",
        });
        worker.terminate();
        setGenerating(false);

        const savePath = await window.terraForge.fs.saveGcodeDialog(
          "terraforge-job.gcode",
        );
        if (savePath) {
          await window.terraForge.fs.writeFile(savePath, msg.gcode);
        }
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
        setGenerating(false);
      }
    };

    worker.postMessage({
      type: "generate",
      taskId,
      objects,
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

      {/* Machine selector */}
      <select
        className="bg-[#1a1a2e] border border-[#0f3460] rounded px-2 py-1 text-sm text-gray-200 min-w-[180px]"
        value={activeConfigId ?? ""}
        onChange={(e) => setActiveConfigId(e.target.value || null)}
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
          disabled={!activeConfigId}
          className="px-3 py-1 rounded text-sm bg-[#e94560] hover:bg-[#c73d56] disabled:opacity-40 transition-colors"
        >
          Connect
        </button>
      )}

      <div className="h-4 w-px bg-[#0f3460]" />

      {/* Import SVG */}
      <button
        onClick={handleImportSvg}
        className="px-3 py-1 rounded text-sm bg-[#0f3460] hover:bg-[#1a4a8a] transition-colors"
      >
        Import SVG
      </button>

      {/* Generate G-code */}
      <button
        onClick={handleGenerateGcode}
        disabled={generating || objects.length === 0}
        className="px-3 py-1 rounded text-sm bg-[#e94560] hover:bg-[#c73d56] disabled:opacity-40 transition-colors"
      >
        {generating ? "Generating…" : "Generate G-code"}
      </button>

      <div className="h-4 w-px bg-[#0f3460]" />

      {/* Jog toggle */}
      <button
        onClick={() => setShowJog((v) => !v)}
        className={`px-3 py-1 rounded text-sm transition-colors ${showJog ? "bg-[#e94560]" : "bg-[#0f3460] hover:bg-[#1a4a8a]"}`}
      >
        Jog
      </button>

      {showJog && (
        <div className="absolute top-12 right-4 z-50 bg-[#16213e] border border-[#0f3460] rounded-lg shadow-2xl p-4">
          <JogControls onClose={() => setShowJog(false)} />
        </div>
      )}

      {/* Connection status indicator */}
      <div className="ml-auto flex items-center gap-3">
        <span
          className={`w-2 h-2 rounded-full transition-colors ${
            !connected ? "bg-gray-600" : wsLive ? "bg-green-400" : "bg-amber-400 animate-pulse"
          }`}
          title={!connected ? "Offline" : wsLive ? "Connected — WebSocket live" : "Connected — waiting for WebSocket"}
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

      {showSettings && <MachineConfigDialog onClose={() => setShowSettings(false)} />}
    </header>
  );
}
