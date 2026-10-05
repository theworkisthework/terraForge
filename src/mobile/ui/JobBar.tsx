import { useEffect, useState } from "react";
import { Pause, Play, X } from "lucide-react";
import { Button } from "../../renderer/src/components/ui";
import { useMachineStore } from "../../renderer/src/store/machineStore";
import { sendLogged } from "./commands";
import { useSession } from "./session";
import { useStableMachineState } from "../../renderer/src/hooks/useStableMachineState";

/** Pinned above the tab bar: the selected job, and run controls while plotting. */
export function JobBar() {
  const connected = useMachineStore((s) => s.connected);
  const status = useMachineStore((s) => s.status);
  const file = useMachineStore((s) => s.selectedJobFile);
  const state = useStableMachineState(status?.state);
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const running = state === "Run";
  const held = state === "Hold";
  const active = running || held;

  // Two-step abort: arm, then confirm within 3 s.
  useEffect(() => {
    if (!confirmAbort) return;
    const t = setTimeout(() => setConfirmAbort(false), 3000);
    return () => clearTimeout(t);
  }, [confirmAbort]);

  if (!connected || (!file && !active)) return null;

  const { lineNum, lineTotal } = status ?? {};
  const progress =
    lineNum != null && lineTotal
      ? Math.round((lineNum / lineTotal) * 100)
      : null;
  const remote = file && file.source !== "local" ? file : null;
  const validType =
    !!remote && /\.(gcode|nc|g|gc|gco|ngc|ncc|cnc|tap)$/i.test(remote.name);
  // Same rule as desktop: any valid G-code file when no job is running.
  // FluidNC itself rejects the run if the machine can't start (e.g. Alarm).
  const canStart = validType && !active;
  const hint = active
    ? null
    : !file
      ? null
      : file.source === "local"
        ? "Local files can't be run from here — upload it first."
        : !validType
          ? "Not a G-code file (.gcode, .nc, .g, …)."
          : state === "Alarm"
            ? "Machine is in Alarm — clear it (send $X on the Machine tab) before starting."
            : null;

  const start = async () => {
    if (!remote) return;
    setStarting(true);
    setError(null);
    try {
      await sendLogged(
        remote.source === "sd"
          ? `$SD/Run=${remote.path}`
          : `$LocalFS/Run=${remote.path}`,
      );
      // A 200 reply doesn't prove the job started. Give the controller a
      // moment, then check what state it actually reports.
      await new Promise((r) => setTimeout(r, 2500));
      const after = useMachineStore.getState().status?.state;
      useSession
        .getState()
        .appendLog(
          `(2.5 s later the machine reports: ${after ?? "no status"})`,
        );
      if (after !== "Run" && after !== "Hold" && after !== "Home") {
        setError(
          `The plotter accepted the command but is still "${after ?? "unknown"}", so the job didn't start. See the Machine tab console.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="bg-panel border-t border-border-ui px-4 py-3 shrink-0">
      {active && (
        <div className="h-1.5 rounded bg-secondary overflow-hidden mb-2">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${progress ?? 30}%` }}
          />
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {file?.name ?? "Current job"}
          </div>
          <div className="text-xs text-content-muted">
            {active
              ? `${held ? "Paused" : "Plotting"}${progress != null ? ` · ${progress}%` : ""}`
              : "Ready"}
          </div>
        </div>

        {!active && (
          <Button
            variant="primary"
            size="lg"
            icon={<Play size={16} />}
            disabled={!canStart || starting}
            loading={starting}
            onClick={start}
          >
            Start
          </Button>
        )}
        {running && (
          <Button
            size="lg"
            icon={<Pause size={16} />}
            onClick={() => window.terraForge.fluidnc.pauseJob()}
          >
            Pause
          </Button>
        )}
        {held && (
          <Button
            variant="primary"
            size="lg"
            icon={<Play size={16} />}
            onClick={() => window.terraForge.fluidnc.resumeJob()}
          >
            Resume
          </Button>
        )}
        {active && (
          <Button
            variant="danger"
            size="lg"
            icon={<X size={16} />}
            onClick={() => {
              if (!confirmAbort) return setConfirmAbort(true);
              setConfirmAbort(false);
              window.terraForge.fluidnc.abortJob();
            }}
          >
            {confirmAbort ? "Confirm" : "Abort"}
          </Button>
        )}
      </div>
      {(hint || error) && (
        <p
          className={`mt-2 text-xs ${error ? "text-red-400" : "text-content-muted"}`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
