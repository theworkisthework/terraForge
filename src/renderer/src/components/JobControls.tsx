import { useState } from "react";
import { v4 as uuid } from "uuid";
import { ConfirmDialog } from "./ConfirmDialog";
import { useMachineStore } from "../store/machineStore";
import { useTaskStore } from "../store/taskStore";
import { useCanvasStore } from "../store/canvasStore";
import { parseGcode } from "../utils/gcodeParser";

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
  const toolpathSelected = useCanvasStore((s) => s.toolpathSelected);
  const gcodeSource = useCanvasStore((s) => s.gcodeSource);
  const gcodeToolpath = useCanvasStore((s) => s.gcodeToolpath);
  const setGcodeToolpath = useCanvasStore((s) => s.setGcodeToolpath);
  const setGcodeSource = useCanvasStore((s) => s.setGcodeSource);
  const selectToolpath = useCanvasStore((s) => s.selectToolpath);

  // When the canvas toolpath is selected and has a local file source, use it
  // as the job file even if nothing is explicitly set in the file browser.
  const effectiveJobFile =
    selectedJobFile ??
    (toolpathSelected && gcodeSource
      ? {
          path: gcodeSource.path,
          source: gcodeSource.source,
          name: gcodeSource.name,
        }
      : null);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  const jobFileValid =
    effectiveJobFile != null && isGcodeFile(effectiveJobFile.name);

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
    title?: string,
  ) => (
    <button
      onClick={onClick}
      disabled={disabled || !connected}
      title={title}
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
          title={effectiveJobFile?.path ?? undefined}
        >
          {!effectiveJobFile ? (
            <span className="italic text-gray-500">
              No file selected — pick one in File Browser
            </span>
          ) : jobFileValid ? (
            <span className="text-gray-300">
              {effectiveJobFile.source === "local" ? "🖥" : "📄"}{" "}
              {effectiveJobFile.name}
              {effectiveJobFile.source === "local" && (
                <span className="text-gray-500 ml-1">
                  (local — will upload)
                </span>
              )}
            </span>
          ) : (
            <span className="text-amber-400">
              ⚠ {effectiveJobFile.name} — not a G-code file
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
            if (effectiveJobFile!.source === "local") {
              // Local file: upload to SD card root first, then run
              const { name, path: localPath } = effectiveJobFile!;
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
              // Load the toolpath before running so plot-progress tracing works
              // from the start — especially if the SVG layer was deleted after
              // generation or the file was never explicitly previewed.
              if (
                gcodeSource?.path !== effectiveJobFile!.path ||
                !gcodeToolpath
              ) {
                try {
                  const text = await window.terraForge.fluidnc.fetchFileText(
                    effectiveJobFile!.path,
                    effectiveJobFile!.source === "sd" ? "sdcard" : "internal",
                  );
                  const toolpath = parseGcode(text);
                  setGcodeToolpath(toolpath);
                  setGcodeSource({
                    path: effectiveJobFile!.path,
                    name: effectiveJobFile!.name,
                    source: effectiveJobFile!.source as "fs" | "sd",
                  });
                  selectToolpath(true);
                } catch {
                  // Toolpath load failed — run anyway, just without tracing
                }
              }
              await window.terraForge.fluidnc.runFile(
                effectiveJobFile!.path,
                effectiveJobFile!.source as "fs" | "sd",
              );
            }
          },
          "primary",
          !jobFileValid, // disabled unless a valid G-code file is selected
          jobFileValid
            ? effectiveJobFile!.source === "local"
              ? `Upload ${effectiveJobFile!.name} to SD card then run`
              : `Run ${effectiveJobFile!.name} on the machine`
            : "Select a G-code file in the File Browser first",
        )}

      {/* Pause — only while running */}
      {isRunning &&
        btn(
          "⏸ Pause",
          async () => {
            await window.terraForge.fluidnc.pauseJob();
          },
          "secondary",
          false,
          "Pause the running job (resume with ▶ Resume)",
        )}

      {/* Resume — only while held */}
      {isHeld &&
        btn(
          "▶ Resume",
          async () => {
            await window.terraForge.fluidnc.resumeJob();
          },
          "primary",
          false,
          "Resume the paused job",
        )}

      {/* Abort — while running or held */}
      {isActive &&
        btn(
          "✕ Abort",
          () => setShowAbortConfirm(true),
          "danger",
          false,
          "Immediately stop the job and cancel remaining moves",
        )}

      {showAbortConfirm && (
        <ConfirmDialog
          title="Abort Job"
          message="Abort the current job? The machine will stop immediately and remaining moves will be cancelled."
          confirmLabel="Abort"
          onConfirm={async () => {
            setShowAbortConfirm(false);
            await window.terraForge.fluidnc.abortJob();
          }}
          onCancel={() => setShowAbortConfirm(false)}
        />
      )}

      <div className="mt-auto" />
    </div>
  );
}
