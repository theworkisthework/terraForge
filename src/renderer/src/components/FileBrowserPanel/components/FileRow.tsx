import { formatFileSize, isGcodeFile } from "../utils/pathUtils";
import type { RemoteFile } from "../../../../../types";
import { Button } from "../../ui";

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
        {file.isDirectory ? "📁" : "📄"}
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
          ›
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
              title="Preview toolpath"
              disabled={previewing === file.path || anyJobActive}
            >
              {previewing === file.path ? "…" : "👁"}
            </Button>
          )}

          {isGcode && isThisRunning ? (
            <Button
              variant="primary"
              size="xs"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                window.terraForge.fluidnc.pauseJob();
              }}
              title="Pause job"
            >
              ⏸
            </Button>
          ) : isGcode && isThisHeld ? (
            <Button
              variant="primary"
              size="xs"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                window.terraForge.fluidnc.resumeJob();
              }}
              title="Resume job"
            >
              ▶
            </Button>
          ) : isGcode ? (
            <Button
              variant="primary"
              size="xs"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onRun(file);
              }}
              title={
                hasRunningTransfer
                  ? "Unavailable while a file transfer is running"
                  : anyJobActive
                    ? "A job is already running"
                    : "Run job now"
              }
              disabled={isLoadingThis || anyJobActive || hasRunningTransfer}
            >
              ▶
            </Button>
          ) : null}

          <Button
            variant="secondary"
            size="xs"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onDownload(file);
            }}
            disabled={serialMode || anyJobActive || hasRunningTransfer}
            title={
              hasRunningTransfer
                ? "Unavailable while a file transfer is running"
                : anyJobActive
                  ? "Unavailable while a job is running"
                  : serialMode
                    ? "File download not available over serial"
                    : "Download"
            }
          >
            ↓
          </Button>

          <Button
            variant="danger"
            size="xs"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onDelete(file);
            }}
            disabled={anyJobActive}
            title={
              anyJobActive ? "Unavailable while a job is running" : "Delete"
            }
          >
            ✕
          </Button>
        </div>
      )}
    </div>
  );
}
