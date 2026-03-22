import { useEffect, useState, useRef } from "react";
import { Toolbar } from "./components/Toolbar";
import { FileBrowserPanel } from "./components/FileBrowserPanel";
import { PlotCanvas } from "./components/PlotCanvas";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ConsolePanel } from "./components/ConsolePanel";
import { TaskBar } from "./components/TaskBar";
import { JogControls } from "./components/JogControls";
import { useMachineStore } from "./store/machineStore";
import { useTaskStore } from "./store/taskStore";
import { useConsoleStore } from "./store/consoleStore";

export default function App() {
  const setConfigs = useMachineStore((s) => s.setConfigs);
  const setStatus = useMachineStore((s) => s.setStatus);
  const setWsLive = useMachineStore((s) => s.setWsLive);
  const setFwInfo = useMachineStore((s) => s.setFwInfo);
  const upsertTask = useTaskStore((s) => s.upsertTask);
  const appendLine = useConsoleStore((s) => s.appendLine);

  const [showJog, setShowJog] = useState(true);
  // null = use CSS default (aligned with right panel + 16px gap); set when user first drags
  const [jogPos, setJogPos] = useState<{ x: number; y: number } | null>(null);
  const jogPanelRef = useRef<HTMLDivElement>(null);
  const jogDragRef = useRef<{
    mouseX: number;
    mouseY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const startJogDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    // Resolve current pixel position from either state or the element's bounding rect
    const panel = jogPanelRef.current;
    const rect = panel?.getBoundingClientRect();
    jogDragRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: rect?.left ?? window.innerWidth - 270,
      startY: rect?.top ?? 48,
    };
    // Anchor position state so subsequent moves work correctly
    if (!jogPos && rect) {
      setJogPos({ x: rect.left, y: rect.top });
    }
  };
  const onJogDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!jogDragRef.current || !jogPanelRef.current) return;
    const { offsetWidth: w, offsetHeight: h } = jogPanelRef.current;
    const newX =
      jogDragRef.current.startX + e.clientX - jogDragRef.current.mouseX;
    const newY =
      jogDragRef.current.startY + e.clientY - jogDragRef.current.mouseY;
    setJogPos({
      x: Math.max(0, Math.min(window.innerWidth - w, newX)),
      y: Math.max(0, Math.min(window.innerHeight - h, newY)),
    });
  };
  const onJogDragEnd = () => {
    jogDragRef.current = null;
  };

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  useEffect(() => {
    // Load machine configs
    window.terraForge.config.getMachineConfigs().then(setConfigs);

    // Subscribe to status updates pushed from main process
    const offStatus = window.terraForge.fluidnc.onStatusUpdate(setStatus);
    const offConsole = window.terraForge.fluidnc.onConsoleMessage(appendLine);

    // Serial data — route to console the same way WebSocket messages are
    const offSerialData = window.terraForge.serial.onData(appendLine);

    // Subscribe to background task updates
    const offTask = window.terraForge.tasks.onTaskUpdate(upsertTask);

    // Ping watchdog — if no ping within 15s, mark WS as dead
    let pingTimer: ReturnType<typeof setTimeout> | null = null;
    const resetPingTimer = () => {
      setWsLive(true);
      if (pingTimer) clearTimeout(pingTimer);
      pingTimer = setTimeout(() => setWsLive(false), 15_000);
    };
    const offPing = window.terraForge.fluidnc.onPing(resetPingTimer);
    const offFirmware = window.terraForge.fluidnc.onFirmwareInfo(setFwInfo);

    return () => {
      offStatus();
      offConsole();
      offSerialData();
      offTask();
      offPing();
      offFirmware();
      if (pingTimer) clearTimeout(pingTimer);
    };
  }, [setConfigs, setStatus, setWsLive, setFwInfo, upsertTask, appendLine]);

  return (
    <div className="flex flex-col h-screen bg-[#1a1a2e] text-gray-200 overflow-hidden">
      {/* Top toolbar */}
      <Toolbar showJog={showJog} onToggleJog={() => setShowJog((v) => !v)} />

      {/* Main work area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — SD card file browser */}
        <aside className="w-60 bg-[#16213e] border-r border-[#0f3460] overflow-y-auto shrink-0">
          <FileBrowserPanel />
        </aside>

        {/* Centre — plot canvas */}
        <main className="flex-1 overflow-visible relative">
          <PlotCanvas />
          {/* Toast stack — absolute within canvas area, clear of side panels */}
          <TaskBar />
        </main>

        {/* Right panel — object properties */}
        <aside className="w-64 bg-[#16213e] border-l border-[#0f3460] overflow-y-auto shrink-0">
          <PropertiesPanel />
        </aside>
      </div>

      {/* Bottom — console + job progress */}
      <div className="h-40 bg-[#16213e] border-t border-[#0f3460] shrink-0">
        <ConsolePanel />
      </div>

      {/* Jog panel — fixed to viewport so it floats above all panels */}
      {showJog && (
        <div
          ref={jogPanelRef}
          className="fixed z-[100] bg-[#16213e] border border-[#0f3460] rounded-lg shadow-2xl overflow-hidden"
          style={
            jogPos
              ? { left: jogPos.x, top: jogPos.y }
              : { right: 240, top: 124 }
          }
          onPointerMove={onJogDragMove}
          onPointerUp={onJogDragEnd}
          onPointerCancel={onJogDragEnd}
        >
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
    </div>
  );
}
