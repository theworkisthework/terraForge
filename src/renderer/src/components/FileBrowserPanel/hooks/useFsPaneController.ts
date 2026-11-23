import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { useShallow } from "zustand/react/shallow";
import { useMachineStore } from "../../../store/machineStore";
import { useTaskStore } from "../../../store/taskStore";
import { useCanvasStore } from "../../../store/canvasStore";
import { selectFileBrowserPaneCanvasState } from "../../../store/canvasSelectors";
import { parseGcode } from "../../../utils/gcodeParser";
import { useStableMachineState } from "../../../hooks/useStableMachineState";
import { isGcodeFile } from "../utils/pathUtils";
import { describeError } from "../../../utils/unexpectedErrors";
import { isJobInProgress, LISTING_PAUSED_DURING_JOB } from "../../../../../types";
import type { RemoteFile, TaskStatus } from "../../../../../types";

export interface FsPaneControllerProps {
  label: string;
  connected: boolean;
  serialMode: boolean;
  source: "fs" | "sd";
  listFn: (path: string) => Promise<RemoteFile[]>;
  deleteFn: (path: string) => Promise<void>;
  /** Makes a folder at a path. Given only where the filesystem has folders. */
  createFolderFn?: (path: string) => Promise<void>;
  /** Deletes a folder and everything in it. Given only where the filesystem has folders. */
  deleteFolderFn?: (path: string) => Promise<void>;
  uploadFn: (
    localPath: string,
    remotePath: string,
    taskId: string,
    name: string,
  ) => void;
  upsertTask: ReturnType<typeof useTaskStore.getState>["upsertTask"];
}

/** Whether an upload or download is in progress. */
function anyTransferRunning(tasks: Record<string, { type: string; status: string }>): boolean {
  return Object.values(tasks).some(
    (task) => (task.type === "file-upload" || task.type === "file-download") && task.status === "running",
  );
}

