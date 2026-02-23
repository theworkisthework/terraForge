import { useMachineStore } from "../store/machineStore";

export function JobControls() {
  const connected = useMachineStore((s) => s.connected);
  const status = useMachineStore((s) => s.status);

  const isRunning = status?.state === "Run";
  const isHeld = status?.state === "Hold";

  const btn = (
    label: string,
    onClick: () => void,
    variant: "primary" | "secondary" | "danger" = "secondary",
    disabled = false,
  ) => (
    <button
      onClick={onClick}
      disabled={disabled || !connected}
      className={`w-full py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40 ${
        variant === "primary"
          ? "bg-[#e94560] hover:bg-[#c73d56] text-white"
          : variant === "danger"
            ? "bg-[#6a2020] hover:bg-[#8a3030] text-red-200"
            : "bg-[#0f3460] hover:bg-[#1a4a8a] text-gray-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full p-3 gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
        Job
      </span>

      {!isRunning &&
        !isHeld &&
        btn(
          "▶ Start job",
          async () => {
            // The user selects the file in the file browser panel; this starts the last run command
            await window.terraForge.fluidnc.sendCommand("$SD/Run");
          },
          "primary",
        )}

      {isRunning &&
        btn(
          "⏸ Pause",
          async () => {
            await window.terraForge.fluidnc.pauseJob();
          },
          "secondary",
        )}

      {isHeld &&
        btn(
          "▶ Resume",
          async () => {
            await window.terraForge.fluidnc.resumeJob();
          },
          "primary",
        )}

      {(isRunning || isHeld) &&
        btn(
          "✕ Abort",
          async () => {
            if (confirm("Abort the current job?")) {
              await window.terraForge.fluidnc.abortJob();
            }
          },
          "danger",
        )}

      <div className="mt-auto">
        {btn("Home", async () => {
          await window.terraForge.fluidnc.sendCommand("$H");
        })}
        {btn("Unlock", async () => {
          await window.terraForge.fluidnc.sendCommand("$X");
        })}
      </div>
    </div>
  );
}
