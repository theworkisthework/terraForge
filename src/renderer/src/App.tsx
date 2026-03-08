import { useEffect } from "react";
import { Toolbar } from "./components/Toolbar";
import { FileBrowserPanel } from "./components/FileBrowserPanel";
import { PlotCanvas } from "./components/PlotCanvas";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ConsolePanel } from "./components/ConsolePanel";
import { TaskBar } from "./components/TaskBar";
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
      <Toolbar />

      {/* Main work area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — SD card file browser */}
        <aside className="w-60 bg-[#16213e] border-r border-[#0f3460] overflow-y-auto shrink-0">
          <FileBrowserPanel />
        </aside>

        {/* Centre — plot canvas */}
        <main className="flex-1 overflow-hidden relative">
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
    </div>
  );
}
