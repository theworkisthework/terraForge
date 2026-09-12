import { useEffect } from "react";
import type { SvgImport } from "../../../../../types";
import { materializeBitmapPath } from "../../bitmap-renderers/bitmapImage";
import { bitmapRenderers, getBitmapRenderer } from "../../bitmap-renderers/registry";
import { RendererFieldControl } from "./RendererFieldControl";

export function BitmapRendererSection({ imp, onUpdate }: { imp: SvgImport; onUpdate: (changes: Partial<SvgImport>) => void }) {
  const renderer = getBitmapRenderer(imp.bitmapRendererId);
  const settings = { ...renderer.defaults, ...imp.bitmapRendererSettings };

  useEffect(() => {
    let active = true;
    void materializeBitmapPath(imp).then((bitmapRendererPath) => {
      if (active && bitmapRendererPath !== imp.bitmapRendererPath) onUpdate({ bitmapRendererPath });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [imp.bitmapDataUrl, imp.bitmapRendererId, imp.bitmapRendererSettings, imp.bitmapBaseScale]);

  const updateSettings = (changes: Partial<typeof settings>) =>
    onUpdate({ bitmapRendererSettings: { ...settings, ...changes }, bitmapRendererPath: undefined });

  return (
    <div className="mb-2 pb-2 border-b border-border-ui/30">
      <label className="text-[10px] text-content-muted uppercase tracking-wider block mb-1.5" htmlFor={`bitmap-renderer-${imp.id}`}>Renderer</label>
      <select id={`bitmap-renderer-${imp.id}`} aria-label="Bitmap renderer" value={renderer.id} onChange={(event) => {
        const next = getBitmapRenderer(event.target.value);
        onUpdate({ bitmapRendererId: next.id, bitmapRendererSettings: { ...next.defaults }, bitmapRendererPath: undefined });
      }} className="w-full bg-app border border-border-ui rounded px-1.5 py-1 text-xs text-content focus:border-accent outline-none">
        {bitmapRenderers.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select>
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