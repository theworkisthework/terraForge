import { useState, useEffect } from "react";
import { v4 as uuid } from "uuid";
import { useMachineStore } from "../store/machineStore";
import { useTaskStore } from "../store/taskStore";
import type { RemoteFile } from "../../../types";

export function FileBrowserPanel() {
  const connected = useMachineStore((s) => s.connected);
  const upsertTask = useTaskStore((s) => s.upsertTask);

  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [currentPath, setCurrentPath] = useState("/");
  const [loading, setLoading] = useState(false);
  const [uploadRemoteFolder, setUploadRemoteFolder] = useState("/");

  const refresh = async (path = currentPath) => {
    if (!connected) return;
    setLoading(true);
    try {
      const list = await window.terraForge.fluidnc.listFiles(path);
      setFiles(list);
      setCurrentPath(path);
    } catch (err) {
      console.error("listFiles failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connected) refresh("/");
    else setFiles([]);
  }, [connected]);

  const handleDelete = async (file: RemoteFile) => {
    if (!confirm(`Delete ${file.name}?`)) return;
    await window.terraForge.fluidnc.deleteFile(file.path);
    refresh();
  };

  const handleDownload = async (file: RemoteFile) => {
    const localPath = await window.terraForge.fs.saveGcodeDialog(file.name);
    if (!localPath) return;
    const taskId = uuid();
    upsertTask({
      id: taskId,
      type: "file-download",
      label: `Downloading ${file.name}`,
      progress: 0,
      status: "running",
    });
    await window.terraForge.fluidnc.downloadFile(taskId, file.path, localPath);
  };

  const handleRun = async (file: RemoteFile) => {
    await window.terraForge.fluidnc.runFile(file.path);
  };

  const handleUploadGcode = async () => {
    const localPath = await window.terraForge.fs.openSvgDialog();
    if (!localPath) return;
    const name = localPath.split(/[\\/]/).pop()!;
    const remotePath = `${uploadRemoteFolder.replace(/\/$/, "")}/${name}`;
    const taskId = uuid();
    upsertTask({
      id: taskId,
      type: "file-upload",
      label: `Uploading ${name}`,
      progress: 0,
      status: "running",
    });
    await window.terraForge.fluidnc.uploadFile(taskId, localPath, remotePath);
    refresh();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#0f3460]">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          SD Card
        </span>
        <button
          onClick={() => refresh()}
          disabled={!connected || loading}
          className="text-xs text-[#e94560] hover:text-white disabled:opacity-40"
        >
          {loading ? "…" : "↻"}
        </button>
      </div>

      {/* Path breadcrumb */}
      <div className="px-3 py-1 text-xs text-gray-500 truncate">
        {currentPath}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {!connected && (
          <p className="text-xs text-gray-600 text-center mt-8 px-3">
            Connect to a machine to browse files.
          </p>
        )}
        {connected && files.length === 0 && !loading && (
          <p className="text-xs text-gray-600 text-center mt-8 px-3">
            No files found.
          </p>
        )}
        {files.map((file) => (
          <div
            key={file.path}
            className="flex items-center group px-3 py-1.5 hover:bg-[#1a1a2e] cursor-pointer border-b border-[#0f3460]/30"
            onClick={() => file.isDirectory && refresh(file.path)}
          >
            <span className="mr-2 text-gray-500">
              {file.isDirectory ? "📁" : "📄"}
            </span>
            <span className="flex-1 text-xs truncate" title={file.name}>
              {file.name}
            </span>
            {!file.isDirectory && (
              <div className="hidden group-hover:flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRun(file);
                  }}
                  title="Run"
                  className="text-[10px] px-1 py-0.5 rounded bg-[#e94560] hover:bg-[#c73d56]"
                >
                  ▶
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(file);
                  }}
                  title="Download"
                  className="text-[10px] px-1 py-0.5 rounded bg-[#0f3460] hover:bg-[#1a4a8a]"
                >
                  ↓
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(file);
                  }}
                  title="Delete"
                  className="text-[10px] px-1 py-0.5 rounded bg-[#3a1a1a] hover:bg-[#6a2020]"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Upload section */}
      <div className="border-t border-[#0f3460] p-3 space-y-2">
        <label className="text-xs text-gray-400">Upload to folder</label>
        <input
          type="text"
          value={uploadRemoteFolder}
          onChange={(e) => setUploadRemoteFolder(e.target.value)}
          className="w-full text-xs bg-[#1a1a2e] border border-[#0f3460] rounded px-2 py-1 text-gray-200"
          placeholder="/"
        />
        <button
          onClick={handleUploadGcode}
          disabled={!connected}
          className="w-full text-xs py-1 rounded bg-[#e94560] hover:bg-[#c73d56] disabled:opacity-40 transition-colors"
        >
          Upload file…
        </button>
      </div>
    </div>
  );
}
