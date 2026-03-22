import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuid } from "uuid";
import { useMachineStore } from "../store/machineStore";
import { useTaskStore } from "../store/taskStore";
import { useCanvasStore } from "../store/canvasStore";
import { parseGcode } from "../utils/gcodeParser";
import { ConfirmDialog } from "./ConfirmDialog";
import type { RemoteFile } from "../../../types";

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

// ── helpers ────────────────────────────────────────────────────────────────────

function parentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  parts.pop();
  return parts.length === 0 ? "/" : "/" + parts.join("/");
}

function Breadcrumb({
  path,
  navigate,
}: {
  path: string;
  navigate: (p: string) => void;
}) {
  const parts = path.split("/").filter(Boolean);
  return (
    <div className="flex items-center gap-0.5 text-[10px] overflow-x-auto flex-1 min-w-0">
      <button
        onClick={() => navigate("/")}
        className={
          path === "/"
            ? "text-white font-semibold"
            : "text-[#e94560] hover:text-white"
        }
      >
        /
      </button>
      {parts.map((seg, i) => {
        const segPath = "/" + parts.slice(0, i + 1).join("/");
        return (
          <span key={segPath} className="flex items-center gap-0.5 shrink-0">
            <span className="text-gray-600">/</span>
            <button
              onClick={() => navigate(segPath)}
              className={
                segPath === path
                  ? "text-white font-semibold"
                  : "text-[#e94560] hover:text-white"
              }
            >
              {seg}
            </button>
          </span>
        );
      })}
    </div>
  );
}

// ── per-filesystem pane ────────────────────────────────────────────────────────

interface FsPaneProps {
  label: string;
  accentColor: string;
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
  taskType: "file-upload" | "file-download";
  /** Controlled open state — parent owns this */
  open: boolean;
  onToggle: () => void;
}

