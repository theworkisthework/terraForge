import { formatFileSize, isGcodeFile } from "../utils/pathUtils";
import type { RemoteFile } from "../../../../../types";
import {
  ArrowDownToLine,
  ChevronRight,
  Eye,
  FileText,
  Folder,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import { Button } from "../../ui";

/** Why downloading is unavailable, or "Download". */
function downloadTitle(transferRunning: boolean, jobActive: boolean, serialMode: boolean): string {
  if (transferRunning) return "Unavailable while a file transfer is running";
  if (jobActive) return "Unavailable while a job is running";
  if (serialMode) return "File download not available over serial";
  return "Download";
}

/** Clicks on a row's buttons act on the button, not the row. */
const only = (action: () => void) => (e: React.MouseEvent) => {
  e.stopPropagation();
  action();
};

/** A G-code file's job button: pause while it runs, resume while it is
 * held, otherwise run — unless a transfer or another job is in the way. */
function JobButton({
  state,
  onRun,
  blockedBy,
  loading,
}: {
  state: "running" | "held" | "idle";
  onRun: () => void;
  blockedBy: "transfer" | "job" | null;
  loading: boolean;
}) {
  if (state === "running") {
    return (
      <Button
        variant="primary"
        size="xs"
        onClick={only(() => window.terraForge.fluidnc.pauseJob())}
        aria-label="Pause job"
        title="Pause job"
      >
        <Pause size={12} />
      </Button>
    );
  }
  if (state === "held") {
    return (
      <Button
        variant="primary"
        size="xs"
        onClick={only(() => window.terraForge.fluidnc.resumeJob())}
        aria-label="Resume job"
        title="Resume job"
      >
        <Play size={12} />
      </Button>
    );
  }
  return (
    <Button
      variant="primary"
      size="xs"
      onClick={only(onRun)}
      aria-label="Run job now"
      title={
        blockedBy === "transfer"
          ? "Unavailable while a file transfer is running"
          : blockedBy === "job"
            ? "A job is already running"
            : "Run job now"
      }
      disabled={loading || blockedBy !== null}
    >
      <Play size={12} />
    </Button>
  );
}

interface FileRowProps {
  file: RemoteFile;
  isSelectedForJob: boolean;
  anyJobActive: boolean;
  activeJobPath: string | null;
  displayMachineState: string | null | undefined;
  runningFile: string | null;
  previewing: string | null;
  hasRunningTransfer: boolean;
  serialMode: boolean;
  onRowClick: (file: RemoteFile) => void;
  onPreview: (file: RemoteFile) => void;
  onRun: (file: RemoteFile) => void;
  onDownload: (file: RemoteFile) => void;
  onDelete: (file: RemoteFile) => void;
}

export function FileRow({
  file,
  isSelectedForJob,
  anyJobActive,
  activeJobPath,
  displayMachineState,
  runningFile,
  previewing,
  hasRunningTransfer,
  serialMode,
  onRowClick,
  onPreview,
  onRun,
  onDownload,
  onDelete,
}: FileRowProps) {
  const isGcode = isGcodeFile(file.name);
  const isThisRunning =
    activeJobPath === file.path && displayMachineState === "Run";
  const isThisHeld =
    activeJobPath === file.path && displayMachineState === "Hold";
  const isActiveJob = isThisRunning || isThisHeld;
  const isLoadingThis = runningFile === file.path;
  return (
    <div
      key={file.path}
      data-testid={`file-row-${file.name}`}
      className={`flex items-center group px-3 py-1 cursor-pointer border-b border-border-ui/20 transition-colors ${
        isSelectedForJob
          ? "bg-[var(--tf-file-selected)] hover:bg-[var(--tf-file-selected-hover)]"
          : "hover:bg-app"
      }`}
      onClick={() => onRowClick(file)}
    >
      <span className="mr-1.5 text-[11px]">
        {file.isDirectory ? <Folder size={12} /> : <FileText size={12} />}
      </span>
      <span className="flex-1 text-[10px] truncate" title={file.name}>
        {file.name}
      </span>
      {!file.isDirectory && file.size > 0 && (
        <span className="text-[9px] text-content-faint mr-1 shrink-0">
          {formatFileSize(file.size)}
        </span>
      )}

      {file.isDirectory ? (
        <span className="text-content-faint text-[9px] hidden group-hover:block shrink-0">
          <ChevronRight size={10} />
        </span>
      ) : (
        <div
          data-testid={`file-actions-${file.name}`}
          className={`gap-0.5 shrink-0 ${isActiveJob || isLoadingThis ? "flex" : "hidden group-hover:flex"}`}
        >
          {isGcode && (
            <Button
              variant="secondary"
              size="xs"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onPreview(file);
              }}
                aria-label="Preview toolpath"
              title="Preview toolpath"
              disabled={previewing === file.path || anyJobActive}
            >
                {previewing === file.path ? "…" : <Eye size={12} />}
            </Button>
          )}

          {isGcode && (
            <JobButton
              state={isThisRunning ? "running" : isThisHeld ? "held" : "idle"}
              onRun={() => onRun(file)}
              blockedBy={hasRunningTransfer ? "transfer" : anyJobActive ? "job" : null}
              loading={isLoadingThis}
            />
          )}

          <Button
            variant="secondary"
            size="xs"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onDownload(file);
            }}
            aria-label="Download file"
            disabled={serialMode || anyJobActive || hasRunningTransfer}
            title={downloadTitle(hasRunningTransfer, anyJobActive, serialMode)}
          >
                  <ArrowDownToLine size={12} />
          </Button>

          <Button
            variant="danger"
            size="xs"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onDelete(file);
            }}
            aria-label="Delete file"
            disabled={anyJobActive}
            title={
              anyJobActive ? "Unavailable while a job is running" : "Delete"
            }
          >
            <Trash2 size={12} />
          </Button>
        </div>
      )}
    </div>
  );
}
