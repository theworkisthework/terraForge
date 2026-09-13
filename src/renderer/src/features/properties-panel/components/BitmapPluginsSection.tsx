import { FolderOpen, RefreshCw } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useBitmapPluginStore } from "../../../store/bitmapPluginStore";

const buttonClassName =
  "flex items-center gap-1 px-1.5 py-1 rounded border border-border-ui text-[10px] " +
  "text-content-muted hover:text-content hover:bg-secondary/40 transition-colors " +
  "disabled:opacity-50 disabled:hover:text-content-muted disabled:hover:bg-transparent";

/**
 * Management footer for externally-installed bitmap renderer plugins.
 *
 * Rescan exists because plugins are discovered from disk, and without it an
 * install only takes effect on the next app launch. The error list exists
 * because a plugin whose manifest fails validation is otherwise completely
 * silent — it simply never appears in the renderer dropdown, with the reason
 * visible nowhere in the app.
 */
export function BitmapPluginsSection() {
  const { errors, scanning, actionError, rescanBitmapPlugins, openPluginsFolder } =
    useBitmapPluginStore(
      useShallow((state) => ({
        errors: state.errors,
        scanning: state.scanning,
        actionError: state.actionError,
        rescanBitmapPlugins: state.rescanBitmapPlugins,
        openPluginsFolder: state.openPluginsFolder,
      })),
    );

  return (
    <div className="mt-2 pt-2 border-t border-border-ui/30">
      <span className="text-[10px] text-content-muted uppercase tracking-wider block mb-1.5">
        Bitmap plugins
      </span>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void rescanBitmapPlugins()}
          disabled={scanning}
          className={buttonClassName}
        >
          <RefreshCw size={11} strokeWidth={2} className={scanning ? "animate-spin" : undefined} />
          {scanning ? "Rescanning…" : "Rescan"}
        </button>
        <button type="button" onClick={() => void openPluginsFolder()} className={buttonClassName}>
          <FolderOpen size={11} strokeWidth={2} />
          Open folder
        </button>
      </div>

      {actionError && <p className="mt-1.5 text-[10px] text-red-400">{actionError}</p>}

      {errors.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {errors.map((error) => (
            <li key={error.folder} className="text-[10px] text-red-400 leading-snug">
              <span className="font-mono">{error.folder}</span>: {error.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
