import { FolderOpen, RefreshCw } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Section } from "../Section";
import { Button } from "../../../ui/Button";
import { useBitmapPluginStore } from "../../../../store/bitmapPluginStore";

/**
 * Manages externally-installed bitmap renderer plugins.
 *
 * Rescan exists because plugins are discovered from disk at startup, so
 * without it an install only takes effect on the next launch. The rejected
 * list exists because a plugin whose manifest fails validation is otherwise
 * completely silent — it simply never appears in the renderer dropdown, with
 * the reason visible nowhere in the app.
 */
export function BitmapPluginsSection() {
  const { plugins, errors, scanning, actionError, rescanBitmapPlugins, openPluginsFolder } =
    useBitmapPluginStore(
      useShallow((state) => ({
        plugins: state.plugins,
        errors: state.errors,
        scanning: state.scanning,
        actionError: state.actionError,
        rescanBitmapPlugins: state.rescanBitmapPlugins,
        openPluginsFolder: state.openPluginsFolder,
      })),
    );

  return (
    <Section title="Bitmap Renderer Plugins">
      <p className="text-xs text-content-faint">
        Bitmap renderers turn an imported image into plottable geometry. Drop a plugin folder
        into the plugins directory, then rescan — installed renderers appear in the Renderer
        list when a bitmap import is selected.
      </p>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => void rescanBitmapPlugins()}
          disabled={scanning}
          variant="secondary"
          size="sm"
          icon={<RefreshCw size={12} strokeWidth={2} className={scanning ? "animate-spin" : undefined} />}
        >
          {scanning ? "Rescanning…" : "Rescan"}
        </Button>
        <Button
          onClick={() => void openPluginsFolder()}
          variant="secondary"
          size="sm"
          icon={<FolderOpen size={12} strokeWidth={2} />}
        >
          Open plugins folder
        </Button>
      </div>

      {actionError && <p className="text-xs text-red-400">{actionError}</p>}

      {plugins.length > 0 ? (
        <ul className="space-y-1">
          {plugins.map((plugin) => (
            <li key={plugin.id} className="text-xs text-content">
              {plugin.label} <span className="text-content-faint font-mono">({plugin.id})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-content-faint">No bitmap renderer plugins installed.</p>
      )}

      {errors.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-content">Rejected</div>
          <ul className="space-y-1">
            {errors.map((error) => (
              <li key={error.folder} className="text-xs text-red-400 leading-snug">
                <span className="font-mono">{error.folder}</span>: {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
