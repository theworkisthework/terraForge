import { v4 as uuid } from "uuid";
import { useTaskStore } from "../../store/taskStore";
import { useCanvasStore } from "../../store/canvasStore";
import { selectJobControlsCanvasState } from "../../store/canvasSelectors";
import { parseGcode, type GcodeToolpath } from "../../utils/gcodeParser";
import { useShallow } from "zustand/react/shallow";

/**
 * Returns an async callback that starts the selected job.
 *
 * Handles two scenarios:
 * 1. Local file — uploads to SD card first, then runs.
 * 2. SD/internal file — loads toolpath preview if needed, then runs.
 */
export function useJobStartHandler() {
  const upsertTask = useTaskStore((s) => s.upsertTask);
  const {
    gcodeSource,
    gcodeToolpath,
    setGcodeToolpath,
    setGcodeSource,
    selectToolpath,
    setGcodePreviewLoading,
  } = useCanvasStore(useShallow(selectJobControlsCanvasState));

  const startJob = async (effectiveJobFile: {
    path: string;
    source: string;
    name: string;
  }) => {
    const ctx: CanvasCtx = {
      gcodeSource,
      gcodeToolpath,
      setGcodeToolpath,
      setGcodeSource,
      selectToolpath,
      setGcodePreviewLoading,
    };
    if (effectiveJobFile.source === "local") {
      await startLocalFile(effectiveJobFile, ctx, upsertTask);
    } else {
      await startRemoteFile(effectiveJobFile, ctx, upsertTask);
    }
  };

  return startJob;
}

async function startLocalFile(
  file: { name: string; path: string },
  ctx: CanvasCtx,
  upsertTask: ReturnType<typeof useTaskStore.getState>["upsertTask"],
) {
  const { name, path: localPath } = file;
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
    // Load toolpath before running so plot-progress/ETA tracking works from the start.
    // Best-effort: the job still runs without live tracking if this fails.
    if (ctx.gcodeSource?.path !== localPath || !ctx.gcodeToolpath) {
      try {
        const text = await window.terraForge.fs.readFile(localPath);
        const toolpath = parseGcode(text);
        ctx.setGcodeToolpath(toolpath);
        ctx.setGcodeSource({ path: localPath, name, source: "local" });
        ctx.selectToolpath(true);
      } catch {
        // ignore — preview/tracking is best-effort
      }
    }
    await window.terraForge.fluidnc.uploadFile(taskId, localPath, remotePath);
    await window.terraForge.fluidnc.runFile(remotePath, "sd");
    upsertTask({
      id: uuid(),
      type: "job-start",
      label: `${name} started`,
      progress: 100,
      status: "completed",
    });
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
}

interface CanvasCtx {
  gcodeSource: { path: string; name: string; source: string } | null;
  gcodeToolpath: GcodeToolpath | null;
  setGcodeToolpath: (tp: GcodeToolpath | null) => void;
  setGcodeSource: (
    src: { path: string; name: string; source: "local" | "fs" | "sd" } | null,
  ) => void;
  selectToolpath: (selected: boolean) => void;
  setGcodePreviewLoading: (loading: boolean) => void;
}

async function startRemoteFile(
  file: { path: string; name: string; source: string },
  ctx: CanvasCtx,
  upsertTask: ReturnType<typeof useTaskStore.getState>["upsertTask"],
) {
  const jobTaskId = uuid();
  upsertTask({
    id: jobTaskId,
    type: "job-start",
    label: `Starting ${file.name}…`,
    progress: null,
    status: "running",
  });
  try {
    // Load toolpath before running so plot-progress tracing works from the start
    if (ctx.gcodeSource?.path !== file.path || !ctx.gcodeToolpath) {
      const previewTaskId = uuid();
      upsertTask({
        id: previewTaskId,
        type: "gcode-preview",
        label: `Loading preview for ${file.name}…`,
        progress: null,
        status: "running",
      });
      ctx.setGcodePreviewLoading(true);
      try {
        const text = await window.terraForge.fluidnc.fetchFileText(
          file.path,
          file.source === "sd" ? "sdcard" : "internal",
        );
        const toolpath = parseGcode(text);
        ctx.setGcodeToolpath(toolpath);
        ctx.setGcodeSource({
          path: file.path,
          name: file.name,
          source: file.source as "fs" | "sd",
        });
        ctx.selectToolpath(true);
        upsertTask({
          id: previewTaskId,
          type: "gcode-preview",
          label: `Preview loaded`,
          progress: 100,
          status: "completed",
        });
      } catch {
        upsertTask({
          id: previewTaskId,
          type: "gcode-preview",
          label: `Preview load failed`,
          progress: null,
          status: "error",
        });
      } finally {
        ctx.setGcodePreviewLoading(false);
      }
    }
    // Brief pause so the user can read the preview toast before the job begins
    await new Promise((r) => setTimeout(r, 1000));
    await window.terraForge.fluidnc.runFile(
      file.path,
      file.source as "fs" | "sd",
    );
    upsertTask({
      id: jobTaskId,
      type: "job-start",
      label: `${file.name} started`,
      progress: 100,
      status: "completed",
    });
  } catch (err) {
    upsertTask({
      id: jobTaskId,
      type: "job-start",
      label: `Failed to start ${file.name}`,
      progress: null,
      status: "error",
      error: String(err),
    });
  }
}