export function useFsPaneController({
  label,
  connected,
  serialMode,
  source,
  listFn,
  deleteFn,
  createFolderFn,
  deleteFolderFn,
  uploadFn,
  upsertTask,
}: FsPaneControllerProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [runningFile, setRunningFile] = useState<string | null>(null);
  const [pendingPreviewFile, setPendingPreviewFile] = useState<RemoteFile | null>(null);
  const [pendingRunFile, setPendingRunFile] = useState<RemoteFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RemoteFile | null>(null);

  const { gcodeToolpath, gcodeSource, setGcodeToolpath, setGcodeSource, selectToolpath, setGcodePreviewLoading } =
    useCanvasStore(useShallow(selectFileBrowserPaneCanvasState));

  const selectedJobFile = useMachineStore((s) => s.selectedJobFile);
  const setSelectedJobFile = useMachineStore((s) => s.setSelectedJobFile);
  const status = useMachineStore((s) => s.status);
  const displayMachineState = useStableMachineState(status?.state);
  const { activeJobPath, setActiveJobPath, anyJobActive, isSelectedForJob } = useJobFileState(
    displayMachineState,
    selectedJobFile,
    source,
  );

  const hasRunningTransfer = useMemo(() => anyTransferRunning(tasks), [tasks]);
  const jobInProgress = isJobInProgress(displayMachineState);

  const listing = useFsListing(connected, listFn, hasRunningTransfer, jobInProgress);
  const { files, path, loading, error, listingPaused, navigate, pendingRefreshRef } = listing;

  const { handleDownload, handleUpload } = useFsTransfers({
    hasRunningTransfer,
    label,
    path,
    uploadFn,
    upsertTask,
    pendingRefreshRef,
  });

  const fileSystem = label === "sdcard" ? "sdcard" : "internal";
  const report = (
    id: string,
    type: "gcode-preview" | "job-start",
    label: string,
    progress: number | null,
    status: TaskStatus,
    error?: string,
  ) => upsertTask({ id, type, label, progress, status, ...(error !== undefined ? { error } : {}) });

  /** Fetches a G-code file from the machine and shows it as the toolpath. */
  const showRemoteToolpath = async (file: RemoteFile) => {
    const text = await window.terraForge.fluidnc.fetchFileText(file.path, fileSystem);
    setGcodeToolpath(parseGcode(text));
    setGcodeSource({ path: file.path, name: file.name, source });
    selectToolpath(true);
  };

  const doPreview = useCallback(
    async (file: RemoteFile) => {
      setPendingPreviewFile(null);
      setPreviewing(file.path);
      const previewTaskId = uuid();
      report(previewTaskId, "gcode-preview", `Loading preview for ${file.name}…`, null, "running");
      try {
        await showRemoteToolpath(file);
        setSelectedJobFile({ path: file.path, source, name: file.name });
        report(previewTaskId, "gcode-preview", "Preview loaded", 100, "completed");
      } catch (err) {
        console.error("Preview failed:", err);
        report(previewTaskId, "gcode-preview", "Preview failed", null, "error", String(err));
      } finally {
        setPreviewing(null);
      }
    },
    [label, selectToolpath, setGcodeSource, setGcodeToolpath, setSelectedJobFile, source, upsertTask],
  );

  const handlePreview = useCallback(
    (file: RemoteFile) => {
      if (gcodeToolpath) {
        setPendingPreviewFile(file);
        return;
      }
      void doPreview(file);
    },
    [doPreview, gcodeToolpath],
  );

  const doRun = useCallback(
    async (file: RemoteFile) => {
      setPendingRunFile(null);
      const jobTaskId = uuid();
      report(jobTaskId, "job-start", `Starting ${file.name}…`, null, "running");

      // Show the job's toolpath first, unless it is already showing.
      if (gcodeSource?.path !== file.path || !gcodeToolpath) {
        setRunningFile(file.path);
        const previewTaskId = uuid();
        report(previewTaskId, "gcode-preview", `Loading preview for ${file.name}…`, null, "running");
        setGcodePreviewLoading(true);
        try {
          await showRemoteToolpath(file);
          report(previewTaskId, "gcode-preview", "Preview loaded", 100, "completed");
        } catch {
          report(previewTaskId, "gcode-preview", "Preview load failed", null, "error");
        } finally {
          setRunningFile(null);
          setGcodePreviewLoading(false);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      setActiveJobPath(file.path);

      try {
        await window.terraForge.fluidnc.runFile(file.path, source);
        report(jobTaskId, "job-start", `${file.name} started`, 100, "completed");
      } catch (err) {
        setActiveJobPath(null);
        report(jobTaskId, "job-start", `Failed to start ${file.name}`, null, "error", String(err));
      }
    },
    [gcodeSource, gcodeToolpath, label, selectToolpath, setGcodePreviewLoading, setGcodeSource, setGcodeToolpath, source, upsertTask],
  );

  const handleRun = useCallback(
    (file: RemoteFile) => {
      if (hasRunningTransfer) return;
      if (gcodeToolpath && gcodeSource?.path !== file.path) {
        setPendingRunFile(file);
        return;
      }
      void doRun(file);
    },
    [doRun, gcodeSource, gcodeToolpath, hasRunningTransfer],
  );

  const deleteAndFolders = useFsDeleteAndFolders({
    deleteTarget, setDeleteTarget, deleteFn, deleteFolderFn, createFolderFn,
    navigate, path, source, upsertTask, setSelectedJobFile,
  });

  const handleFileClick = useCallback(
    (file: RemoteFile) => {
      if (file.isDirectory) {
        void navigate(file.path);
        return;
      }

      setSelectedJobFile(isSelectedForJob(file) ? null : { path: file.path, source, name: file.name });
      selectToolpath(false);
    },
    [isSelectedForJob, navigate, selectToolpath, setSelectedJobFile, source],
  );

  return {
    files,
    path,
    loading,
    error,
    listingPaused,
    jobInProgress,
    previewing,
    runningFile,
    activeJobPath,
    pendingPreviewFile,
    pendingRunFile,
    deleteTarget,
    gcodeToolpath,
    gcodeSource,
    displayMachineState,
    hasRunningTransfer,
    anyJobActive,
    navigate,
    handleDownload,
    handleUpload,
    handlePreview,
    handleRun,
    ...deleteAndFolders,
    setDeleteTarget,
    canCreateFolders: createFolderFn !== undefined,
    canDeleteFolders: deleteFolderFn !== undefined,
    setPendingPreviewFile,
    setPendingRunFile,
    doPreview,
    doRun,
    isSelectedForJob,
    handleFileClick,
    serialMode,
    connected,
  };
}

/**
 * Deleting the confirmed file or folder, and making a new folder in the
 * current one. Each re-lists the folder when done.
 */
function useFsDeleteAndFolders({
  deleteTarget,
  setDeleteTarget,
  deleteFn,
  deleteFolderFn,
  createFolderFn,
  navigate,
  path,
  source,
  upsertTask,
  setSelectedJobFile,
}: {
  deleteTarget: RemoteFile | null;
  setDeleteTarget: (file: RemoteFile | null) => void;
  deleteFn: FsPaneControllerProps["deleteFn"];
  deleteFolderFn: FsPaneControllerProps["deleteFolderFn"];
  createFolderFn: FsPaneControllerProps["createFolderFn"];
  navigate: (target: string) => Promise<void>;
  path: string;
  source: "fs" | "sd";
  upsertTask: FsPaneControllerProps["upsertTask"];
  setSelectedJobFile: ReturnType<typeof useMachineStore.getState>["setSelectedJobFile"];
}) {
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  /** Deletes the confirmed file or folder, reporting it as a task: a whole
   * folder can take a while, and the machine may refuse. */
  const handleDeleteConfirm = useCallback(async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    const remove = target.isDirectory ? deleteFolderFn : deleteFn;
    if (!remove) return;
    const what = target.isDirectory ? `folder ${target.name}` : target.name;
    const taskId = uuid();
    upsertTask({ id: taskId, type: "file-delete", label: `Deleting ${what}…`, progress: null, status: "running" });
    try {
      await remove(target.path);
      // The job file went with it, if it was this or was inside this.
      const jobFile = useMachineStore.getState().selectedJobFile;
      if (jobFile?.source === source && (jobFile.path === target.path || jobFile.path.startsWith(`${target.path}/`))) {
        setSelectedJobFile(null);
      }
      upsertTask({ id: taskId, type: "file-delete", label: `Deleted ${what}`, progress: 100, status: "completed" });
    } catch (err) {
      upsertTask({
        id: taskId,
        type: "file-delete",
        label: `Could not delete ${what}`,
        progress: null,
        status: "error",
        error: describeError(err),
      });
    }
    await navigate(path);
  }, [deleteFn, deleteFolderFn, deleteTarget, navigate, path, setSelectedJobFile, source, upsertTask]);

  /** Makes `name` in the current folder, then lists it. Rejects, for the
   * dialog to show, when the machine would not. */
  const handleCreateFolder = useCallback(
    async (name: string) => {
      if (!createFolderFn) return;
      await createFolderFn(`${path === "/" ? "" : path}/${name}`);
      setNewFolderOpen(false);
      await navigate(path);
    },
    [createFolderFn, navigate, path],
  );

  return { handleDeleteConfirm, newFolderOpen, setNewFolderOpen, handleCreateFolder };
}

/** Downloading a file from the machine and uploading one to the current
 * folder — one transfer at a time. An upload refreshes the listing once
 * it finishes (FluidNC reports files changed mid-transfer). */
function useFsTransfers({
  hasRunningTransfer,
  label,
  path,
  uploadFn,
  upsertTask,
  pendingRefreshRef,
}: {
  hasRunningTransfer: boolean;
  label: string;
  path: string;
  uploadFn: FsPaneControllerProps["uploadFn"];
  upsertTask: FsPaneControllerProps["upsertTask"];
  pendingRefreshRef: React.MutableRefObject<boolean>;
}) {
  const handleDownload = useCallback(
    async (file: RemoteFile) => {
      if (hasRunningTransfer) return;
      const localPath = isGcodeFile(file.name)
        ? await window.terraForge.fs.saveGcodeDialog(file.name)
        : await window.terraForge.fs.saveFileDialog(file.name);
      if (!localPath) return;
      const taskId = uuid();
      upsertTask({ id: taskId, type: "file-download", label: `Downloading ${file.name}`, progress: 0, status: "running" });
      // Rejects when the download fails or is cancelled; the task toast
      // already says which, so there is nothing more to report here.
      await window.terraForge.fluidnc
        .downloadFile(taskId, file.path, localPath, label === "sdcard" ? "sdcard" : "internal")
        .catch(() => {});
    },
    [hasRunningTransfer, label, upsertTask],
  );

  const handleUpload = useCallback(async () => {
    if (hasRunningTransfer) return;
    const localPath = await window.terraForge.fs.openFileDialog();
    if (!localPath) return;
    const name = localPath.split(/[\\/]/).pop()!;
    const remotePath = (path === "/" ? "" : path) + "/" + name;
    const taskId = uuid();
    pendingRefreshRef.current = true;
    uploadFn(localPath, remotePath, taskId, name);
  }, [hasRunningTransfer, path, uploadFn, pendingRefreshRef]);

  return { handleDownload, handleUpload };
}

/**
 * A folder listing on the machine: the root when connected, cleared when
 * not. It re-lists when FluidNC reports files changed — after any running
 * transfer finishes, so a half-written upload is not listed.
 *
 * Nothing is listed while a job is in progress: FluidNC 4.0.x drops every
 * connection, and the job with it, when asked to list the SD card mid-job
 * (#170). A listing asked for meanwhile — or refused by the main process,
 * which may know of the job first — is held back, the last listing stays
 * shown, and the folder is listed again once the job is over.
 */
function useFsListing(
  connected: boolean,
  listFn: FsPaneControllerProps["listFn"],
  hasRunningTransfer: boolean,
  jobInProgress: boolean,
) {
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [path, setPath] = useState("/");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A listing is waiting for the job to end. */
  const [listingPaused, setListingPaused] = useState(false);
  const pendingRefreshRef = useRef(false);
  // Read through a ref so `navigate` keeps its identity as jobs start and
  // stop — the effect listing the root on connect depends on it.
  const jobInProgressRef = useRef(jobInProgress);
  jobInProgressRef.current = jobInProgress;

  const holdBack = useCallback(() => {
    pendingRefreshRef.current = true;
    setListingPaused(true);
  }, []);

  const navigate = useCallback(
    async (target: string) => {
      if (!connected) return;
      if (jobInProgressRef.current) {
        holdBack();
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const list = await listFn(target);
        setFiles(list);
        setPath(target);
        setListingPaused(false);
      } catch (err) {
        if (String(err).includes(LISTING_PAUSED_DURING_JOB)) holdBack();
        else setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [connected, listFn, holdBack],
  );

  useEffect(() => {
    if (connected) {
      navigate("/");
      return;
    }
    setFiles([]);
    setPath("/");
    setError(null);
    setListingPaused(false);
    pendingRefreshRef.current = false;
  }, [connected, navigate]);

  useEffect(() => {
    if (!connected) return;
    return window.terraForge.fluidnc.onConsoleMessage((msg) => {
      if (!msg.includes("[MSG:Files changed]")) return;
      if (hasRunningTransfer) {
        pendingRefreshRef.current = true;
        return;
      }
      navigate(path);
    });
  }, [connected, hasRunningTransfer, navigate, path]);

  useEffect(() => {
    if (!connected || hasRunningTransfer || jobInProgress || !pendingRefreshRef.current) return;
    pendingRefreshRef.current = false;
    navigate(path);
  }, [connected, hasRunningTransfer, jobInProgress, navigate, path]);

  return { files, path, loading, error, listingPaused, navigate, pendingRefreshRef };
}

/**
 * Which file is the job: while one runs (or is held), the file it started
 * from, remembered once; otherwise the selected job file, if it is on this
 * pane's filesystem.
 */
function useJobFileState(
  displayMachineState: ReturnType<typeof useStableMachineState>,
  selectedJobFile: ReturnType<typeof useMachineStore.getState>["selectedJobFile"],
  source: "fs" | "sd",
) {
  const [activeJobPath, setActiveJobPath] = useState<string | null>(null);
  const selectedJobFileRef = useRef(selectedJobFile);
  selectedJobFileRef.current = selectedJobFile;

  useEffect(() => {
    if (displayMachineState === "Run" || displayMachineState === "Hold") {
      setActiveJobPath((prev) => {
        if (prev !== null) return prev;
        const jobFile = selectedJobFileRef.current;
        return jobFile?.source === source ? jobFile.path : null;
      });
      return;
    }
    setActiveJobPath(null);
  }, [displayMachineState, source]);

  const anyJobActive =
    (displayMachineState === "Run" || displayMachineState === "Hold") &&
    activeJobPath !== null;

  const isSelectedForJob = useCallback(
    (file: RemoteFile) => {
      if (file.isDirectory) return false;
      if (anyJobActive) return activeJobPath === file.path;
      return (
        selectedJobFile?.path === file.path &&
        selectedJobFile?.source === source
      );
    },
    [activeJobPath, anyJobActive, selectedJobFile, source],
  );

  return { activeJobPath, setActiveJobPath, anyJobActive, isSelectedForJob };
}
