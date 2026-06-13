import { useMachineStore } from "../../store/machineStore";
import { Button } from "../ui";

interface MachineSelectorProps {
  showJog: boolean;
  onToggleJog: () => void;
  handleConnect: () => void;
  handleDisconnect: () => void;
  isConnecting: boolean;
}

export function MachineSelector({
  showJog,
  onToggleJog,
  handleConnect,
  handleDisconnect,
  isConnecting,
}: MachineSelectorProps) {
  const configs = useMachineStore((s) => s.configs);
  const activeConfigId = useMachineStore((s) => s.activeConfigId);
  const setActiveConfigId = useMachineStore((s) => s.setActiveConfigId);
  const connected = useMachineStore((s) => s.connected);

  return (
    <>
      {/* Machine selector — locked while connected */}
      <select
        aria-label="Machine selector"
        className="bg-app border border-border-ui rounded px-2 py-1 text-sm text-content min-w-[180px] disabled:opacity-50 disabled:cursor-not-allowed"
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
  );
}
