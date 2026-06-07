import { ConfirmDialog } from "../../ConfirmDialog";
import { Breadcrumb } from "./Breadcrumb";
import { FileRow } from "./FileRow";
import { parentPath } from "../utils/pathUtils";
import {
  useFsPaneController,
  type FsPaneControllerProps,
} from "../hooks/useFsPaneController";

interface FsPaneProps extends FsPaneControllerProps {
  accentColor: "blue" | "purple";
  open: boolean;
  onToggle: () => void;
}

export function FsPane({
  label,
  accentColor,
  connected,
  serialMode,
  source,
  listFn,
  deleteFn,
  uploadFn,
  upsertTask,
  open,
  onToggle,
}: FsPaneProps) {
  const {
    files,
    path,
    loading,
    error,
    previewing,
    runningFile,
    activeJobPath,
    pendingPreviewFile,
    pendingRunFile,
    deleteTarget,
    displayMachineState,
    hasRunningTransfer,
    anyJobActive,
    navigate,
    handleDownload,
    handleUpload,
    handlePreview,
    handleRun,
    handleDeleteConfirm,
    setDeleteTarget,
    setPendingPreviewFile,
    setPendingRunFile,
    doPreview,
    doRun,
    isSelectedForJob,
    handleFileClick,
  } = useFsPaneController({
    label,
    connected,
    serialMode,
    source,
    listFn,
    deleteFn,
    uploadFn,
    upsertTask,
  });

  const atRoot = path === "/";
  const bgAccent =
    accentColor === "blue"
      ? "bg-[var(--tf-fs-blue-bg)]"
      : "bg-[var(--tf-fs-purple-bg)]";
  const borderAccent =
    accentColor === "blue"
      ? "border-[var(--tf-fs-blue-border)]"
      : "border-[var(--tf-fs-purple-border)]";
  const labelColor =
    accentColor === "blue"
      ? "text-[var(--tf-fs-blue-text)]"
      : "text-[var(--tf-fs-purple-text)]";
  const btnColor =
    accentColor === "blue"
      ? "text-[var(--tf-fs-blue-text)] hover:text-content"
      : "text-[var(--tf-fs-purple-text)] hover:text-content";

  return (
    <div className={`flex flex-col h-full border-b ${borderAccent}`}>
      {pendingRunFile && (
        <ConfirmDialog
          title="Replace Toolpath & Run?"
          message={`This will replace the current toolpath with "${pendingRunFile.name}" and start the job immediately.`}
          confirmLabel="Run"
          onConfirm={() => void doRun(pendingRunFile)}
          onCancel={() => setPendingRunFile(null)}
        />
      )}

      {pendingPreviewFile && (
        <ConfirmDialog
          title="Replace Toolpath?"
          message={`Replace the current toolpath with a preview of "${pendingPreviewFile.name}"?`}
          confirmLabel="Replace"
          onConfirm={() => void doPreview(pendingPreviewFile)}
          onCancel={() => setPendingPreviewFile(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete File"
          message={`Delete ${deleteTarget.name}?`}
          confirmLabel="Delete"
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div
        className={`flex items-center justify-between px-3 py-1.5 cursor-pointer select-none shrink-0 ${bgAccent}`}
        onClick={onToggle}
      >
        <span
          className={`text-[10px] font-bold uppercase tracking-widest ${labelColor}`}
        >
          {open ? "▾" : "▸"} {label}
        </span>
        {open && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              void navigate(path);
            }}
            disabled={!connected || loading || hasRunningTransfer}
            aria-label="Refresh"
            title={
              hasRunningTransfer
                ? "Refresh disabled during file transfer"
                : "Refresh"
            }
            className={`text-xs disabled:opacity-40 transition-colors ${btnColor}`}
          >
            {loading ? "…" : "↻"}
          </button>
        )}
      </div>

      {!open ? null : (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div
            className={`shrink-0 flex items-center gap-1 px-2 py-1 border-b ${borderAccent}/50 min-h-[24px]`}
          >
            <button
              onClick={() => void navigate(parentPath(path))}
              disabled={atRoot || !connected}
              title="Up"
              className="text-content-muted hover:text-content disabled:opacity-30 mr-0.5 transition-colors leading-none"
            >
              ↑
            </button>
            <Breadcrumb
              path={path}
              navigate={(target) => void navigate(target)}
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {!connected ? (
              <p className="text-[10px] text-content-faint text-center py-4 px-3">
                Not connected.
              </p>
            ) : error && /no sd card/i.test(error) ? (
              <p className="text-[10px] text-content-faint text-center py-4 px-3">
                No SD card.
              </p>
            ) : error ? (
              <p className="text-[10px] text-red-400 text-center py-3 px-3 break-all">
                {error}
              </p>
            ) : files.length === 0 && !loading ? (
              <p className="text-[10px] text-content-faint text-center py-4 px-3">
                Empty.
              </p>
            ) : null}

            {connected && !atRoot && (
              <div
                className="flex items-center px-3 py-1 hover:bg-app cursor-pointer border-b border-border-ui/20 text-content-faint"
                onClick={() => void navigate(parentPath(path))}
              >
                <span className="mr-2 text-[11px]">📁</span>
                <span className="text-[10px]">..</span>
              </div>
            )}

            {files.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                isSelectedForJob={isSelectedForJob(file)}
                anyJobActive={anyJobActive}
                activeJobPath={activeJobPath}
                displayMachineState={displayMachineState}
                runningFile={runningFile}
                previewing={previewing}
                hasRunningTransfer={hasRunningTransfer}
                serialMode={serialMode}
                onRowClick={handleFileClick}
                onPreview={handlePreview}
                onRun={handleRun}
                onDownload={(target) => void handleDownload(target)}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>

          <div className={`shrink-0 px-2 py-1.5 border-t ${borderAccent}/50`}>
            <button
              onClick={() => void handleUpload()}
              disabled={!connected || serialMode || hasRunningTransfer}
              title={
                hasRunningTransfer
                  ? "Unavailable while a file transfer is running"
                  : serialMode
                    ? "File upload not available over serial"
                    : undefined
              }
              className={`w-full text-[10px] py-1 rounded disabled:opacity-40 transition-colors ${
                accentColor === "blue"
                  ? "bg-[var(--tf-fs-blue-border)] hover:bg-[var(--tf-fs-blue-bg)]"
                  : "bg-[var(--tf-fs-purple-border)] hover:bg-[var(--tf-fs-purple-bg)]"
              } text-content`}
            >
              ↑ Upload to {path}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
