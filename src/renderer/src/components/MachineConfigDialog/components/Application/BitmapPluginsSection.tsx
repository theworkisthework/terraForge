import { Download, FolderOpen, RefreshCw } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Section } from "../Section";
import { Button } from "../../../ui/Button";
import { useBitmapPluginStore } from "../../../../store/bitmapPluginStore";

/**
 * Manages externally-installed renderer plugins.
 *
 * Rescan exists because plugins are discovered from disk at startup, so
 * without it an install only takes effect on the next launch. The rejected
 * list exists because a plugin whose manifest fails validation is otherwise
 * completely silent — it simply never appears in the renderer dropdown, with
 * the reason visible nowhere in the app.
 */
export function BitmapPluginsSection() {
  const {
    plugins,
    errors,
    scanning,
    actionError,
    lastInstall,
    rescanBitmapPlugins,
    openPluginsFolder,
    installExamplePlugins,
  } = useBitmapPluginStore(
    useShallow((state) => ({
      plugins: state.plugins,
      errors: state.errors,
      scanning: state.scanning,
      actionError: state.actionError,
      lastInstall: state.lastInstall,
      rescanBitmapPlugins: state.rescanBitmapPlugins,
      openPluginsFolder: state.openPluginsFolder,
      installExamplePlugins: state.installExamplePlugins,
    })),
  );

  return (
    <Section title="Renderer Plugins">
      <p className="text-xs text-content-faint">
        Renderer plugins turn an imported image into plottable geometry. Drop a plugin folder
        into the <span className="font-mono">renderer-plugins</span> directory, then rescan —
        installed renderers appear in the Renderer list when a bitmap import is selected.
        Installing the examples copies a worked plugin into that folder, to use as it is or to
        read and adapt.
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
        <Button
          onClick={() => void installExamplePlugins()}
          disabled={scanning}
          variant="secondary"
          size="sm"
          icon={<Download size={12} strokeWidth={2} />}
        >
          Install examples
        </Button>
      </div>

      {lastInstall && (
        <p className="text-xs text-content-faint">
          {lastInstall.installed.length > 0
            ? `Installed ${lastInstall.installed.join(", ")}.`
            : "No new examples to install."}
          {lastInstall.skipped.length > 0 &&
            ` Left ${lastInstall.skipped.join(", ")} alone — already in your plugins folder.`}
          {lastInstall.unsupported.length > 0 &&
            ` Held back ${lastInstall.unsupported.join(", ")} — generators cannot be placed on the bed yet.`}
        </p>
      )}

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
        <p className="text-xs text-content-faint">No renderer plugins installed.</p>
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
