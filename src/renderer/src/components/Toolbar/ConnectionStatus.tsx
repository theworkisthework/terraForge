import { useMachineStore } from "../../store/machineStore";

export function ConnectionStatus() {
  const connected = useMachineStore((s) => s.connected);
  const wsLive = useMachineStore((s) => s.wsLive);
  const fwInfo = useMachineStore((s) => s.fwInfo);

  return (
    <div className="flex items-center gap-3">
      {connected && fwInfo && (
        <span
          className="text-xs text-gray-500 font-mono"
          title="Detected firmware version"
        >
          {fwInfo}
        </span>
      )}

      <span
        className={`w-2 h-2 rounded-full transition-colors ${
          !connected
            ? "bg-content-faint"
            : wsLive
              ? "bg-green-400"
              : "bg-amber-400 animate-pulse"
        }`}
        title={
          !connected
            ? "Offline"
            : wsLive
              ? "Connected — WebSocket live"
              : "Connected — waiting for WebSocket"
        }
      />
      <span className="text-xs text-content-muted">
        {!connected ? "Offline" : wsLive ? "Connected" : "Connecting…"}
      </span>
    </div>
  );
}
