import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "../ui";
import type { ButtonVariant } from "../ui";
import { ConfirmDialog } from "../ConfirmDialog";
import { useMachineStore } from "../../store/machineStore";
import { useCanvasStore } from "../../store/canvasStore";
import { selectJobControlsCanvasState } from "../../store/canvasSelectors";
import { useStableMachineState } from "../../hooks/useStableMachineState";
import { useJobStartHandler } from "./useJobStartHandler";
import { JobProgress } from "./JobProgress";
import { JobFileIndicator } from "./JobFileIndicator";

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
  const { gcodeSource, toolpathSelected, gcodePreviewLoading } = useCanvasStore(
    useShallow(selectJobControlsCanvasState),
  );

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
  const displayState = useStableMachineState(status?.state);

  const jobFileValid =
    effectiveJobFile != null && isGcodeFile(effectiveJobFile.name);

  const isRunning = displayState === "Run";
  const isHeld = displayState === "Hold";
  const isActive = isRunning || isHeld;

  const lineNum = status?.lineNum;
  const lineTotal = status?.lineTotal;
  const progress =
    lineNum != null && lineTotal != null && lineTotal > 0
      ? Math.round((lineNum / lineTotal) * 100)
      : null;

  const startJob = useJobStartHandler();

  const btn = (
    label: string,
    onClick: () => void,
    variant: ButtonVariant = "secondary",
    disabled = false,
    title?: string,
  ) => (
    <Button
      variant={variant}
      className="w-full"
      disabled={disabled || !connected}
      title={title}
      onClick={onClick}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-col h-full p-3 gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-content-muted mb-1">
        Job
      </span>

      <JobProgress
        isActive={isActive}
        gcodePreviewLoading={gcodePreviewLoading}
        isHeld={isHeld}
        progress={progress}
        lineNum={lineNum}
        lineTotal={lineTotal}
      />

      <JobFileIndicator
        effectiveJobFile={effectiveJobFile}
        jobFileValid={jobFileValid}
        isActive={isActive}
      />

      {/* Start — only when idle */}
      {!isActive &&
        btn(
          "▶ Start job",
          () => {
            if (effectiveJobFile) startJob(effectiveJobFile);
          },
          "primary",
          !jobFileValid || gcodePreviewLoading,
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
