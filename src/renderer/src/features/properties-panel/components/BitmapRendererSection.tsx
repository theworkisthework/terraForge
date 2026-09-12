import { useEffect, useState } from "react";
import type { SvgImport } from "../../../../../types";
import { useBitmapPluginStore } from "../../../store/bitmapPluginStore";
import { materializeBitmapLayers } from "../../bitmap-renderers/bitmapImage";
import {
  bitmapRenderers,
  findBitmapRenderer,
  getBitmapRenderer,
  pluginRendererFromManifest,
} from "../../bitmap-renderers/registry";
import { BitmapSeparationSection } from "./BitmapSeparationSection";
import { RendererFieldControl } from "./RendererFieldControl";

/** Debounce for settings-driven re-renders — a slider fires on every `input`
 * event, and a plugin render is now a subprocess round trip rather than a
 * free synchronous call, so every keystroke can't trigger one directly. */
const RENDER_DEBOUNCE_MS = 200;

export function BitmapRendererSection({ imp, onUpdate }: { imp: SvgImport; onUpdate: (changes: Partial<SvgImport>) => void }) {
  const pluginManifests = useBitmapPluginStore((state) => state.plugins);
  const allRenderers = [...bitmapRenderers, ...pluginManifests.map(pluginRendererFromManifest)];

  // An unset renderer id defaults (new import); a set-but-unresolvable id
  // (e.g. an uninstalled plugin) must surface as missing, not silently
  // fall back to a different renderer.
  const renderer = imp.bitmapRendererId
    ? findBitmapRenderer(imp.bitmapRendererId, pluginManifests)
    : getBitmapRenderer(undefined, pluginManifests);
  const settings = renderer ? { ...renderer.defaults, ...imp.bitmapRendererSettings } : {};

  const [renderStatus, setRenderStatus] = useState<"idle" | "rendering" | "error">("idle");
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRenderStatus("rendering");
    setRenderError(null);

    const timer = setTimeout(() => {
      void materializeBitmapLayers(imp)
        .then(({ bitmapRendererPath, paths }) => {
          if (cancelled) return;
          setRenderStatus("idle");
          onUpdate({ bitmapRendererPath, paths });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setRenderStatus("error");
          setRenderError(err instanceof Error ? err.message : String(err));
        });
    }, RENDER_DEBOUNCE_MS);

    // Doubles as the debounce cancel *and* the "latest request wins" guard —
    // a dependency change before the timer fires, or before the async
    // render settles, marks this run stale so it can't clobber a newer one.
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    imp.bitmapDataUrl,
    imp.bitmapRendererId,
    imp.bitmapRendererSettings,
    imp.bitmapBaseScale,
    imp.bitmapSeparationMode,
    imp.bitmapSeparationPalette,
  ]);

  const updateSettings = (changes: Partial<typeof settings>) =>
    onUpdate({ bitmapRendererSettings: { ...settings, ...changes }, bitmapRendererPath: undefined, paths: [] });

  return (
    <div className="mb-2 pb-2 border-b border-border-ui/30">
      <label className="text-[10px] text-content-muted uppercase tracking-wider block mb-1.5" htmlFor={`bitmap-renderer-${imp.id}`}>Renderer</label>
      <select id={`bitmap-renderer-${imp.id}`} aria-label="Bitmap renderer" value={renderer?.id ?? ""} onChange={(event) => {
        const next = getBitmapRenderer(event.target.value, pluginManifests);
        onUpdate({ bitmapRendererId: next.id, bitmapRendererSettings: { ...next.defaults }, bitmapRendererPath: undefined, paths: [] });
      }} className="w-full bg-app border border-border-ui rounded px-1.5 py-1 text-xs text-content focus:border-accent outline-none">
        {!renderer && <option value="" disabled>Select a renderer…</option>}
        {allRenderers.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select>

      {!renderer && (
        <p className="mt-1.5 text-[10px] text-red-400">
          Renderer &quot;{imp.bitmapRendererId}&quot; isn&apos;t installed — pick another one above.
        </p>
      )}
      {renderer && renderStatus === "error" && (
        <p className="mt-1.5 text-[10px] text-red-400">Render failed: {renderError}</p>
      )}
      {renderer && renderStatus === "rendering" && (
        <p className="mt-1.5 text-[10px] text-content-muted">Rendering…</p>
      )}

      {renderer && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {renderer.fields.map((field) => (
            <RendererFieldControl
              key={field.key}
              field={field}
              value={settings[field.key]}
              onChange={(value) => updateSettings({ [field.key]: value })}
            />
          ))}
        </div>
      )}
      {renderer && <BitmapSeparationSection imp={imp} onUpdate={onUpdate} />}
      <div className="mt-2 pt-2 border-t border-border-ui/30">
        <span className="text-[10px] text-content-muted uppercase tracking-wider block mb-1.5">Show</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-content-muted w-16 shrink-0">
            <input
              aria-label="Show source bitmap"
              type="checkbox"
              checked={imp.bitmapSourceVisible !== false}
              onChange={(event) => onUpdate({ bitmapSourceVisible: event.target.checked })}
            />
            Source
          </label>
          <input
            aria-label="Bitmap source opacity"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={imp.bitmapOpacity ?? 0.25}
            disabled={imp.bitmapSourceVisible === false}
            onChange={(event) => onUpdate({ bitmapOpacity: Number(event.target.value) })}
            className="flex-1 accent-accent disabled:opacity-50"
          />
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <label className="flex items-center gap-1.5 text-[10px] text-content-muted w-16 shrink-0">
            <input
              aria-label="Show render preview"
              type="checkbox"
              checked={imp.bitmapPreviewVisible !== false}
              onChange={(event) => onUpdate({ bitmapPreviewVisible: event.target.checked })}
            />
            Preview
          </label>
          <input
            aria-label="Bitmap preview opacity"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={imp.bitmapPreviewOpacity ?? 1}
            disabled={imp.bitmapPreviewVisible === false}
            onChange={(event) => onUpdate({ bitmapPreviewOpacity: Number(event.target.value) })}
            className="flex-1 accent-accent disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
}
