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
  const upsertTask = useTaskStore((s) => s.upsertTask);
  const appendLine = useConsoleStore((s) => s.appendLine);

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  useEffect(() => {
    // Load machine configs
    window.terraForge.config.getMachineConfigs().then(setConfigs);

    // Subscribe to status updates pushed from main process
    const offStatus = window.terraForge.fluidnc.onStatusUpdate(setStatus);
    const offConsole = window.terraForge.fluidnc.onConsoleMessage(appendLine);

    // Subscribe to background task updates
    const offTask = window.terraForge.tasks.onTaskUpdate(upsertTask);

    return () => {
      offStatus();
      offConsole();
      offTask();
    };
  }, [setConfigs, setStatus, upsertTask, appendLine]);

  return (
    <div className="flex flex-col h-screen bg-[#1a1a2e] text-gray-200 overflow-hidden">
      {/* Top toolbar */}
      <Toolbar />

      {/* Active task toasts */}
      <TaskBar />

      {/* Main work area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — SD card file browser */}
        <aside className="w-60 bg-[#16213e] border-r border-[#0f3460] overflow-y-auto shrink-0">
          <FileBrowserPanel />
        </aside>

        {/* Centre — plot canvas */}
        <main className="flex-1 overflow-hidden relative">
          <PlotCanvas />
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
