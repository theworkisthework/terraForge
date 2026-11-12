import { useMemo, useState } from "react";
import { Toolbar } from "./components/Toolbar";
import { FileBrowserPanel } from "./components/FileBrowserPanel";
import { JobControls, CollapsedJobControls } from "./components/JobControls";
import { PlotCanvas } from "./components/PlotCanvas";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ConsolePanel } from "./components/ConsolePanel";
import { TaskBar } from "./components/TaskBar";
import { JogControls } from "./components/JogControls";
import { useJogPanelPosition } from "./components/JogControls/useJogPanelPosition";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PanelBoundary } from "./components/PanelBoundary";
import { AppCrashScreen } from "./components/AppCrashScreen";
import { useMachineStore } from "./store/machineStore";
import { useResizablePanel } from "./hooks/useResizablePanel";
import { useAppBootstrap } from "./hooks/useAppBootstrap";
import { sendJobControl } from "./features/machine/utils/jobControl";
import { RULER_W } from "./features/canvas";
import type { OriginType } from "../../types";

/**
 * The app, inside the boundary of last resort. Each panel below has a
 * boundary of its own, so that one failing leaves the rest — the job
 * controls above all — working; this one catches whatever gets past those,
 * and shows a way back instead of a blank window.
 */
export default function App() {
  return (
    <ErrorBoundary fallback={(error, reset) => <AppCrashScreen error={error} onRetry={reset} />}>
      <AppShell />
    </ErrorBoundary>
  );
}

/** The file browser folded down to a strip: click to open, with the job controls still at its foot. */
function CollapsedFileBrowser({ onShow, onAbort }: { onShow: () => void; onAbort: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onShow}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onShow();
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
      <PanelBoundary
        name="job controls"
        shape="icon"
        className="h-40 border-t border-border-ui shrink-0 flex flex-col items-end justify-end pr-1.5 pb-2"
      >
        <CollapsedJobControls onAbort={onAbort} />
      </PanelBoundary>
    </div>
  );
}

function AppShell() {
  useAppBootstrap();
  const activeConfigId = useMachineStore((s) => s.activeConfigId);
  const machineConfigs = useMachineStore((s) => s.configs);

  const [showJog, setShowJog] = useState(true);
  const [showFileBrowser, setShowFileBrowser] = useState(true);
  const [showProperties, setShowProperties] = useState(true);
  const [showCollapsedAbortConfirm, setShowCollapsedAbortConfirm] =
    useState(false);
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
  const { jogPos, jogPanelRef, startJogDrag, onJogDragMove, onJogDragEnd } =
    useJogPanelPosition(jogMinRightInset);

  return (
    <div className="flex flex-col h-screen bg-app text-content overflow-hidden">
      {/* Top toolbar */}
      <PanelBoundary name="toolbar" shape="row" className="px-4 py-2 bg-panel border-b border-border-ui shrink-0">
        <Toolbar showJog={showJog} onToggleJog={() => setShowJog((v) => !v)} />
      </PanelBoundary>

      {showCollapsedAbortConfirm && (
        <ConfirmDialog
          title="Abort Job"
          message="Abort the current job? The machine will stop immediately and remaining moves will be cancelled."
          confirmLabel="Abort"
          onConfirm={async () => {
            setShowCollapsedAbortConfirm(false);
            await sendJobControl("abort");
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
                <PanelBoundary name="file browser">
                  <FileBrowserPanel onHide={() => setShowFileBrowser(false)} />
                </PanelBoundary>
              </div>
              <div className="h-40 border-t border-border-ui shrink-0">
                <PanelBoundary name="job controls">
                  <JobControls />
                </PanelBoundary>
              </div>
            </div>
          ) : (
            <CollapsedFileBrowser
              onShow={() => setShowFileBrowser(true)}
              onAbort={() => setShowCollapsedAbortConfirm(true)}
            />
          )}
        </aside>

        {/* Centre column — canvas + bottom console/job row */}
        <div ref={centerRef} className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-visible relative">
            <PanelBoundary name="canvas">
              <PlotCanvas />
            </PanelBoundary>
            {/* Toast stack — absolute within canvas area, clear of side panels */}
            <PanelBoundary
              name="notifications"
              shape="row"
              className="absolute top-4 right-4 z-60 w-[280px] bg-panel border border-accent/50 rounded-lg px-3 py-2 shadow-xl"
            >
              <TaskBar />
            </PanelBoundary>
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
              <PanelBoundary name="console" shape="row" className="h-full px-3">
                <ConsolePanel collapsed={isConsoleCollapsed} />
              </PanelBoundary>
            </div>
          </div>
        </div>

        {/* Right panel — object properties */}
        <aside
          className={`${showProperties ? "w-64" : "w-9"} bg-panel border-l border-border-ui overflow-hidden shrink-0 transition-[width] duration-200 ease-in-out`}
        >
          {showProperties ? (
            <PanelBoundary name="properties panel">
              <PropertiesPanel onHide={() => setShowProperties(false)} />
            </PanelBoundary>
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
            <PanelBoundary name="jog controls" className="w-56">
              <JogControls onClose={() => setShowJog(false)} />
            </PanelBoundary>
          </div>
        </div>
      )}
    </div>
  );
}
