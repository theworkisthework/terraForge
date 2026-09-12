import { useEffect, useMemo, useState, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { Pause, Play, X } from "lucide-react";
import { Toolbar } from "./components/Toolbar";
import { FileBrowserPanel } from "./components/FileBrowserPanel";
import { JobControls } from "./components/JobControls";
import { PlotCanvas } from "./components/PlotCanvas";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ConsolePanel } from "./components/ConsolePanel";
import { TaskBar } from "./components/TaskBar";
import { JogControls } from "./components/JogControls";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { useJobStartHandler } from "./components/JobControls/useJobStartHandler";
import { useMachineStore } from "./store/machineStore";
import { useBitmapPluginStore } from "./store/bitmapPluginStore";
import { useCanvasStore } from "./store/canvasStore";
import { selectJobControlsCanvasState } from "./store/canvasSelectors";
import { useTaskStore } from "./store/taskStore";
import { useConsoleStore } from "./store/consoleStore";
import { useAppConfigStore } from "./store/appConfigStore";
import { useThemeStore, applyTheme } from "./store/themeStore";
import { useResizablePanel } from "./hooks/useResizablePanel";
import { RULER_W } from "./features/canvas";
import type { OriginType } from "@types/index";

const GCODE_EXTS = [
  ".gcode",
  ".nc",
  ".g",
  ".gc",
  ".gco",
  ".ngc",
  ".ncc",
  ".cnc",
  ".tap",
];

const isGcodeFile = (name: string) =>
  GCODE_EXTS.some((ext) => name.toLowerCase().endsWith(ext));

