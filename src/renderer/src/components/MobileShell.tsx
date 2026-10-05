import { useEffect, useState, type ReactNode } from "react";
import { useMachineStore } from "../store/machineStore";
import {
  FolderOpen,
  Layers,
  Scan,
  SlidersHorizontal,
  Terminal,
  X,
} from "lucide-react";
import { Toolbar } from "./Toolbar";
import { FileBrowserPanel } from "./FileBrowserPanel";
import { JobControls } from "./JobControls";
import { PlotCanvas } from "./PlotCanvas";
import { PropertiesPanel } from "./PropertiesPanel";
import { ConsolePanel } from "./ConsolePanel";
import { TaskBar } from "./TaskBar";
import { JogControls } from "./JogControls";
import type { MobileMenuAction } from "../../../types";

type Tab = "canvas" | "files" | "properties" | "console";

const TABS: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: "canvas", label: "Canvas", icon: <Scan size={20} /> },
  { id: "files", label: "Files", icon: <FolderOpen size={20} /> },
  { id: "properties", label: "Layers", icon: <Layers size={20} /> },
  { id: "console", label: "Console", icon: <Terminal size={20} /> },
];

/**
 * Single-pane layout for phones. The desktop's three side panels become tabs
 * in a bottom bar; the canvas is sized to the bed's aspect ratio with job and jog controls in the space below. All the
 * actual panels are the unchanged desktop components.
 */
function useLandscape(): boolean {
  const q = "(orientation: landscape)";
  const [landscape, setLandscape] = useState(
    () => window.matchMedia(q).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(q);
    const onChange = () => setLandscape(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return landscape;
}

export function MobileShell() {
  const landscape = useLandscape();
  const [tab, setTab] = useState<Tab>("canvas");
  const [showMore, setShowMore] = useState(false);
  const [hasImports, setHasImports] = useState(false);
  const bed = useMachineStore((s) => s.activeConfig());
  // Size the canvas to the bed's aspect ratio (plus room for rulers/inset) so
  // a landscape bed on a portrait phone doesn't leave dead space above and
  // below; the freed height goes to the job and jog controls underneath.
  const bedAspect =
    bed && bed.bedWidth > 0 ? bed.bedHeight / bed.bedWidth : 0.7;
  const canvasHeight = `min(62%, calc((100vw - 40px) * ${bedAspect} + 52px))`;

  useEffect(() => window.terraForgeMobile?.onLayoutState(setHasImports), []);

  const trigger = (action: MobileMenuAction) => {
    setShowMore(false);
    window.terraForgeMobile?.triggerMenu(action);
  };

  // Panels stay mounted (hidden) so scroll position, console history and
  // in-flight loads survive tab switches; the canvas must stay mounted so
  // its viewport/fit state isn't lost.
  const pane = (id: Tab, children: ReactNode) => (
    <section
      className={`absolute inset-0 ${tab === id ? "block" : "hidden"} ${id === "canvas" ? "" : "bg-panel overflow-hidden"}`}
      aria-hidden={tab !== id}
    >
      {children}
    </section>
  );

  const navEl = (
    <nav
      className={
        landscape
          ? "flex flex-col items-stretch justify-center bg-panel border-r border-border-ui shrink-0 w-16"
          : "flex items-stretch bg-panel border-t border-border-ui shrink-0"
      }
      style={
        landscape ? undefined : { paddingBottom: "env(safe-area-inset-bottom)" }
      }
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          aria-current={tab === t.id}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[11px] ${tab === t.id ? "text-accent" : "text-content-muted"}`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        aria-label="More"
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[11px] text-content-muted"
      >
        {showMore ? <X size={20} /> : <SlidersHorizontal size={20} />}
        More
      </button>
    </nav>
  );

  return (
    <div
      className="flex flex-col bg-app text-content overflow-hidden"
      style={{
        height: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <Toolbar mobile />

      <div
        className={`flex-1 min-h-0 flex ${landscape ? "flex-row" : "flex-col"}`}
      >
        {landscape && navEl}
        <div className="flex-1 relative min-h-0 min-w-0">
          {pane(
            "canvas",
            <div
              className={`h-full w-full flex ${landscape ? "flex-row" : "flex-col"}`}
            >
              <div
                className={
                  landscape
                    ? "relative flex-1 min-w-0"
                    : "relative w-full shrink-0"
                }
                style={{
                  height: landscape ? undefined : canvasHeight,
                  touchAction: "none",
                }}
              >
                <PlotCanvas />
                <TaskBar />
              </div>
              <div
                className={
                  landscape
                    ? "w-72 shrink-0 overflow-y-auto bg-panel border-l border-border-ui"
                    : "flex-1 min-h-0 overflow-y-auto bg-panel border-t border-border-ui"
                }
              >
                <div className="h-44 border-b border-border-ui">
                  <JobControls />
                </div>
                <div className="p-4">
                  <JogControls />
                </div>
              </div>
            </div>,
          )}
          {pane(
            "files",
            <div className="h-full flex flex-col">
              <div className="flex-1 min-h-0">
                <FileBrowserPanel />
              </div>
              <div className="h-44 border-t border-border-ui shrink-0">
                <JobControls />
              </div>
            </div>,
          )}
          {pane("properties", <PropertiesPanel />)}
          {pane("console", <ConsolePanel />)}

          {showMore && (
            <div
              className="absolute inset-0 z-40 bg-black/40"
              onClick={() => setShowMore(false)}
            >
              <div
                className="absolute right-2 bottom-2 w-56 rounded-lg bg-panel border border-border-ui shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {(
                  [
                    ["Import SVG / PDF / G-code…", "import", false],
                    ["Open layout…", "openLayout", false],
                    ["Save layout…", "saveLayout", !hasImports],
                    ["Close layout", "closeLayout", !hasImports],
                    ["About", "about", false],
                  ] as Array<[string, MobileMenuAction, boolean]>
                ).map(([label, action, disabled]) => (
                  <button
                    key={action}
                    type="button"
                    disabled={disabled}
                    onClick={() => trigger(action)}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-secondary disabled:opacity-40 border-b border-border-ui last:border-b-0"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {!landscape && navEl}
      </div>
    </div>
  );
}
