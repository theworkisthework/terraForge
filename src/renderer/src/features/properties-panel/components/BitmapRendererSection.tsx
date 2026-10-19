import type { BitmapRendererSettings, SvgImport } from "../../../../../types";
import { ErrorBoundary } from "../../../components/ErrorBoundary";
import { useRendererPluginStore } from "../../../store/rendererPluginStore";
import { bitmapRendererStamp, bitmapRenderSignature, bitmapSurface } from "../../bitmap-renderers/bitmapImage";
import { useCanvasStore } from "../../../store/canvasStore";
import { pageColors } from "../../../utils/paper";
import { rerenderBitmap, useBitmapRenderState } from "../../bitmap-renderers/bitmapRenderService";
import { rendererSettings } from "../../bitmap-renderers/coerceSettings";
import {
  bitmapRenderers,
  findBitmapRenderer,
  getBitmapRenderer,
  pluginRendererFromManifest,
} from "../../bitmap-renderers/registry";
import { BitmapSeparationSection } from "./BitmapSeparationSection";
import { BitmapToneSection } from "./BitmapToneSection";
import { RendererFieldControl } from "./RendererFieldControl";

/**
 * What the status line says in each state. Every state is named, including
 * the resting one: a blank label is indistinguishable from "this panel has no
 * status to give". The "Status:" prefix is carried in each label because
 * without it a bare word sitting next to the "Renderer" heading reads as a
 * description of the renderer rather than of what it is currently doing.
 */
const RENDER_STATUS_LABEL = {
  idle: "Status: Ready",
  pending: "Status: Pending",
  rendering: "Status: Rendering",
  error: "Status: Failed",
  outdated: "Status: Renderer updated",
} as const;

export function BitmapRendererSection({ imp, onUpdate }: { imp: SvgImport; onUpdate: (changes: Partial<SvgImport>) => void }) {
  const pluginManifests = useRendererPluginStore((state) => state.plugins);
  // This panel drives a bitmap, so only offer renderers that can take a source
  // image. A plugin declaring `"source": "none"` is a generator — it would run
  // here and quietly ignore the picture, which is worse than not being listed.
  const allRenderers = [
    ...bitmapRenderers,
    ...pluginManifests
      // Discovery rejects ids that could clash with a built-in; this guards the
      // list regardless, since a duplicate would also break its React keys.
      .filter((manifest) => !bitmapRenderers.some((r) => r.id === manifest.id))
      .map(pluginRendererFromManifest),
  ].filter((renderer) => renderer.source !== "none");

  // An unset renderer id defaults (new import); a set-but-unresolvable id
  // (e.g. an uninstalled plugin) must surface as missing, not silently
  // fall back to a different renderer.
  const renderer = imp.bitmapRendererId
    ? findBitmapRenderer(imp.bitmapRendererId, pluginManifests)
    : getBitmapRenderer(undefined, pluginManifests);
  // Shown exactly as the renderer will receive them, so an out-of-range or
  // missing saved value displays as the value actually being rendered.
  const settings = renderer ? rendererSettings(renderer, imp.bitmapRendererSettings) : {};

  // Rendering itself is owned by the bitmap render service, not this panel,
  // so a change still renders if the import is deselected before it lands.
  const { status: serviceStatus, error: renderError } = useBitmapRenderState(imp.id);
  const pageTemplate = useCanvasStore((state) => state.pageTemplate);
  const page = pageColors(pageTemplate);

  // Output whose settings are current but which an older version of the
  // renderer produced. It is not replaced automatically — that would change
  // geometry the user has already seen without them touching anything — so
  // it is offered as a re-render instead, and plots as shown until then.
  const outdated =
    !!renderer &&
    serviceStatus === "idle" &&
    imp.bitmapRenderSignature === bitmapRenderSignature(imp, bitmapSurface(imp.bitmapSeparationMode, page)) &&
    imp.bitmapRendererVersion !== bitmapRendererStamp(renderer, imp.bitmapSeparationMode);
  const renderStatus: keyof typeof RENDER_STATUS_LABEL = outdated ? "outdated" : serviceStatus;

  /**
   * Deliberately leaves the existing geometry in place. The stored output is
   * stale the moment a setting changes, but blanking it made the preview
   * vanish on every spinner click and reappear a moment later. Holding the
   * previous render until the new one arrives — with the "Rendering…" note
   * above for honesty — is steadier, and the signature check already
   * guarantees the re-render happens without needing the output cleared to
   * trigger it.
   *
   * Switching renderer or separation mode still clears, because there the old
   * geometry is not a slightly-out-of-date version of the new geometry, it is
   * a different kind of thing.
   */
  const updateSettings = (changes: BitmapRendererSettings) =>
    onUpdate({ bitmapRendererSettings: { ...settings, ...changes } });

  return (
    <div className="mb-2 pb-2 border-b border-border-ui/30">
      {/*
        The render status sits in the heading row rather than on a line of its
        own. A line that appears and disappears between the dropdown and the
        field controls pushes those controls down and back on every render,
        moving a number spinner out from under the cursor mid-click. Here it
        occupies space that already exists and can never displace anything.
        `role="status"` keeps the element in the tree in every state, so it is
        announced politely and stays findable rather than being added and
        removed.
      */}
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <label className="text-[10px] text-content-muted uppercase tracking-wider" htmlFor={`bitmap-renderer-${imp.id}`}>Renderer</label>
        <span
          role="status"
          aria-live="polite"
          className={`text-[10px] truncate ${renderStatus === "error" ? "text-red-400" : "text-content-muted"}`}
        >
          {renderer ? RENDER_STATUS_LABEL[renderStatus] : ""}
        </span>
      </div>
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

      {renderer && (
        // Keyed on the renderer so switching to another one remounts the
        // boundary — otherwise a plugin that broke its controls would keep
        // showing the fallback after the user had already moved off it.
        <ErrorBoundary
          key={renderer.id}
          fallback={() => (
            <p className="mt-1.5 text-[10px] text-red-400">
              This renderer&apos;s controls couldn&apos;t be displayed. Pick another renderer above.
            </p>
          )}
        >
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
        </ErrorBoundary>
      )}
      {/*
        Below the controls deliberately: a failure message wraps to an
        unpredictable number of lines, and anything variable-height has to sit
        after the controls so that it never moves them when it appears.
      */}
      {renderer && renderStatus === "error" && (
        <p className="mt-1.5 text-[10px] text-red-400">Render failed: {renderError}</p>
      )}
      {renderer && renderStatus !== "error" && imp.bitmapRenderWarnings?.map((warning) => (
        <p key={warning} className="mt-1.5 text-[10px] text-amber-400">
          {warning}
        </p>
      ))}
      {outdated && (
        <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[10px] text-content-muted">
          <span>This renderer has changed since this image was rendered.</span>
          <button
            type="button"
            onClick={() => void rerenderBitmap(imp.id)}
            className="shrink-0 text-accent hover:underline"
          >
            Re-render
          </button>
        </div>
      )}
      {renderer && <BitmapToneSection imp={imp} onUpdate={onUpdate} />}
      {renderer && <BitmapSeparationSection imp={imp} onUpdate={onUpdate} canOffset={renderer.inkOffset === true} />}
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
