import { useCallback, useEffect, useState } from "react";
import { v4 as uuid } from "uuid";
import { ChevronRight, File, Folder, RefreshCw, Upload } from "lucide-react";
import type { RemoteFile } from "../../../types";
import { Button } from "../../../renderer/src/components/ui";
import { useMachineStore } from "../../../renderer/src/store/machineStore";
import { useSession } from "../session";

type Volume = "sd" | "fs";

const fmtSize = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(0)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;

export function FilesScreen({ onGoToMachine }: { onGoToMachine: () => void }) {
  const connected = useMachineStore((s) => s.connected);
  const selected = useMachineStore((s) => s.selectedJobFile);
  const setSelected = useMachineStore((s) => s.setSelectedJobFile);
  const tasks = useSession((s) => s.tasks);
  const [volume, setVolume] = useState<Volume>("sd");
  const [path, setPath] = useState("/");
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  const load = useCallback(
    async (target: string, vol: Volume) => {
      if (!connected) return;
      setLoading(true);
      setError(null);
      try {
        const api = window.terraForge.fluidnc;
        const list = await (vol === "sd"
          ? api.listSDFiles(target)
          : api.listFiles(target));
        setFiles(
          [...list].sort(
            (a, b) =>
              Number(b.isDirectory) - Number(a.isDirectory) ||
              a.name.localeCompare(b.name),
          ),
        );
        setPath(target);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [connected],
  );

  useEffect(() => {
    setPath("/");
    setFiles([]);
    load("/", volume);
  }, [connected, volume, load]);

  const upload = async () => {
    const local = await window.terraForge.fs.openFileDialog();
    if (!local) return;
    const name = local.split(/[\\/]/).pop()!;
    const remote = `${path === "/" ? "" : path}/${name}`;
    await window.terraForge.fluidnc.uploadFile(uuid(), local, remote);
    load(path, volume);
  };

  const remove = async (f: RemoteFile) => {
    if (armedDelete !== f.path) return setArmedDelete(f.path);
    setArmedDelete(null);
    try {
      await window.terraForge.fluidnc.deleteFile(f.path, volume);
      if (selected?.path === f.path) setSelected(null);
      load(path, volume);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const download = (f: RemoteFile) =>
    window.terraForge.fluidnc.downloadFile(
      uuid(),
      f.path,
      `/save/${f.name}`,
      volume === "sd" ? "sdcard" : "internal",
    );

  if (!connected) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-content-muted">
          Connect to a machine to browse its files.
        </p>
        <Button variant="primary" size="lg" onClick={onGoToMachine}>
          Go to Machine
        </Button>
      </div>
    );
  }

  const crumbs = path.split("/").filter(Boolean);
  const transfer = Object.values(tasks).find(
    (t) =>
      (t.type === "file-upload" || t.type === "file-download") &&
      t.status === "running",
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 p-3 border-b border-border-ui shrink-0">
        <div className="flex rounded overflow-hidden border border-border-ui">
          {(["sd", "fs"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVolume(v)}
              className={`px-4 py-2 text-sm ${volume === v ? "bg-accent text-white" : "bg-secondary text-content"}`}
            >
              {v === "sd" ? "SD card" : "Internal"}
            </button>
          ))}
        </div>
        <Button
          className="ml-auto"
          onClick={() => load(path, volume)}
          aria-label="Refresh"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </Button>
        <Button
          onClick={upload}
          icon={<Upload size={16} />}
          disabled={!!transfer}
        >
          Upload
        </Button>
      </div>

      <nav className="flex items-center gap-1 px-3 py-2 text-sm overflow-x-auto whitespace-nowrap shrink-0 text-content-muted">
        <button
          type="button"
          onClick={() => load("/", volume)}
          className="py-1 px-1 text-content"
        >
          /
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={12} />
            <button
              type="button"
              className="py-1 px-1 text-content"
              onClick={() =>
                load("/" + crumbs.slice(0, i + 1).join("/"), volume)
              }
            >
              {c}
            </button>
          </span>
        ))}
      </nav>

      {transfer && (
        <div className="px-3 pb-2 text-xs text-content-muted shrink-0">
          {transfer.label}{" "}
          {transfer.progress != null
            ? `· ${Math.round(transfer.progress)}%`
            : ""}
        </div>
      )}
      {error && <p className="px-3 pb-2 text-sm text-red-400">{error}</p>}

      <ul className="flex-1 overflow-y-auto">
        {path !== "/" && (
          <li>
            <button
              type="button"
              className="w-full text-left px-4 py-3 border-b border-border-ui text-content-muted"
              onClick={() => load("/" + crumbs.slice(0, -1).join("/"), volume)}
            >
              ..
            </button>
          </li>
        )}
        {files.length === 0 && !loading && !error && (
          <li className="p-6 text-center text-content-muted">Empty folder</li>
        )}
        {files.map((f) => {
          const isSel = selected?.path === f.path && selected.source === volume;
          return (
            <li
              key={f.path}
              className={`border-b border-border-ui ${isSel ? "bg-secondary" : ""}`}
            >
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                onClick={() =>
                  f.isDirectory
                    ? load(f.path, volume)
                    : setSelected(
                        isSel
                          ? null
                          : { path: f.path, name: f.name, source: volume },
                      )
                }
              >
                {f.isDirectory ? (
                  <Folder size={20} className="text-content-muted shrink-0" />
                ) : (
                  <File size={20} className="text-content-muted shrink-0" />
                )}
                <span className="flex-1 truncate">{f.name}</span>
                {!f.isDirectory && (
                  <span className="text-xs text-content-muted">
                    {fmtSize(f.size)}
                  </span>
                )}
              </button>
              {isSel && !f.isDirectory && (
                <div className="flex gap-2 px-4 pb-3">
                  <Button size="md" onClick={() => download(f)}>
                    Download
                  </Button>
                  <Button
                    size="md"
                    variant={armedDelete === f.path ? "danger" : "secondary"}
                    onClick={() => remove(f)}
                  >
                    {armedDelete === f.path ? "Tap again to delete" : "Delete"}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
