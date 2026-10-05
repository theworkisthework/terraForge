import { useMachineStore } from "../../store/machineStore";
import { Button } from "../ui";

interface MachineSelectorProps {
  showJog: boolean;
  onToggleJog: () => void;
  handleConnect: () => void;
  handleDisconnect: () => void;
  isConnecting: boolean;
  /** Phone layout: only the selector + connect button; Home/Jog live elsewhere. */
  compact?: boolean;
}

export function HomeButton() {
  const connected = useMachineStore((s) => s.connected);
  return (
    <Button
      variant="secondary"
      onClick={() => window.terraForge.fluidnc.sendCommand("$H")}
      disabled={!connected}
      title="Run homing cycle ($H)"
    >
      Home
    </Button>
  );
}

export function MachineSelector({
  showJog,
  onToggleJog,
  handleConnect,
  handleDisconnect,
  isConnecting,
  compact = false,
}: MachineSelectorProps) {
  const configs = useMachineStore((s) => s.configs);
  const activeConfigId = useMachineStore((s) => s.activeConfigId);
  const setActiveConfigId = useMachineStore((s) => s.setActiveConfigId);
  const connected = useMachineStore((s) => s.connected);
  const wsLive = useMachineStore((s) => s.wsLive);

  return (
    <>
      {compact && (
        <span
          aria-hidden="true"
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            !connected
              ? "bg-content-faint"
              : wsLive
                ? "bg-green-400"
                : "bg-amber-400 animate-pulse"
          }`}
        />
      )}
      {/* Machine selector — locked while connected */}
      <select
        aria-label="Machine selector"
        className={`text-sm text-content disabled:cursor-not-allowed ${compact ? "min-w-0 flex-1 truncate bg-transparent border-0 px-1 py-1 font-medium" : "bg-app border border-border-ui rounded px-2 py-1 min-w-[180px] disabled:opacity-50"}`}
        value={activeConfigId ?? ""}
        onChange={(e) => setActiveConfigId(e.target.value || null)}
        disabled={connected}
        title={connected ? "Disconnect before switching machine" : undefined}
      >
        <option value="">— Select machine —</option>
        {configs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {/* Connect / disconnect */}
      {connected ? (
        <Button
          variant="secondary"
          onClick={handleDisconnect}
          className="hover:bg-accent"
        >
          Disconnect
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={handleConnect}
          disabled={!activeConfigId || isConnecting}
          loading={isConnecting}
        >
          {isConnecting ? "Connecting…" : "Connect"}
        </Button>
      )}

      {compact ? null : (
        <>
          <div className="h-4 w-px bg-border-ui" />

          {/* Home */}
          <Button
            variant="secondary"
            onClick={() => window.terraForge.fluidnc.sendCommand("$H")}
            disabled={!connected}
            title="Run homing cycle ($H)"
          >
            Home
          </Button>

          {/* Jog toggle */}
          <Button variant="toggle" selected={showJog} onClick={onToggleJog}>
            Jog
          </Button>
        </>
      )}
    </>
  );
}
