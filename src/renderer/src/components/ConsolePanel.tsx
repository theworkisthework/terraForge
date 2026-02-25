import { useRef, useEffect } from "react";
import { useConsoleStore } from "../store/consoleStore";
import { useMachineStore } from "../store/machineStore";
import { JobControls } from "./JobControls";

export function ConsolePanel() {
  const lines = useConsoleStore((s) => s.lines);
  const clear = useConsoleStore((s) => s.clear);
  const status = useMachineStore((s) => s.status);
  const connected = useMachineStore((s) => s.connected);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const isAlarm = status?.state === "Alarm";

  return (
    <div className="flex h-full">
      {/* Console log */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1 border-b border-[#0f3460] shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Console
            </span>
            {status &&
              (isAlarm ? (
                <button
                  onClick={() => window.terraForge.fluidnc.sendCommand("$X")}
                  disabled={!connected}
                  title="Clear alarm ($X)"
                  className="text-xs px-2 py-0.5 rounded bg-red-900 text-red-300 hover:bg-red-700 hover:text-white disabled:opacity-50 transition-colors animate-pulse"
                >
                  ⚠ ALARM — click to unlock
                </button>
              ) : (
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    status.state === "Run"
                      ? "bg-green-900 text-green-300"
                      : "bg-[#0f3460] text-gray-300"
                  }`}
                >
                  {status.state}
                </span>
              ))}
            {status && (
              <span className="text-xs text-gray-500">
                X:{status.wpos.x.toFixed(2)} Y:{status.wpos.y.toFixed(2)} Z:
                {status.wpos.z.toFixed(2)}
              </span>
            )}
          </div>
          <button
            onClick={clear}
            className="text-xs text-gray-600 hover:text-gray-300"
          >
            Clear
          </button>
        </div>
        <div className="flex-1 overflow-y-auto font-mono text-xs p-2 bg-[#0d1117] text-green-400">
          {lines.map((line, i) => (
            <div key={i} className="leading-5 whitespace-pre">
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Job controls sidebar */}
      <div className="w-48 border-l border-[#0f3460] shrink-0">
        <JobControls />
      </div>
    </div>
  );
}
