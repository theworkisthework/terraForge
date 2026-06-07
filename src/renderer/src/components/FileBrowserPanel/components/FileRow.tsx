import { formatFileSize, isGcodeFile } from "../utils/pathUtils";
import type { RemoteFile } from "../../../../../types";

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
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPreview(file);
              }}
              title="Preview toolpath"
              disabled={previewing === file.path || anyJobActive}
              className="text-[9px] px-1 py-0.5 rounded bg-secondary/50 hover:bg-secondary disabled:opacity-50"
            >
              {previewing === file.path ? "…" : "👁"}
            </button>
          )}

          {isGcode && isThisRunning ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.terraForge.fluidnc.pauseJob();
              }}
              title="Pause job"
              className="text-[9px] px-1 py-0.5 rounded bg-accent hover:bg-accent-hover text-white"
            >
              ⏸
            </button>
          ) : isGcode && isThisHeld ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.terraForge.fluidnc.resumeJob();
              }}
              title="Resume job"
              className="text-[9px] px-1 py-0.5 rounded bg-accent hover:bg-accent-hover text-white"
            >
              ▶
            </button>
          ) : isGcode ? (
            <button
              onClick={(e) => {
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
              className="text-[9px] px-1 py-0.5 rounded bg-accent hover:bg-accent-hover disabled:opacity-50 text-white"
            >
              ▶
            </button>
          ) : null}

          <button
            onClick={(e) => {
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
            className="text-[9px] px-1 py-0.5 rounded bg-secondary hover:bg-secondary-hover disabled:opacity-40"
          >
            ↓
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(file);
            }}
            disabled={anyJobActive}
            title={
              anyJobActive ? "Unavailable while a job is running" : "Delete"
            }
            className="text-[9px] px-1 py-0.5 rounded bg-red-900/50 hover:bg-red-700/60 disabled:opacity-40"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
