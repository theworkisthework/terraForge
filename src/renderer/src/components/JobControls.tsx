import { v4 as uuid } from "uuid";
import { useMachineStore } from "../store/machineStore";
import { useTaskStore } from "../store/taskStore";

const GCODE_EXTS = [
  ".gcode",
  ".nc",
  ".g",
  ".gc",
  ".gco",
  ".ngc",
  ".ncc",
  ".cnc",
  ".tap",
];
const isGcodeFile = (name: string) =>
  GCODE_EXTS.some((e) => name.toLowerCase().endsWith(e));

export function JobControls() {
  const connected = useMachineStore((s) => s.connected);
  const status = useMachineStore((s) => s.status);
  const selectedJobFile = useMachineStore((s) => s.selectedJobFile);
  const upsertTask = useTaskStore((s) => s.upsertTask);

  const jobFileValid =
    selectedJobFile != null && isGcodeFile(selectedJobFile.name);

  const isRunning = status?.state === "Run";
  const isHeld = status?.state === "Hold";
  const isActive = isRunning || isHeld;

  const lineNum = status?.lineNum;
  const lineTotal = status?.lineTotal;
  const progress =
    lineNum != null && lineTotal != null && lineTotal > 0
      ? Math.round((lineNum / lineTotal) * 100)
      : null;

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

      {/* Progress bar — visible while active */}
      {isActive && (
        <div className="flex flex-col gap-1 mb-1">
          <div className="w-full h-2 bg-[#0f3460] rounded-full overflow-hidden">
            {progress != null ? (
              <div
                className="h-full bg-[#e94560] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            ) : (
              /* indeterminate stripe when no Ln: data yet */
              <div className="h-full w-1/3 bg-[#e94560] animate-pulse" />
            )}
          </div>
          <div className="flex justify-between text-[9px] text-gray-500">
            <span>{isHeld ? "Paused" : "Running"}</span>
            <span>
              {lineNum != null && lineTotal != null
                ? `line ${lineNum.toLocaleString()} / ${lineTotal.toLocaleString()}${progress != null ? ` (${progress}%)` : ""}`
                : ""}
            </span>
          </div>
        </div>
      )}

      {/* Selected file indicator */}
      {!isActive && (
        <div
          className="text-[9px] truncate px-0.5 -mt-1 mb-0.5"
          title={selectedJobFile?.path ?? undefined}
        >
          {!selectedJobFile ? (
            <span className="italic text-gray-500">
              No file selected — pick one in File Browser
            </span>
          ) : jobFileValid ? (
            <span className="text-gray-300">
              {selectedJobFile.source === "local" ? "🖥" : "📄"}{" "}
              {selectedJobFile.name}
              {selectedJobFile.source === "local" && (
                <span className="text-gray-500 ml-1">
                  (local — will upload)
                </span>
              )}
            </span>
          ) : (
            <span className="text-amber-400">
              ⚠ {selectedJobFile.name} — not a G-code file
            </span>
          )}
        </div>
      )}

      {/* Start — only when idle */}
      {!isActive &&
        btn(
          "▶ Start job",
          async () => {
            if (!jobFileValid) return;
            if (selectedJobFile!.source === "local") {
              // Local file: upload to SD card root first, then run
              const { name, path: localPath } = selectedJobFile!;
              const remotePath = "/" + name;
              const taskId = uuid();
              upsertTask({
                id: taskId,
                type: "file-upload",
                label: `Uploading ${name}…`,
                progress: 0,
                status: "running",
              });
              try {
                await window.terraForge.fluidnc.uploadFile(
                  taskId,
                  localPath,
                  remotePath,
                );
                await window.terraForge.fluidnc.runFile(remotePath, "sd");
              } catch (err) {
                upsertTask({
                  id: taskId,
                  type: "file-upload",
                  label: `Upload failed: ${name}`,
                  progress: null,
                  status: "error",
                  error: String(err),
                });
              }
            } else {
              await window.terraForge.fluidnc.runFile(
                selectedJobFile!.path,
                selectedJobFile!.source as "fs" | "sd",
              );
            }
          },
          "primary",
          !jobFileValid, // disabled unless a valid G-code file is selected
        )}

      {/* Pause — only while running */}
      {isRunning &&
        btn(
          "⏸ Pause",
          async () => {
            await window.terraForge.fluidnc.pauseJob();
          },
          "secondary",
        )}

      {/* Resume — only while held */}
      {isHeld &&
        btn(
          "▶ Resume",
          async () => {
            await window.terraForge.fluidnc.resumeJob();
          },
          "primary",
        )}

      {/* Abort — while running or held */}
      {isActive &&
        btn(
          "✕ Abort",
          async () => {
            if (confirm("Abort the current job?")) {
              await window.terraForge.fluidnc.abortJob();
            }
          },
          "danger",
        )}

      <div className="mt-auto" />
    </div>
  );
}
