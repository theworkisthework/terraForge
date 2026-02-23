import { useState, useEffect, useCallback } from "react";
import { v4 as uuid } from "uuid";
import { useMachineStore } from "../store/machineStore";
import { useTaskStore } from "../store/taskStore";
import { useCanvasStore } from "../store/canvasStore";
import { parseGcode } from "../utils/gcodeParser";
import type { RemoteFile } from "../../../types";

const GCODE_EXTS = [".gcode", ".nc", ".g", ".gc", ".gco", ".ngc", ".ncc", ".cnc", ".tap"];
const isGcodeFile = (name: string) => GCODE_EXTS.some((e) => name.toLowerCase().endsWith(e));

// ── helpers ────────────────────────────────────────────────────────────────────

function parentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  parts.pop();
  return parts.length === 0 ? "/" : "/" + parts.join("/");
}

function Breadcrumb({ path, navigate }: { path: string; navigate: (p: string) => void }) {
  const parts = path.split("/").filter(Boolean);
  return (
    <div className="flex items-center gap-0.5 text-[10px] overflow-x-auto flex-1 min-w-0">
      <button
        onClick={() => navigate("/")}
        className={path === "/" ? "text-white font-semibold" : "text-[#e94560] hover:text-white"}
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
              className={segPath === path ? "text-white font-semibold" : "text-[#e94560] hover:text-white"}
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
  listFn: (path: string) => Promise<RemoteFile[]>;
  deleteFn: (path: string) => Promise<void>;
  runFn: (path: string) => Promise<void>;
  uploadFn: (localPath: string, remotePath: string, taskId: string, name: string) => void;
  upsertTask: ReturnType<typeof useTaskStore>["upsertTask"];
  taskType: "file-upload" | "file-download";
}

function FsPane({ label, accentColor, connected, listFn, deleteFn, runFn, uploadFn, upsertTask, taskType }: FsPaneProps) {
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [path, setPath] = useState("/");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const setGcodeToolpath = useCanvasStore((s) => s.setGcodeToolpath);

  const navigate = useCallback(async (target: string) => {
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
  }, [connected, listFn]);

  useEffect(() => {
    if (connected) { navigate("/"); }
    else { setFiles([]); setPath("/"); setError(null); }
  }, [connected]);

  const handleDownload = async (file: RemoteFile) => {
    const localPath = await window.terraForge.fs.saveGcodeDialog(file.name);
    if (!localPath) return;
    const taskId = uuid();
    upsertTask({ id: taskId, type: "file-download", label: `Downloading ${file.name}`, progress: 0, status: "running" });
    await window.terraForge.fluidnc.downloadFile(taskId, file.path, localPath, label === "sdcard" ? "sdcard" : "internal");
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

  const handlePreview = async (file: RemoteFile) => {
    setPreviewing(file.path);
    try {
      const text = await window.terraForge.fluidnc.fetchFileText(
        file.path,
        label === "sdcard" ? "sdcard" : "internal",
      );
      const toolpath = parseGcode(text);
      setGcodeToolpath(toolpath);
    } catch (err) {
      console.error("Preview failed:", err);
    } finally {
      setPreviewing(null);
    }
  };

  const atRoot = path === "/";
  const bgAccent = accentColor === "blue" ? "bg-[#0a1628]" : "bg-[#1a0d1a]";
  const borderAccent = accentColor === "blue" ? "border-[#0f3460]" : "border-[#3d1060]";
  const labelColor = accentColor === "blue" ? "text-[#60a0ff]" : "text-[#c084fc]";
  const btnColor = accentColor === "blue"
    ? "text-[#60a0ff] hover:text-white"
    : "text-[#c084fc] hover:text-white";

  return (
    <div className={`flex flex-col border-b ${borderAccent}`}>
      {/* Section header */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 cursor-pointer select-none ${bgAccent}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`text-[10px] font-bold uppercase tracking-widest ${labelColor}`}>
          {open ? "▾" : "▸"} {label}
        </span>
        {open && (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(path); }}
            disabled={!connected || loading}
            title="Refresh"
            className={`text-xs disabled:opacity-40 transition-colors ${btnColor}`}
          >
            {loading ? "…" : "↻"}
          </button>
        )}
      </div>

      {!open ? null : (
        <>
          {/* Breadcrumb + up */}
          <div className={`flex items-center gap-1 px-2 py-1 border-b ${borderAccent}/50 min-h-[24px]`}>
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
          <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
            {!connected ? (
              <p className="text-[10px] text-gray-600 text-center py-4 px-3">Not connected.</p>
            ) : error ? (
              <p className="text-[10px] text-red-400 text-center py-3 px-3 break-all">{error}</p>
            ) : files.length === 0 && !loading ? (
              <p className="text-[10px] text-gray-600 text-center py-4 px-3">Empty.</p>
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

            {files.map((file) => (
              <div
                key={file.path}
                className="flex items-center group px-3 py-1 hover:bg-[#1a1a2e] cursor-pointer border-b border-[#0f3460]/20"
                onClick={() => file.isDirectory && navigate(file.path)}
              >
                <span className="mr-1.5 text-[11px]">{file.isDirectory ? "📁" : "📄"}</span>
                <span className="flex-1 text-[10px] truncate" title={file.name}>{file.name}</span>
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
                  <span className="text-gray-600 text-[9px] hidden group-hover:block shrink-0">›</span>
                ) : (
                  <div className="hidden group-hover:flex gap-0.5 shrink-0">
                    {isGcodeFile(file.name) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePreview(file); }}
                        title="Preview toolpath"
                        disabled={previewing === file.path}
                        className="text-[9px] px-1 py-0.5 rounded bg-[#0d2a3a] hover:bg-[#0e3d5a] disabled:opacity-50"
                      >{previewing === file.path ? "…" : "👁"}</button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); runFn(file.path); }}
                      title="Run" className="text-[9px] px-1 py-0.5 rounded bg-[#e94560] hover:bg-[#c73d56]"
                    >▶</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                      title="Download" className="text-[9px] px-1 py-0.5 rounded bg-[#0f3460] hover:bg-[#1a4a8a]"
                    >↓</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${file.name}?`)) deleteFn(file.path).then(() => navigate(path)); }}
                      title="Delete" className="text-[9px] px-1 py-0.5 rounded bg-[#3a1a1a] hover:bg-[#6a2020]"
                    >✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Upload footer */}
          <div className={`px-2 py-1.5 border-t ${borderAccent}/50`}>
            <button
              onClick={handleUpload}
              disabled={!connected}
              className={`w-full text-[10px] py-1 rounded disabled:opacity-40 transition-colors ${
                accentColor === "blue"
                  ? "bg-[#0f3460] hover:bg-[#1a4a8a]"
                  : "bg-[#3d1060] hover:bg-[#5a1a90]"
              } text-gray-200`}
            >
              ↑ Upload to {path}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function FileBrowserPanel() {
  const connected = useMachineStore((s) => s.connected);
  const upsertTask = useTaskStore((s) => s.upsertTask);

  const uploadFn = (localPath: string, remotePath: string, taskId: string, name: string) => {
    upsertTask({ id: taskId, type: "file-upload", label: `Uploading ${name}`, progress: 0, status: "running" });
    window.terraForge.fluidnc.uploadFile(taskId, localPath, remotePath).catch(console.error);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Title */}
      <div className="flex items-center px-3 py-2 border-b border-[#0f3460] shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          File Browser
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Internal filesystem */}
        <FsPane
          label="internal"
          accentColor="blue"
          connected={connected}
          listFn={(p) => window.terraForge.fluidnc.listFiles(p)}
          deleteFn={(p) => window.terraForge.fluidnc.deleteFile(p)}
          runFn={(p) => window.terraForge.fluidnc.runFile(p, "fs")}
          uploadFn={uploadFn}
          upsertTask={upsertTask}
          taskType="file-upload"
        />

        {/* SD card filesystem */}
        <FsPane
          label="sdcard"
          accentColor="purple"
          connected={connected}
          listFn={(p) => window.terraForge.fluidnc.listSDFiles(p)}
          deleteFn={(p) => window.terraForge.fluidnc.deleteFile(p)}
          runFn={(p) => window.terraForge.fluidnc.runFile(p, "sd")}
          uploadFn={uploadFn}
          upsertTask={upsertTask}
          taskType="file-upload"
        />
      </div>
    </div>
  );
}