function FsPane({
  label,
  accentColor,
  connected,
  serialMode,
  source,
  listFn,
  deleteFn,
  uploadFn,
  upsertTask,
  taskType,
  open,
  onToggle,
}: FsPaneProps) {
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [path, setPath] = useState("/");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [pendingPreviewFile, setPendingPreviewFile] =
    useState<RemoteFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RemoteFile | null>(null);
  const gcodeToolpath = useCanvasStore((s) => s.gcodeToolpath);
  const gcodeSource = useCanvasStore((s) => s.gcodeSource);
  const setGcodeToolpath = useCanvasStore((s) => s.setGcodeToolpath);
  const setGcodeSource = useCanvasStore((s) => s.setGcodeSource);
  const selectToolpath = useCanvasStore((s) => s.selectToolpath);
  const selectedJobFile = useMachineStore((s) => s.selectedJobFile);
  const setSelectedJobFile = useMachineStore((s) => s.setSelectedJobFile);

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
    } else {
      setFiles([]);
      setPath("/");
      setError(null);
    }
  }, [connected]);

  const handleDownload = async (file: RemoteFile) => {
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
  };

  const handleUpload = async () => {
    const localPath = await window.terraForge.fs.openFileDialog();
    if (!localPath) return;
    const name = localPath.split(/[\\/]/).pop()!;
    const remotePath = (path === "/" ? "" : path) + "/" + name;
    const taskId = uuid();
    uploadFn(localPath, remotePath, taskId, name);
    setTimeout(() => navigate(path), 1500);
  };

  const doPreview = async (file: RemoteFile) => {
    setPendingPreviewFile(null);
    setPreviewing(file.path);
    try {
      const text = await window.terraForge.fluidnc.fetchFileText(
        file.path,
        label === "sdcard" ? "sdcard" : "internal",
      );
      const toolpath = parseGcode(text);
      setGcodeToolpath(toolpath);
      // Store the source so the canvas toolpath selection can restore it.
      setGcodeSource({ path: file.path, name: file.name, source });
      // Auto-select the toolpath so the canvas, Properties panel, and
      // Job panel are all in sync from the moment of preview.
      selectToolpath(true);
      // Select this file as the queued job so Start Job is enabled immediately
      // and the file is highlighted in the browser.
      setSelectedJobFile({ path: file.path, source, name: file.name });
    } catch (err) {
      console.error("Preview failed:", err);
    } finally {
      setPreviewing(null);
    }
  };

  const handlePreview = (file: RemoteFile) => {
    if (gcodeToolpath) {
      setPendingPreviewFile(file);
      return;
    }
    doPreview(file);
  };

  // Run the file on the machine, loading its toolpath first if not already
  // loaded — so that plot-progress tracing works from the moment it starts.
  const handleRun = async (file: RemoteFile) => {
    if (gcodeSource?.path !== file.path || !gcodeToolpath) {
      try {
        const text = await window.terraForge.fluidnc.fetchFileText(
          file.path,
          label === "sdcard" ? "sdcard" : "internal",
        );
        const toolpath = parseGcode(text);
        setGcodeToolpath(toolpath);
        setGcodeSource({ path: file.path, name: file.name, source });
        selectToolpath(true);
      } catch {
        // Toolpath load failed — run anyway, just without tracing
      }
    }
    window.terraForge.fluidnc.runFile(file.path, source);
  };

  const atRoot = path === "/";
  const bgAccent = accentColor === "blue" ? "bg-[#0a1628]" : "bg-[#1a0d1a]";
  const borderAccent =
    accentColor === "blue" ? "border-[#0f3460]" : "border-[#3d1060]";
  const labelColor =
    accentColor === "blue" ? "text-[#60a0ff]" : "text-[#c084fc]";
  const btnColor =
    accentColor === "blue"
      ? "text-[#60a0ff] hover:text-white"
      : "text-[#c084fc] hover:text-white";

  return (
    <div className={`flex flex-col h-full border-b ${borderAccent}`}>
      {pendingPreviewFile && (
        <ConfirmDialog
          title="Replace Toolpath?"
          message={`Replace the current toolpath with a preview of "${pendingPreviewFile.name}"?`}
          confirmLabel="Replace"
          onConfirm={() => doPreview(pendingPreviewFile)}
          onCancel={() => setPendingPreviewFile(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete File"
          message={`Delete ${deleteTarget.name}?`}
          confirmLabel="Delete"
          onConfirm={() => {
            deleteFn(deleteTarget.path).then(() => navigate(path));
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {/* Section header */}
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
              navigate(path);
            }}
            disabled={!connected || loading}
            title="Refresh"
            className={`text-xs disabled:opacity-40 transition-colors ${btnColor}`}
          >
            {loading ? "…" : "↻"}
          </button>
        )}
      </div>

      {!open ? null : (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Breadcrumb + up */}
          <div
            className={`shrink-0 flex items-center gap-1 px-2 py-1 border-b ${borderAccent}/50 min-h-[24px]`}
          >
            <button
              onClick={() => navigate(parentPath(path))}
              disabled={atRoot || !connected}
              title="Up"
              className="text-gray-400 hover:text-white disabled:opacity-30 mr-0.5 transition-colors leading-none"
            >
              ↑
            </button>
            <Breadcrumb path={path} navigate={navigate} />
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto">
            {!connected ? (
              <p className="text-[10px] text-gray-600 text-center py-4 px-3">
                Not connected.
              </p>
            ) : error && /no sd card/i.test(error) ? (
              <p className="text-[10px] text-gray-500 text-center py-4 px-3">
                No SD card.
              </p>
            ) : error ? (
              <p className="text-[10px] text-red-400 text-center py-3 px-3 break-all">
                {error}
              </p>
            ) : files.length === 0 && !loading ? (
              <p className="text-[10px] text-gray-600 text-center py-4 px-3">
                Empty.
              </p>
            ) : null}

            {/* ".." row */}
            {connected && !atRoot && (
              <div
                className="flex items-center px-3 py-1 hover:bg-[#1a1a2e] cursor-pointer border-b border-[#0f3460]/20 text-gray-500"
                onClick={() => navigate(parentPath(path))}
              >
                <span className="mr-2 text-[11px]">📁</span>
                <span className="text-[10px]">..</span>
              </div>
            )}

            {files.map((file) => {
              const isSelectedForJob =
                !file.isDirectory &&
                selectedJobFile?.path === file.path &&
                selectedJobFile?.source === source;

              return (
                <div
                  key={file.path}
                  className={`flex items-center group px-3 py-1 cursor-pointer border-b border-[#0f3460]/20 transition-colors ${
                    isSelectedForJob
                      ? "bg-[#1a3a6e] hover:bg-[#1f4480]"
                      : "hover:bg-[#1a1a2e]"
                  }`}
                  onClick={() => {
                    if (file.isDirectory) {
                      navigate(file.path);
                    } else {
                      setSelectedJobFile(
                        isSelectedForJob
                          ? null
                          : { path: file.path, source, name: file.name },
                      );
                      // Deselect canvas toolpath when the file browser takes
                      // ownership of the job-file selection.
                      selectToolpath(false);
                    }
                  }}
                >
                  <span className="mr-1.5 text-[11px]">
                    {file.isDirectory ? "📁" : "📄"}
                  </span>
                  <span
                    className="flex-1 text-[10px] truncate"
                    title={file.name}
                  >
                    {file.name}
                  </span>
                  {!file.isDirectory && file.size > 0 && (
                    <span className="text-[9px] text-gray-600 mr-1 shrink-0">
                      {file.size > 1_000_000
                        ? `${(file.size / 1_000_000).toFixed(1)}M`
                        : file.size > 1_000
                          ? `${(file.size / 1_000).toFixed(0)}K`
                          : `${file.size}B`}
                    </span>
                  )}
                  {file.isDirectory ? (
                    <span className="text-gray-600 text-[9px] hidden group-hover:block shrink-0">
                      ›
                    </span>
                  ) : (
                    <div className="hidden group-hover:flex gap-0.5 shrink-0">
                      {isGcodeFile(file.name) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(file);
                          }}
                          title="Preview toolpath"
                          disabled={previewing === file.path}
                          className="text-[9px] px-1 py-0.5 rounded bg-[#0d2a3a] hover:bg-[#0e3d5a] disabled:opacity-50"
                        >
                          {previewing === file.path ? "…" : "👁"}
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRun(file);
                        }}
                        title="Run job now"
                        className="text-[9px] px-1 py-0.5 rounded bg-[#e94560] hover:bg-[#c73d56] text-white"
                      >
                        ▶
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(file);
                        }}
                        disabled={serialMode}
                        title={
                          serialMode
                            ? "File download not available over serial"
                            : "Download"
                        }
                        className="text-[9px] px-1 py-0.5 rounded bg-[#0f3460] hover:bg-[#1a4a8a] disabled:opacity-40"
                      >
                        ↓
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(file);
                        }}
                        title="Delete"
                        className="text-[9px] px-1 py-0.5 rounded bg-[#3a1a1a] hover:bg-[#6a2020]"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Upload footer */}
          <div className={`shrink-0 px-2 py-1.5 border-t ${borderAccent}/50`}>
            <button
              onClick={handleUpload}
              disabled={!connected || serialMode}
              title={
                serialMode ? "File upload not available over serial" : undefined
              }
              className={`w-full text-[10px] py-1 rounded disabled:opacity-40 transition-colors ${
                accentColor === "blue"
                  ? "bg-[#0f3460] hover:bg-[#1a4a8a]"
                  : "bg-[#3d1060] hover:bg-[#5a1a90]"
              } text-gray-200`}
            >
              ↑ Upload to {path}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function FileBrowserPanel() {
  const connected = useMachineStore((s) => s.connected);
  const activeConfig = useMachineStore((s) => s.activeConfig);
  const serialMode = connected && activeConfig()?.connection.type === "usb";
  const upsertTask = useTaskStore((s) => s.upsertTask);

  // Collapsed state — internal starts collapsed, sdcard starts open
  const [internalOpen, setInternalOpen] = useState(false);
  const [sdOpen, setSdOpen] = useState(true);

  // Pixel height of the internal pane when both are open
  const [splitPx, setSplitPx] = useState(200);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startPx: number } | null>(null);

  const bothOpen = internalOpen && sdOpen;

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startPx: splitPx };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientY - dragRef.current.startY;
      const containerH = containerRef.current?.clientHeight ?? 400;
      const newPx = Math.max(
        80,
        Math.min(dragRef.current.startPx + delta, containerH - 80),
      );
      setSplitPx(newPx);
    };

    const onMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const uploadFn = (
    localPath: string,
    remotePath: string,
    taskId: string,
    name: string,
  ) => {
    upsertTask({
      id: taskId,
      type: "file-upload",
      label: `Uploading ${name}`,
      progress: 0,
      status: "running",
    });
    window.terraForge.fluidnc
      .uploadFile(taskId, localPath, remotePath)
      .catch(console.error);
  };

  const sharedProps = {
    connected,
    serialMode,
    uploadFn,
    upsertTask,
    taskType: "file-upload" as const,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Title */}
      <div className="flex items-center px-3 py-2 border-b border-[#0f3460] shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          File Browser
        </span>
      </div>

      {/* Pane container */}
      <div
        ref={containerRef}
        className="flex-1 flex flex-col overflow-hidden min-h-0"
      >
        {/* Internal filesystem pane */}
        <div
          className="flex flex-col overflow-hidden"
          style={
            bothOpen
              ? { height: splitPx, flexShrink: 0 }
              : internalOpen
                ? { flex: 1, minHeight: 0 }
                : { flexShrink: 0 }
          }
        >
          <FsPane
            {...sharedProps}
            label="internal"
            accentColor="blue"
            source="fs"
            listFn={(p) => window.terraForge.fluidnc.listFiles(p)}
            deleteFn={(p) => window.terraForge.fluidnc.deleteFile(p, "fs")}
            open={internalOpen}
            onToggle={() => setInternalOpen((v) => !v)}
          />
        </div>

        {/* Drag handle — only visible when both panes are open */}
        {bothOpen && (
          <div
            onMouseDown={onDragStart}
            className="shrink-0 h-2 flex items-center justify-center cursor-row-resize bg-[#0a1020] hover:bg-[#0f3460] group select-none"
            title="Drag to resize"
          >
            <div className="w-10 h-0.5 rounded bg-gray-700 group-hover:bg-[#e94560] transition-colors" />
          </div>
        )}

        {/* SD card filesystem pane */}
        <div
          className="flex flex-col overflow-hidden"
          style={sdOpen ? { flex: 1, minHeight: 0 } : { flexShrink: 0 }}
        >
          <FsPane
            {...sharedProps}
            label="sdcard"
            accentColor="purple"
            source="sd"
            listFn={(p) => window.terraForge.fluidnc.listSDFiles(p)}
            deleteFn={(p) => window.terraForge.fluidnc.deleteFile(p, "sd")}
            open={sdOpen}
            onToggle={() => setSdOpen((v) => !v)}
          />
        </div>
      </div>
    </div>
  );
}
