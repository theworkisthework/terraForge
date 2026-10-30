import { ConfirmDialog } from "../../ConfirmDialog";
import { Breadcrumb } from "./Breadcrumb";
import { FileRow } from "./FileRow";
import { parentPath } from "../utils/pathUtils";
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Folder,
  RefreshCw,
  Upload,
} from "lucide-react";
import {
  useFsPaneController,
  type FsPaneControllerProps,
} from "../hooks/useFsPaneController";
import type { RemoteFile } from "../../../../../types";

/** Each pane's colours, written out in full so Tailwind finds them. */
const ACCENTS = {
  blue: {
    bgAccent: "bg-[var(--tf-fs-blue-bg)]",
    borderAccent: "border-[var(--tf-fs-blue-border)]",
    labelColor: "text-[var(--tf-fs-blue-text)]",
    btnColor: "text-[var(--tf-fs-blue-text)] hover:text-content",
    uploadBg: "bg-[var(--tf-fs-blue-border)] hover:bg-[var(--tf-fs-blue-bg)]",
  },
  purple: {
    bgAccent: "bg-[var(--tf-fs-purple-bg)]",
    borderAccent: "border-[var(--tf-fs-purple-border)]",
    labelColor: "text-[var(--tf-fs-purple-text)]",
    btnColor: "text-[var(--tf-fs-purple-text)] hover:text-content",
    uploadBg: "bg-[var(--tf-fs-purple-border)] hover:bg-[var(--tf-fs-purple-bg)]",
  },
} as const;

/** The pane's confirmations: replacing the toolpath to run or preview a
 * file, and deleting one. */
function PaneDialogs({
  pendingRunFile,
  pendingPreviewFile,
  deleteTarget,
  onRun,
  onPreview,
  onDelete,
  onCancelRun,
  onCancelPreview,
  onCancelDelete,
}: {
  pendingRunFile: RemoteFile | null;
  pendingPreviewFile: RemoteFile | null;
  deleteTarget: RemoteFile | null;
  onRun: (file: RemoteFile) => void;
  onPreview: (file: RemoteFile) => void;
  onDelete: () => void;
  onCancelRun: () => void;
  onCancelPreview: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <>
      {pendingRunFile && (
        <ConfirmDialog
          title="Replace Toolpath & Run?"
          message={`This will replace the current toolpath with "${pendingRunFile.name}" and start the job immediately.`}
          confirmLabel="Run"
          onConfirm={() => onRun(pendingRunFile)}
          onCancel={onCancelRun}
        />
      )}
      {pendingPreviewFile && (
        <ConfirmDialog
          title="Replace Toolpath?"
          message={`Replace the current toolpath with a preview of "${pendingPreviewFile.name}"?`}
          confirmLabel="Replace"
          onConfirm={() => onPreview(pendingPreviewFile)}
          onCancel={onCancelPreview}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete File"
          message={`Delete ${deleteTarget.name}?`}
          confirmLabel="Delete"
          onConfirm={onDelete}
          onCancel={onCancelDelete}
        />
      )}
    </>
  );
}

/** Why the listing shows nothing: offline, no SD card, an error, or empty. */
function ListingMessage({ connected, error, empty }: { connected: boolean; error: string | null; empty: boolean }) {
  if (!connected) return <p className="text-[10px] text-content-faint text-center py-4 px-3">Not connected.</p>;
  if (error && /no sd card/i.test(error))
    return <p className="text-[10px] text-content-faint text-center py-4 px-3">No SD card.</p>;
  if (error) return <p className="text-[10px] text-red-400 text-center py-3 px-3 break-all">{error}</p>;
  if (empty) return <p className="text-[10px] text-content-faint text-center py-4 px-3">Empty.</p>;
  return null;
}

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
  const { bgAccent, borderAccent, labelColor, btnColor, uploadBg } = ACCENTS[accentColor];

  return (
    <div className={`flex flex-col h-full border-b ${borderAccent}`}>
      <PaneDialogs
        pendingRunFile={pendingRunFile}
        pendingPreviewFile={pendingPreviewFile}
        deleteTarget={deleteTarget}
        onRun={(file) => void doRun(file)}
        onPreview={(file) => void doPreview(file)}
        onDelete={() => void handleDeleteConfirm()}
        onCancelRun={() => setPendingRunFile(null)}
        onCancelPreview={() => setPendingPreviewFile(null)}
        onCancelDelete={() => setDeleteTarget(null)}
      />

      <div
        className={`flex items-center justify-between px-3 py-1.5 cursor-pointer select-none shrink-0 ${bgAccent}`}
        onClick={onToggle}
      >
        <span
          className={`text-[10px] font-bold uppercase tracking-widest ${labelColor}`}
        >
          {open ? (
            <ChevronDown size={10} className="inline-block align-middle" />
          ) : (
            <ChevronRight size={10} className="inline-block align-middle" />
          )}{" "}
          {label}
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
              {loading ? "…" : <RefreshCw size={12} />}
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
              aria-label="Up one level"
              className="text-content-muted hover:text-content disabled:opacity-30 mr-0.5 transition-colors leading-none"
            >
              <ArrowUp size={12} />
            </button>
            <Breadcrumb
              path={path}
              navigate={(target) => void navigate(target)}
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            <ListingMessage connected={connected} error={error} empty={files.length === 0 && !loading} />

            {connected && !atRoot && (
              <div
                className="flex items-center px-3 py-1 hover:bg-app cursor-pointer border-b border-border-ui/20 text-content-faint"
                onClick={() => void navigate(parentPath(path))}
              >
                <span className="mr-2 text-[11px]"><Folder size={12} /></span>
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
              aria-label="Upload file"
              className={`w-full text-[10px] py-1 rounded disabled:opacity-40 transition-colors ${uploadBg} text-content`}
            >
              <Upload size={12} className="inline-block mr-1 align-text-bottom" /> Upload to {path}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
