import { useMachineStore } from "../../renderer/src/store/machineStore";
import { useStableMachineState } from "../../renderer/src/hooks/useStableMachineState";

const STATE_TONE: Record<string, string> = {
  Idle: "text-green-400",
  Run: "text-accent",
  Hold: "text-amber-400",
  Alarm: "text-red-400",
};

export function StatusBar() {
  const connected = useMachineStore((s) => s.connected);
  const wsLive = useMachineStore((s) => s.wsLive);
  const status = useMachineStore((s) => s.status);
  const cfg = useMachineStore((s) => s.activeConfig());
  const state = useStableMachineState(status?.state);

  const dot = !connected
    ? "bg-content-faint"
    : wsLive
      ? "bg-green-400"
      : "bg-amber-400 animate-pulse";
  const label = !connected ? "Offline" : (state ?? "Connecting…");

  return (
    <header
      className="bg-panel border-b border-border-ui px-4 py-2 shrink-0"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
        <span className="font-medium truncate">
          {cfg?.name ?? "No machine"}
        </span>
        <span
          className={`ml-auto text-sm font-semibold ${STATE_TONE[label] ?? "text-content-muted"}`}
        >
          {label}
        </span>
      </div>
      {connected && status && (
        <div className="mt-1 flex gap-4 font-mono text-xs text-content-muted">
          <span>X {status.wpos.x.toFixed(2)}</span>
          <span>Y {status.wpos.y.toFixed(2)}</span>
          <span>Z {status.wpos.z.toFixed(2)}</span>
        </div>
      )}
    </header>
  );
}
