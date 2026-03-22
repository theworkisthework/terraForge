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

  const [showJog, setShowJog] = useState(false);
  const [jogDelta, setJogDelta] = useState({ dx: 0, dy: 0 });
  const jogDragRef = useRef<{
    mouseX: number;
    mouseY: number;
    startDx: number;
    startDy: number;
  } | null>(null);

  const startJogDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    jogDragRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startDx: jogDelta.dx,
      startDy: jogDelta.dy,
    };
  };
  const onJogDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!jogDragRef.current) return;
    setJogDelta({
      dx: jogDragRef.current.startDx + e.clientX - jogDragRef.current.mouseX,
      dy: jogDragRef.current.startDy + e.clientY - jogDragRef.current.mouseY,
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
          {/* Jog panel — absolute right-4 top-4 matches zoom controls */}
          {showJog && (
            <div
              className="absolute z-50 right-4 top-4 bg-[#16213e] border border-[#0f3460] rounded-lg shadow-2xl overflow-hidden"
              style={{
                transform: `translate(${jogDelta.dx}px, ${jogDelta.dy}px)`,
              }}
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
    </div>
  );
}
