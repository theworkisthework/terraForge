import { Button } from "../ui";
import type { MachineStatus } from "../../../../types";

interface ConsoleToolbarProps {
  status: MachineStatus | null;
  connected: boolean;
  isAlarm: boolean;
  displayState: string;
  showMachineCoordinates: boolean;
  resetting: boolean;
  showRestartConfirm: boolean;
  onFirmwareReset: () => void;
  onClear: () => void;
  onAlarmClear: () => void;
}

/**
 * Header bar for the console panel — title, alarm badge, machine state chip,
 * position readout, restart FW button, and clear button.
 */
export function ConsoleToolbar({
  status,
  connected,
  isAlarm,
  displayState,
  showMachineCoordinates,
  resetting,
  showRestartConfirm,
  onFirmwareReset,
  onClear,
  onAlarmClear,
}: ConsoleToolbarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-1 border-b border-border-ui shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-content-muted">
          Console
        </span>
        {status &&
          (isAlarm ? (
            <Button
              onClick={onAlarmClear}
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
            onClick={onFirmwareReset}
            disabled={resetting || showRestartConfirm}
            title="Restart firmware (ESP32 reboot) — use when controller is stuck"
          >
            {resetting ? "Restarting…" : "Restart FW"}
          </Button>
        )}
        <Button variant="ghost" size="xs" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
