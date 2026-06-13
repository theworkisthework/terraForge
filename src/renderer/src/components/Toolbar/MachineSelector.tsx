import { useMachineStore } from "../../store/machineStore";

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
        <button
          onClick={handleDisconnect}
          className="px-3 py-1 rounded text-sm bg-secondary hover:bg-accent transition-colors"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={handleConnect}
          disabled={!activeConfigId || isConnecting}
          className="px-3 py-1 rounded text-sm bg-accent hover:bg-accent-hover disabled:opacity-40 transition-colors text-white flex items-center gap-1.5"
        >
          {isConnecting ? (
            <>
              <svg
                className="animate-spin h-3 w-3 shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              Connecting…
            </>
          ) : (
            "Connect"
          )}
        </button>
      )}

      <div className="h-4 w-px bg-border-ui" />

      {/* Home */}
      <button
        onClick={() => window.terraForge.fluidnc.sendCommand("$H")}
        disabled={!connected}
        title="Run homing cycle ($H)"
        className="px-3 py-1 rounded text-sm bg-secondary hover:bg-secondary-hover disabled:opacity-40 transition-colors"
      >
        Home
      </button>

      {/* Jog toggle */}
      <button
        onClick={onToggleJog}
        className={`px-3 py-1 rounded text-sm transition-colors ${showJog ? "bg-accent text-white" : "bg-secondary hover:bg-secondary-hover text-content"}`}
      >
        Jog
      </button>
    </>
  );
}
