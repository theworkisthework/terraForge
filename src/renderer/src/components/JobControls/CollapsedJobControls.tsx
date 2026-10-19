import { useShallow } from "zustand/react/shallow";
import { Pause, Play, X } from "lucide-react";
import { useJobStartHandler } from "./useJobStartHandler";
import { useMachineStore } from "../../store/machineStore";
import { useCanvasStore } from "../../store/canvasStore";
import { selectJobControlsCanvasState } from "../../store/canvasSelectors";

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
  GCODE_EXTS.some((ext) => name.toLowerCase().endsWith(ext));

/** A thin progress bar that shows the job's file and line on hover. */
function JobProgressPeek({
  held,
  fileName,
  lineNum,
  lineTotal,
  progress,
}: {
  held: boolean;
  fileName: string | undefined;
  lineNum: number | undefined;
  lineTotal: number | undefined;
  progress: number | null;
}) {
  return (
    <div
      className="relative group"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Collapsed job progress"
        title="Show job progress"
        className="w-6 h-2 rounded bg-secondary border border-border-ui overflow-hidden"
      >
        <span
          className="block h-full bg-accent transition-all duration-300"
          style={{ width: `${progress ?? 30}%` }}
        />
      </button>

      <div className="hidden group-hover:block group-focus-within:block absolute left-full ml-2 bottom-0 w-44 rounded border border-border-ui bg-panel shadow-xl p-2 text-[10px] text-content z-20">
        <div className="font-semibold uppercase tracking-wide text-content-muted mb-1">
          {held ? "Paused" : "Running"}
        </div>
        <div className="truncate mb-1" title={fileName}>
          {fileName ?? "Current job"}
        </div>
        <div className="h-2 rounded bg-secondary overflow-hidden mb-1">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${progress ?? 30}%` }}
          />
        </div>
        <div className="text-content-faint">
          {lineNum != null && lineTotal != null
            ? `line ${lineNum.toLocaleString()} / ${lineTotal.toLocaleString()}${progress != null ? ` (${progress}%)` : ""}`
            : "Progress pending..."}
        </div>
      </div>
    </div>
  );
}

/** What the start / pause / resume button does now, as its label and tooltip. */
function primaryAction(running: boolean, held: boolean, fileValid: boolean) {
  if (running) return { label: "Pause job", title: "Pause job" };
  if (held) return { label: "Resume job", title: "Resume job" };
  return { label: "Start job", title: fileValid ? "Start job" : "Select a G-code file to start" };
}

/**
 * The job buttons at the foot of the collapsed file browser: start, pause
 * or resume, and (while a job runs) its progress and an abort button.
 * Aborting asks first, through `onAbort`.
 */
export function CollapsedJobControls({ onAbort }: { onAbort: () => void }) {
  const connected = useMachineStore((s) => s.connected);
  const status = useMachineStore((s) => s.status);
  const selectedJobFile = useMachineStore((s) => s.selectedJobFile);
  const { toolpathSelected, gcodeSource, gcodePreviewLoading } = useCanvasStore(
    useShallow(selectJobControlsCanvasState),
  );
  const startJob = useJobStartHandler();

  const effectiveJobFile =
    selectedJobFile ??
    (toolpathSelected && gcodeSource
      ? {
          path: gcodeSource.path,
          source: gcodeSource.source,
          name: gcodeSource.name,
        }
      : null);

  const jobFileValid =
    effectiveJobFile != null && isGcodeFile(effectiveJobFile.name);

  const isJobRunning = status?.state === "Run";
  const isJobHeld = status?.state === "Hold";
  const isJobActive = isJobRunning || isJobHeld;
  const lineNum = status?.lineNum;
  const lineTotal = status?.lineTotal;
  const jobProgress =
    lineNum != null && lineTotal != null && lineTotal > 0
      ? Math.round((lineNum / lineTotal) * 100)
      : null;
  const primaryButtonTone = isJobRunning
    ? "bg-secondary hover:bg-secondary-hover text-content"
    : "bg-accent hover:bg-accent-hover text-white";
  const primary = primaryAction(isJobRunning, isJobHeld, jobFileValid);

  const handlePrimaryAction = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isJobRunning) {
      await window.terraForge.fluidnc.pauseJob();
      return;
    }
    if (isJobHeld) {
      await window.terraForge.fluidnc.resumeJob();
      return;
    }
    if (effectiveJobFile && jobFileValid) {
      await startJob(effectiveJobFile);
    }
  };

  const handleAbort = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onAbort();
  };

  return (
    <div className="h-40 border-t border-border-ui shrink-0 flex flex-col items-end justify-end pl-1 pr-1.5 pb-2 gap-1.5">
      {isJobActive && (
        <JobProgressPeek
          held={isJobHeld}
          fileName={effectiveJobFile?.name}
          lineNum={lineNum}
          lineTotal={lineTotal}
          progress={jobProgress}
        />
      )}

      <button
        type="button"
        aria-label={primary.label}
        title={primary.title}
        onClick={(e) => void handlePrimaryAction(e)}
        disabled={
          !connected ||
          (!isJobActive && (!jobFileValid || gcodePreviewLoading))
        }
        className={`h-6 w-6 inline-flex items-center justify-center rounded border border-border-ui ${primaryButtonTone} disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
      >
        {isJobRunning ? (
          <Pause className="h-3.5 w-3.5" strokeWidth={2.25} />
        ) : (
          <Play className="h-3.5 w-3.5" strokeWidth={2.25} />
        )}
      </button>
      {isJobActive && (
        <button
          type="button"
          aria-label="Abort job"
          title="Abort job"
          onClick={handleAbort}
          disabled={!connected}
          className="h-6 w-6 inline-flex items-center justify-center rounded border border-border-ui bg-red-800 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}
