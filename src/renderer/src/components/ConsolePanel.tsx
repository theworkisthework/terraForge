import { useState } from "react";
import { useConsoleStore } from "../store/consoleStore";
import { useMachineStore } from "../store/machineStore";
import { useAppConfigStore } from "../store/appConfigStore";
import { JobControls } from "./JobControls";
import { ConfirmDialog } from "./ConfirmDialog";
import { useStableMachineState } from "../hooks/useStableMachineState";
import { ConsoleToolbar } from "./ConsolePanel/ConsoleToolbar";
import { ConsoleLog } from "./ConsolePanel/ConsoleLog";
import { ConsoleInput } from "./ConsolePanel/ConsoleInput";

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
  const [resetting, setResetting] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const displayState = useStableMachineState(status?.state);

  const isAlarm = displayState === "Alarm";

  const handleSend = async (cmd: string) => {
    appendLine(`> ${cmd}`);
    try {
      await window.terraForge.fluidnc.sendCommand(cmd);
    } catch (err) {
      appendLine(`[error] ${String(err)}`);
    }
  };

  const doFirmwareReset = async () => {
    setShowRestartConfirm(false);
    setResetting(true);
    try {
      appendLine("[terraForge] Sending firmware restart…");
      await window.terraForge.fluidnc.sendCommand("[ESP444]RESTART");
    } catch {
      // Expected — the machine reboots and drops the connection mid-request.
    } finally {
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

      {/* Console log + toolbar + input */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ConsoleToolbar
          status={status}
          connected={connected}
          isAlarm={isAlarm}
          displayState={displayState}
          showMachineCoordinates={showMachineCoordinates}
          resetting={resetting}
          showRestartConfirm={showRestartConfirm}
          onFirmwareReset={() => setShowRestartConfirm(true)}
          onClear={clear}
          onAlarmClear={() => window.terraForge.fluidnc.sendCommand("$X")}
        />

        <ConsoleLog lines={lines} />

        <ConsoleInput connected={connected} onSend={handleSend} />
      </div>

      {/* Job controls sidebar */}
      <div className="w-48 border-l border-border-ui shrink-0">
        <JobControls />
      </div>
    </div>
  );
}