export default function App() {
  const loadBitmapPlugins = useBitmapPluginStore((s) => s.loadBitmapPlugins);
  const setConfigs = useMachineStore((s) => s.setConfigs);
  const setStatus = useMachineStore((s) => s.setStatus);
  const setWsLive = useMachineStore((s) => s.setWsLive);
  const setFwInfo = useMachineStore((s) => s.setFwInfo);
  const connected = useMachineStore((s) => s.connected);
  const status = useMachineStore((s) => s.status);
  const activeConfigId = useMachineStore((s) => s.activeConfigId);
  const machineConfigs = useMachineStore((s) => s.configs);
  const selectedJobFile = useMachineStore((s) => s.selectedJobFile);
  const { toolpathSelected, gcodeSource, gcodePreviewLoading } = useCanvasStore(
    useShallow(selectJobControlsCanvasState),
  );
  const upsertTask = useTaskStore((s) => s.upsertTask);
  const appendLine = useConsoleStore((s) => s.appendLine);
  const setDebugLoggingEnabled = useAppConfigStore(
    (s) => s.setDebugLoggingEnabled,
  );
  const setShowConsoleTimestamps = useAppConfigStore(
    (s) => s.setShowConsoleTimestamps,
  );
  const theme = useThemeStore((s) => s.theme);

  // Keep <html> class in sync with theme store
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const [showJog, setShowJog] = useState(true);
  const [showFileBrowser, setShowFileBrowser] = useState(true);
  const [showProperties, setShowProperties] = useState(true);
  const [showCollapsedAbortConfirm, setShowCollapsedAbortConfirm] =
    useState(false);
  // null = use CSS default (aligned with right panel + 16px gap); set when user first drags
  const [jogPos, setJogPos] = useState<{ x: number; y: number } | null>(null);
  const {
    height: consoleHeight,
    minHeight: consoleMinHeight,
    containerRef: centerRef,
    handleMouseDown: startConsoleResize,
  } = useResizablePanel({ initialHeight: 160, maxHeightFraction: 2 / 3 });
  // Dragging fully down leaves just the header bar — treated as collapsed.
  // No intermediate snap thresholds: the wrapper always tracks the dragged
  // height exactly and only the log output flexes to fill/lose space.
  const isConsoleCollapsed = consoleHeight <= consoleMinHeight;
  const jogPanelRef = useRef<HTMLDivElement>(null);
  const jogDragRef = useRef<{
    mouseX: number;
    mouseY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const origin = useMemo<OriginType>(() => {
    const active = machineConfigs.find((cfg) => cfg.id === activeConfigId);
    return active?.origin ?? "bottom-left";
  }, [activeConfigId, machineConfigs]);
  const isRightOrigin = origin === "bottom-right" || origin === "top-right";
  const rightPanelWidth = showProperties ? 256 : 36;
  // Keep jog panel offset to the left of the properties edge by 16px,
  // and add ruler width when the ruler is on the right side.
  const jogMinRightInset =
    Math.max(12, rightPanelWidth - 16) + (isRightOrigin ? RULER_W : 0);

  // Keep dragged jog panel clear of the right-side reserved UI area when
  // panel widths or machine origin change (which moves the ruler side).
  useEffect(() => {
    if (!jogPos || !jogPanelRef.current) return;
    const width =
      jogPanelRef.current.offsetWidth ||
      jogPanelRef.current.getBoundingClientRect().width;
    const maxX = Math.max(0, window.innerWidth - width - jogMinRightInset);
    if (jogPos.x > maxX) {
      setJogPos((prev) => (prev ? { ...prev, x: maxX } : prev));
    }
  }, [jogMinRightInset, jogPos]);

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
      x: Math.max(0, Math.min(window.innerWidth - w - jogMinRightInset, newX)),
      y: Math.max(0, Math.min(window.innerHeight - h, newY)),
    });
  };
  const onJogDragEnd = () => {
    jogDragRef.current = null;
  };

  const startJob = useJobStartHandler();

  const effectiveJobFile =
    selectedJobFile ??
    (toolpathSelected && gcodeSource
      ? {
          path: gcodeSource.path,
          source: gcodeSource.source,
          name: gcodeSource.name,
        }
      : null);

  const jobFileValid =
    effectiveJobFile != null && isGcodeFile(effectiveJobFile.name);

  const isJobRunning = status?.state === "Run";
  const isJobHeld = status?.state === "Hold";
  const isJobActive = isJobRunning || isJobHeld;
  const lineNum = status?.lineNum;
  const lineTotal = status?.lineTotal;
  const jobProgress =
    lineNum != null && lineTotal != null && lineTotal > 0
      ? Math.round((lineNum / lineTotal) * 100)
      : null;
  const collapsedPrimaryButtonTone = isJobRunning
    ? "bg-secondary hover:bg-secondary-hover text-content"
    : "bg-accent hover:bg-accent-hover text-white";

  const handleCollapsedPrimaryAction = async (
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    if (isJobRunning) {
      await window.terraForge.fluidnc.pauseJob();
      return;
    }
    if (isJobHeld) {
      await window.terraForge.fluidnc.resumeJob();
      return;
    }
    if (effectiveJobFile && jobFileValid) {
      await startJob(effectiveJobFile);
    }
  };

  const handleCollapsedAbort = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setShowCollapsedAbortConfirm(true);
  };

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  useEffect(() => {
    // Load machine configs
    window.terraForge.config.getMachineConfigs().then(setConfigs);
    void loadBitmapPlugins();
    window.terraForge.config
      .getAppConfig()
      .then((cfg) => {
        setDebugLoggingEnabled(cfg.debugLoggingEnabled);
        setShowConsoleTimestamps(cfg.showConsoleTimestamps);
      })
      .catch(() => {});

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
  }, [
    setConfigs,
    loadBitmapPlugins,
    setStatus,
    setWsLive,
    setFwInfo,
    upsertTask,
    appendLine,
    setDebugLoggingEnabled,
    setShowConsoleTimestamps,
  ]);

  return (
    <div className="flex flex-col h-screen bg-app text-content overflow-hidden">
      {/* Top toolbar */}
      <Toolbar showJog={showJog} onToggleJog={() => setShowJog((v) => !v)} />

      {showCollapsedAbortConfirm && (
        <ConfirmDialog
          title="Abort Job"
          message="Abort the current job? The machine will stop immediately and remaining moves will be cancelled."
          confirmLabel="Abort"
          onConfirm={async () => {
            setShowCollapsedAbortConfirm(false);
            await window.terraForge.fluidnc.abortJob();
          }}
          onCancel={() => setShowCollapsedAbortConfirm(false)}
        />
      )}

      {/* Main work area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — SD card file browser */}
        <aside
          className={`${showFileBrowser ? "w-60 overflow-hidden" : "w-9 overflow-visible"} bg-panel border-r border-border-ui shrink-0 transition-[width] duration-200 ease-in-out`}
        >
          {showFileBrowser ? (
            <div className="h-full flex flex-col">
              <div className="flex-1 min-h-0">
                <FileBrowserPanel onHide={() => setShowFileBrowser(false)} />
              </div>
              <div className="h-40 border-t border-border-ui shrink-0">
                <JobControls />
              </div>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setShowFileBrowser(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setShowFileBrowser(true);
                }
              }}
              aria-label="Show file browser panel"
              title="Show file browser"
              className="h-full w-full flex flex-col items-stretch text-content-muted hover:text-content transition-colors"
            >
              <span className="h-8 w-full flex items-center justify-center hover:bg-secondary border-b border-border-ui">
                <span aria-hidden="true" className="text-xs font-semibold">
                  &gt;
                </span>
              </span>
              <span className="flex-1" />

              {/* Collapsed job zone keeps same visual split as expanded file/job layout */}
              <div className="h-40 border-t border-border-ui shrink-0 flex flex-col items-end justify-end pl-1 pr-1.5 pb-2 gap-1.5">
                {isJobActive && (
                  <div
                    className="relative group"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label="Collapsed job progress"
                      title="Show job progress"
                      className="w-6 h-2 rounded bg-secondary border border-border-ui overflow-hidden"
                    >
                      <span
                        className="block h-full bg-accent transition-all duration-300"
                        style={{ width: `${jobProgress ?? 30}%` }}
                      />
                    </button>

                    <div className="hidden group-hover:block group-focus-within:block absolute left-full ml-2 bottom-0 w-44 rounded border border-border-ui bg-panel shadow-xl p-2 text-[10px] text-content z-20">
                      <div className="font-semibold uppercase tracking-wide text-content-muted mb-1">
                        {isJobHeld ? "Paused" : "Running"}
                      </div>
                      <div className="truncate mb-1" title={effectiveJobFile?.name}>
                        {effectiveJobFile?.name ?? "Current job"}
                      </div>
                      <div className="h-2 rounded bg-secondary overflow-hidden mb-1">
                        <div
                          className="h-full bg-accent transition-all duration-300"
                          style={{ width: `${jobProgress ?? 30}%` }}
                        />
                      </div>
                      <div className="text-content-faint">
                        {lineNum != null && lineTotal != null
                          ? `line ${lineNum.toLocaleString()} / ${lineTotal.toLocaleString()}${jobProgress != null ? ` (${jobProgress}%)` : ""}`
                          : "Progress pending..."}
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  aria-label={
                    isJobRunning
                      ? "Pause job"
                      : isJobHeld
                        ? "Resume job"
                        : "Start job"
                  }
                  title={
                    isJobRunning
                      ? "Pause job"
                      : isJobHeld
                        ? "Resume job"
                        : jobFileValid
                          ? "Start job"
                          : "Select a G-code file to start"
                  }
                  onClick={(e) => void handleCollapsedPrimaryAction(e)}
                  disabled={
                    !connected ||
                    (!isJobActive && (!jobFileValid || gcodePreviewLoading))
                  }
                  className={`h-6 w-6 inline-flex items-center justify-center rounded border border-border-ui ${collapsedPrimaryButtonTone} disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
                >
                  {isJobRunning ? (
                    <Pause className="h-3.5 w-3.5" strokeWidth={2.25} />
                  ) : (
                    <Play className="h-3.5 w-3.5" strokeWidth={2.25} />
                  )}
                </button>
                {isJobActive && (
                  <button
                    type="button"
                    aria-label="Abort job"
                    title="Abort job"
                    onClick={handleCollapsedAbort}
                    disabled={!connected}
                    className="h-6 w-6 inline-flex items-center justify-center rounded border border-border-ui bg-red-800 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* Centre column — canvas + bottom console/job row */}
        <div ref={centerRef} className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-visible relative">
            <PlotCanvas />
            {/* Toast stack — absolute within canvas area, clear of side panels */}
            <TaskBar />
          </main>

          {/* Bottom — console */}
          <div
            className="bg-panel border-t border-border-ui shrink-0 flex flex-col overflow-hidden"
            style={{ height: consoleHeight }}
          >
            <div
              role="separator"
              aria-label="Resize console panel"
              title="Drag to resize console panel"
              onMouseDown={startConsoleResize}
              className="h-2 w-full -mt-1 cursor-row-resize select-none z-10"
            />
            <div className="flex-1 min-h-0 overflow-hidden">
              <ConsolePanel collapsed={isConsoleCollapsed} />
            </div>
          </div>
        </div>

        {/* Right panel — object properties */}
        <aside
          className={`${showProperties ? "w-64" : "w-9"} bg-panel border-l border-border-ui overflow-hidden shrink-0 transition-[width] duration-200 ease-in-out`}
        >
          {showProperties ? (
            <PropertiesPanel onHide={() => setShowProperties(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setShowProperties(true)}
              aria-label="Show properties panel"
              title="Show properties"
              className="h-full w-full flex flex-col items-stretch text-content-muted hover:text-content transition-colors"
            >
              <span className="h-8 w-full flex items-center justify-center hover:bg-secondary border-b border-border-ui">
                <span aria-hidden="true" className="text-xs font-semibold">
                  &lt;
                </span>
              </span>
              <span className="flex-1" />
            </button>
          )}
        </aside>
      </div>

      {/* Jog panel — fixed to viewport, below modals/dialogs */}
      {showJog && (
        <div
          ref={jogPanelRef}
          className="fixed z-30 bg-panel border border-border-ui rounded-lg shadow-2xl overflow-hidden"
          style={
            jogPos
              ? { left: jogPos.x, top: jogPos.y }
              : { right: jogMinRightInset, top: 124 }
          }
          onPointerMove={onJogDragMove}
          onPointerUp={onJogDragEnd}
          onPointerCancel={onJogDragEnd}
        >
          <div
            className="h-2.5 w-full cursor-grab active:cursor-grabbing bg-secondary/50 hover:bg-secondary transition-colors"
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
