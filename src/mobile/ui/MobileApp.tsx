import { useState, type ReactNode } from "react";
import { FolderOpen, Move, Plug } from "lucide-react";
import { StatusBar } from "./StatusBar";
import { JobBar } from "./JobBar";
import { MachineScreen } from "./screens/MachineScreen";
import { FilesScreen } from "./screens/FilesScreen";
import { JogScreen } from "./screens/JogScreen";
import { useMachineStore } from "../../renderer/src/store/machineStore";
import { useSessionBootstrap } from "./session";

type Tab = "machine" | "files" | "jog";

const TABS: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: "machine", label: "Machine", icon: <Plug size={22} /> },
  { id: "files", label: "Files", icon: <FolderOpen size={22} /> },
  { id: "jog", label: "Jog", icon: <Move size={22} /> },
];

/**
 * Mobile-first UI: three task screens (connect, run files, jog) around a
 * persistent status header and job bar. Shares only the theme, stores and the
 * window.terraForge API with the desktop app — none of its panels.
 */
export default function MobileApp() {
  useSessionBootstrap();
  const connected = useMachineStore((s) => s.connected);
  const [tab, setTab] = useState<Tab>("machine");

  return (
    <div
      className="flex flex-col bg-app text-content overflow-hidden"
      style={{
        height: "100dvh",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <StatusBar />
      <main className="flex-1 min-h-0 relative">
        <div className={tab === "machine" ? "h-full" : "hidden"}>
          <MachineScreen />
        </div>
        <div className={tab === "files" ? "h-full" : "hidden"}>
          <FilesScreen onGoToMachine={() => setTab("machine")} />
        </div>
        <div className={tab === "jog" ? "h-full" : "hidden"}>
          <JogScreen />
        </div>
      </main>
      <JobBar />
      <nav
        className="flex bg-panel border-t border-border-ui shrink-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 min-h-[56px] text-xs ${
              tab === t.id ? "text-accent" : "text-content-muted"
            }`}
          >
            {t.icon}
            {t.label}
            {t.id === "machine" && !connected && tab !== "machine" && (
              <span className="sr-only">(offline)</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
