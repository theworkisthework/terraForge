import { useRef, useEffect, useState } from "react";
import { useConsoleStore } from "../store/consoleStore";
import { useMachineStore } from "../store/machineStore";
import { JobControls } from "./JobControls";
import { ConfirmDialog } from "./ConfirmDialog";

export function ConsolePanel() {
  const lines = useConsoleStore((s) => s.lines);
  const clear = useConsoleStore((s) => s.clear);
  const appendLine = useConsoleStore((s) => s.appendLine);
  const status = useMachineStore((s) => s.status);
  const connected = useMachineStore((s) => s.connected);
  const setConnected = useMachineStore((s) => s.setConnected);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [cmd, setCmd] = useState("");
  const [resetting, setResetting] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const isAlarm = status?.state === "Alarm";

  const handleSend = async () => {
    const trimmed = cmd.trim();
    if (!trimmed || !connected) return;
    appendLine(`> ${trimmed}`);
    setCmd("");
    try {
      // Response lines arrive in the console via the data stream automatically
      // (serial: 'data' events; Wi-Fi: WebSocket console messages).
      // We fire-and-forget here; errors are caught and shown explicitly.
      await window.terraForge.fluidnc.sendCommand(trimmed);
    } catch (err) {
      appendLine(`[error] ${String(err)}`);
    }
  };

  const handleFirmwareReset = () => setShowRestartConfirm(true);

  const doFirmwareReset = async () => {
    setShowRestartConfirm(false);
    setResetting(true);
    try {
      appendLine("[terraForge] Sending firmware restart…");
      // [ESP444]RESTART reboots the ESP32 — connection will drop immediately.
      await window.terraForge.fluidnc.sendCommand("[ESP444]RESTART");
    } catch {
      // Expected — the machine reboots and drops the connection mid-request.
    } finally {
      // Mark the app as disconnected immediately; the WS watchdog would
      // eventually detect it but this gives instant feedback.
      await window.terraForge.fluidnc.disconnectWebSocket();
      setConnected(false);
      appendLine("[terraForge] Controller restarting — reconnect when ready.");
      setResetting(false);
    }
  };

  return (
    <div className="flex h-full">
      {showRestartConfirm && (
        <ConfirmDialog
          title="Restart Firmware?"
          message={
            "Restart firmware?\n\nThis reboots the controller (ESP32 restart). The connection will drop and you will need to reconnect."
          }
          confirmLabel="Restart"
          onConfirm={doFirmwareReset}
          onCancel={() => setShowRestartConfirm(false)}
        />
      )}
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
          <div className="flex items-center gap-2">
            {connected && (
              <button
                onClick={handleFirmwareReset}
                disabled={resetting || showRestartConfirm}
                title="Restart firmware (ESP32 reboot) — use when controller is stuck"
                className="text-xs px-2 py-0.5 rounded bg-orange-950 text-orange-400 hover:bg-orange-800 hover:text-white disabled:opacity-50 transition-colors"
              >
                {resetting ? "Restarting…" : "⚠ Restart FW"}
              </button>
            )}
            <button
              onClick={clear}
              className="text-xs text-gray-600 hover:text-gray-300"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto font-mono text-xs p-2 bg-[#0d1117] text-green-400">
          {lines.map((line, i) => (
            <div key={i} className="leading-5 whitespace-pre">
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Command input */}
        <div className="flex items-center border-t border-[#0f3460] px-2 py-1 shrink-0 bg-[#0d1117]">
          <span className="text-green-600 font-mono text-xs mr-2 shrink-0">
            {">"}
          </span>
          <input
            type="text"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            disabled={!connected}
            placeholder={connected ? "Send command…" : "Not connected"}
            className="flex-1 bg-transparent font-mono text-xs text-green-400 placeholder-gray-700 outline-none disabled:opacity-40"
          />
          <button
            onClick={handleSend}
            disabled={!connected || !cmd.trim()}
            className="text-[10px] px-2 py-0.5 rounded bg-[#0f3460] hover:bg-[#1a4a8a] disabled:opacity-40 text-gray-300 shrink-0 ml-1"
          >
            Send
          </button>
        </div>
      </div>

      {/* Job controls sidebar */}
      <div className="w-48 border-l border-[#0f3460] shrink-0">
        <JobControls />
      </div>
    </div>
  );
}
