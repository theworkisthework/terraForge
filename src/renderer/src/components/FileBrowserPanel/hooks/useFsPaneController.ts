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
import type { RemoteFile } from "../../../../../types";

export interface FsPaneControllerProps {
  label: string;
  connected: boolean;
  serialMode: boolean;
  source: "fs" | "sd";
  listFn: (path: string) => Promise<RemoteFile[]>;
  deleteFn: (path: string) => Promise<void>;
  uploadFn: (
    localPath: string,
    remotePath: string,
    taskId: string,
    name: string,
  ) => void;
  upsertTask: ReturnType<typeof useTaskStore>["upsertTask"];
}

export function useFsPaneController({
  label,
  connected,
  serialMode,
  source,
  listFn,
  deleteFn,
  uploadFn,
  upsertTask,
}: FsPaneControllerProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [path, setPath] = useState("/");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [runningFile, setRunningFile] = useState<string | null>(null);
  const [activeJobPath, setActiveJobPath] = useState<string | null>(null);
  const [pendingPreviewFile, setPendingPreviewFile] =
    useState<RemoteFile | null>(null);
  const [pendingRunFile, setPendingRunFile] = useState<RemoteFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RemoteFile | null>(null);
  const pendingRefreshRef = useRef(false);

  const {
    gcodeToolpath,
    gcodeSource,
    setGcodeToolpath,
    setGcodeSource,
    selectToolpath,
    setGcodePreviewLoading,
  } = useCanvasStore(useShallow(selectFileBrowserPaneCanvasState));

  const selectedJobFile = useMachineStore((s) => s.selectedJobFile);
  const setSelectedJobFile = useMachineStore((s) => s.setSelectedJobFile);
  const status = useMachineStore((s) => s.status);
  const displayMachineState = useStableMachineState(status?.state);

  const hasRunningTransfer = useMemo(
    () =>
      Object.values(tasks).some(
        (task) =>
          (task.type === "file-upload" || task.type === "file-download") &&
          task.status === "running",
      ),
    [tasks],
  );

  const navigate = useCallback(
    async (target: string) => {
      if (!connected) return;
      setLoading(true);
      setError(null);
      try {
        const list = await listFn(target);
        setFiles(list);
        setPath(target);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [connected, listFn],
  );

  useEffect(() => {
    if (connected) {
      navigate("/");
      return;
    }
    setFiles([]);
    setPath("/");
    setError(null);
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
    if (!connected || hasRunningTransfer || !pendingRefreshRef.current) return;
    pendingRefreshRef.current = false;
    navigate(path);
  }, [connected, hasRunningTransfer, navigate, path]);

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

  const handleDownload = useCallback(
    async (file: RemoteFile) => {
      if (hasRunningTransfer) return;
      const localPath = isGcodeFile(file.name)
        ? await window.terraForge.fs.saveGcodeDialog(file.name)
        : await window.terraForge.fs.saveFileDialog(file.name);
      if (!localPath) return;

      const taskId = uuid();
      upsertTask({
        id: taskId,
        type: "file-download",
        label: `Downloading ${file.name}`,
        progress: 0,
        status: "running",
      });

      await window.terraForge.fluidnc.downloadFile(
        taskId,
        file.path,
        localPath,
        label === "sdcard" ? "sdcard" : "internal",
      );
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
  }, [hasRunningTransfer, path, uploadFn]);

  const doPreview = useCallback(
    async (file: RemoteFile) => {
      setPendingPreviewFile(null);
      setPreviewing(file.path);
      const previewTaskId = uuid();

      upsertTask({
        id: previewTaskId,
        type: "gcode-preview",
        label: `Loading preview for ${file.name}…`,
        progress: null,
        status: "running",
      });

      try {
        const text = await window.terraForge.fluidnc.fetchFileText(
          file.path,
          label === "sdcard" ? "sdcard" : "internal",
        );
        const toolpath = parseGcode(text);
        setGcodeToolpath(toolpath);
        setGcodeSource({ path: file.path, name: file.name, source });
        selectToolpath(true);
        setSelectedJobFile({ path: file.path, source, name: file.name });

        upsertTask({
          id: previewTaskId,
          type: "gcode-preview",
          label: "Preview loaded",
          progress: 100,
          status: "completed",
        });
      } catch (err) {
        console.error("Preview failed:", err);
        upsertTask({
          id: previewTaskId,
          type: "gcode-preview",
          label: "Preview failed",
          progress: null,
          status: "error",
          error: String(err),
        });
      } finally {
        setPreviewing(null);
      }
    },
    [
      label,
      selectToolpath,
      setGcodeSource,
      setGcodeToolpath,
      setSelectedJobFile,
      source,
      upsertTask,
    ],
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
      upsertTask({
        id: jobTaskId,
        type: "job-start",
        label: `Starting ${file.name}…`,
        progress: null,
        status: "running",
      });

      if (gcodeSource?.path !== file.path || !gcodeToolpath) {
        setRunningFile(file.path);
        const previewTaskId = uuid();
        upsertTask({
          id: previewTaskId,
          type: "gcode-preview",
          label: `Loading preview for ${file.name}…`,
          progress: null,
          status: "running",
        });

        setGcodePreviewLoading(true);
        try {
          const text = await window.terraForge.fluidnc.fetchFileText(
            file.path,
            label === "sdcard" ? "sdcard" : "internal",
          );
          const toolpath = parseGcode(text);
          setGcodeToolpath(toolpath);
          setGcodeSource({ path: file.path, name: file.name, source });
          selectToolpath(true);
          upsertTask({
            id: previewTaskId,
            type: "gcode-preview",
            label: "Preview loaded",
            progress: 100,
            status: "completed",
          });
        } catch {
          upsertTask({
            id: previewTaskId,
            type: "gcode-preview",
            label: "Preview load failed",
            progress: null,
            status: "error",
          });
        } finally {
          setRunningFile(null);
          setGcodePreviewLoading(false);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      setActiveJobPath(file.path);

      try {
        await window.terraForge.fluidnc.runFile(file.path, source);
        upsertTask({
          id: jobTaskId,
          type: "job-start",
          label: `${file.name} started`,
          progress: 100,
          status: "completed",
        });
      } catch (err) {
        setActiveJobPath(null);
        upsertTask({
          id: jobTaskId,
          type: "job-start",
          label: `Failed to start ${file.name}`,
          progress: null,
          status: "error",
          error: String(err),
        });
      }
    },
    [
      gcodeSource,
      gcodeToolpath,
      label,
      selectToolpath,
      setGcodePreviewLoading,
      setGcodeSource,
      setGcodeToolpath,
      source,
      upsertTask,
    ],
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

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteFn(deleteTarget.path);
    await navigate(path);
    setDeleteTarget(null);
  }, [deleteFn, deleteTarget, navigate, path]);

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

  const handleFileClick = useCallback(
    (file: RemoteFile) => {
      if (file.isDirectory) {
        void navigate(file.path);
        return;
      }

      const selected = isSelectedForJob(file);
      setSelectedJobFile(
        selected ? null : { path: file.path, source, name: file.name },
      );
      selectToolpath(false);
    },
    [isSelectedForJob, navigate, selectToolpath, setSelectedJobFile, source],
  );

  return {
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
    handleDeleteConfirm,
    setDeleteTarget,
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
