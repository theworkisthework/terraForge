import { useRef, useEffect, useState } from "react";
import { useConsoleStore } from "../store/consoleStore";
import { useMachineStore } from "../store/machineStore";
import { useAppConfigStore } from "../store/appConfigStore";
import { Button } from "./ui";
import { JobControls } from "./JobControls";
import { ConfirmDialog } from "./ConfirmDialog";
import { useStableMachineState } from "../hooks/useStableMachineState";

export function ConsolePanel() {
  const lines = useConsoleStore((s) => s.lines);
  const clear = useConsoleStore((s) => s.clear);
  const appendLine = useConsoleStore((s) => s.appendLine);
  const status = useMachineStore((s) => s.status);
  const connected = useMachineStore((s) => s.connected);
  const setConnected = useMachineStore((s) => s.setConnected);
  const showMachineCoordinates = useAppConfigStore(
    (s) => s.showMachineCoordinates,
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const [cmd, setCmd] = useState("");
  const [resetting, setResetting] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const displayState = useStableMachineState(status?.state);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const isAlarm = displayState === "Alarm";

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
          message="This reboots the controller (ESP32 restart). The connection will drop and you will need to reconnect."
          confirmLabel="Restart"
          variant="warning"
          onConfirm={doFirmwareReset}
          onCancel={() => setShowRestartConfirm(false)}
        />
      )}
      {/* Console log */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1 border-b border-border-ui shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-content-muted">
              Console
            </span>
            {status &&
              (isAlarm ? (
                <Button
                  onClick={() => window.terraForge.fluidnc.sendCommand("$X")}
                  disabled={!connected}
                  title="Clear alarm ($X)"
                  className="text-xs px-2 py-0.5 rounded bg-red-900 text-red-300 hover:bg-red-700 hover:text-white disabled:opacity-50 animate-pulse"
                >
                  ⚠ ALARM — click to unlock
                </Button>
              ) : (
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    displayState === "Run"
                      ? "bg-green-900 text-green-300"
                      : "bg-secondary text-content-muted"
                  }`}
                >
                  {displayState}
                </span>
              ))}
            {status?.wpos && (
              <span className="text-xs text-content-faint">
                {showMachineCoordinates ? "Local: " : ""}
                X:{status.wpos.x.toFixed(2)} Y:{status.wpos.y.toFixed(2)} Z:
                {status.wpos.z.toFixed(2)}
                {showMachineCoordinates && status?.mpos && (
                  <span>
                    {" "}
                    [Machine: X:{status.mpos.x.toFixed(2)} Y:
                    {status.mpos.y.toFixed(2)} Z:{status.mpos.z.toFixed(2)}]
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {connected && (
              <Button
                variant="secondary"
                size="xs"
                onClick={handleFirmwareReset}
                disabled={resetting || showRestartConfirm}
                title="Restart firmware (ESP32 reboot) — use when controller is stuck"
              >
                {resetting ? "Restarting…" : "Restart FW"}
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={clear}>
              Clear
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto font-mono text-xs p-2 bg-terminal text-green-400">
          {lines.map((line, i) => (
            <div key={i} className="leading-5 whitespace-pre">
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Command input */}
        <div className="flex items-center border-t border-border-ui px-2 py-1 shrink-0 bg-terminal">
          <span className="text-green-600 font-mono text-xs mr-2 shrink-0">
            {">"}
          </span>
          <input
            type="text"
            aria-label="Send G-code command"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            disabled={!connected}
            placeholder={connected ? "Send command…" : "Not connected"}
            className="flex-1 bg-transparent font-mono text-xs text-green-400 placeholder-gray-700 outline-none disabled:opacity-40"
          />
          <Button
            variant="secondary"
            size="xs"
            onClick={handleSend}
            disabled={!connected || !cmd.trim()}
            className="shrink-0 ml-1"
          >
            Send
          </Button>
        </div>
      </div>

      {/* Job controls sidebar */}
      <div className="w-48 border-l border-border-ui shrink-0">
        <JobControls />
      </div>
    </div>
  );
}
