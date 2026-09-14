import { useEffect, useState } from "react";
import type { BitmapRendererSettings, SvgImport } from "../../../../../types";
import { ErrorBoundary } from "../../../components/ErrorBoundary";
import { useBitmapPluginStore } from "../../../store/bitmapPluginStore";
import { bitmapRenderSignature, materializeBitmapLayers } from "../../bitmap-renderers/bitmapImage";
import {
  bitmapRenderers,
  findBitmapRenderer,
  getBitmapRenderer,
  pluginRendererFromManifest,
} from "../../bitmap-renderers/registry";
import { BitmapSeparationSection } from "./BitmapSeparationSection";
import { RendererFieldControl } from "./RendererFieldControl";

/**
 * How long the settings must stay unchanged before a re-render is worth
 * starting. A render is a round trip into the renderer's sandboxed host, so
 * it should happen once the user has settled on a value rather than for every
 * value they pass through on the way there.
 *
 * This has to outlast the gap between successive presses of a number field's
 * spinner, not just the events of a single slider drag — at 200ms a steadily
 * clicked spinner rendered on every click.
 */
const RENDER_DEBOUNCE_MS = 400;

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

/**
 * How long the rendering state stays on screen *after* the new preview has
 * been painted. A small bitmap renders in a few milliseconds, so without a
 * floor the state exists for a single frame and is never really seen.
 *
 * Measured from after the paint, not from when the render started, because
 * producing the geometry and painting it both block the main thread — and
 * time the thread spends blocked is not time the user can read anything. An
 * earlier version subtracted the elapsed render time from this budget, which
 * meant a slow render spent its whole allowance frozen and left nothing
 * legible afterwards.
 *
 * The *result* is never delayed by this; only the label lingers.
 */
const MIN_RENDERING_VISIBLE_MS = 750;

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
} as const;

type RenderStatus = keyof typeof RENDER_STATUS_LABEL;

export function BitmapRendererSection({ imp, onUpdate }: { imp: SvgImport; onUpdate: (changes: Partial<SvgImport>) => void }) {
  const pluginManifests = useBitmapPluginStore((state) => state.plugins);
  // This panel drives a bitmap, so only offer renderers that can take a source
  // image. A plugin declaring `"source": "none"` is a generator — it would run
  // here and quietly ignore the picture, which is worse than not being listed.
  const allRenderers = [
    ...bitmapRenderers,
    ...pluginManifests.filter((manifest) => manifest.source !== "none").map(pluginRendererFromManifest),
  ];

  // An unset renderer id defaults (new import); a set-but-unresolvable id
  // (e.g. an uninstalled plugin) must surface as missing, not silently
  // fall back to a different renderer.
  const renderer = imp.bitmapRendererId
    ? findBitmapRenderer(imp.bitmapRendererId, pluginManifests)
    : getBitmapRenderer(undefined, pluginManifests);
  const settings = renderer ? { ...renderer.defaults, ...imp.bitmapRendererSettings } : {};

  /**
   * "pending" is the gap between a setting changing and the debounce elapsing.
   * It needs to be distinct from both neighbours: showing nothing there leaves
   * the user unable to tell the change was registered while the preview still
   * shows the old result, and showing "Rendering…" claims work that has not
   * started yet.
   */
  const [renderStatus, setRenderStatus] = useState<RenderStatus>("idle");
  const [renderError, setRenderError] = useState<string | null>(null);

  const renderSignature = bitmapRenderSignature(imp);

  useEffect(() => {
    // The stored output already came from exactly these inputs, so selecting
    // this layer again must not re-run the renderer — for a plugin that is a
    // sandbox round trip, and the write-back would mark the document dirty
    // without changing anything.
    if (imp.bitmapRenderSignature === renderSignature) {
      setRenderStatus("idle");
      setRenderError(null);
      return;
    }

    let cancelled = false;
    // The settings have changed but nothing is running yet: the debounce below
    // is waiting to see whether they change again.
    setRenderStatus("pending");
    setRenderError(null);

    const timer = setTimeout(async () => {
      // The input has now been stable for the debounce interval, so a render
      // really is starting.
      setRenderStatus("rendering");

      // Yield a turn so "rendering" is committed before a synchronous in-tree
      // renderer ties up the thread, and so any click already queued behind
      // this timer is handled first.
      await delay(0);
      if (cancelled) return;

      try {
        const { bitmapRendererPath, paths } = await materializeBitmapLayers(imp);
        if (cancelled) return;

        // Apply the result the moment it exists — only the label waits.
        onUpdate({ bitmapRendererPath, paths, bitmapRenderSignature: renderSignature });

        // A zero delay cannot fire until the thread is free, so this resumes
        // only once the new preview has been committed and painted. Starting
        // the hold here is what makes it legible rather than spent frozen.
        await delay(0);
        if (cancelled) return;

        // Hold the state long enough to be read. This lives here, in the flow
        // that owns the status, rather than in a wrapper reacting to it:
        // anything observing the transition after the fact is racing React's
        // effect flush for a state that existed for a single frame.
        await delay(MIN_RENDERING_VISIBLE_MS);
        if (cancelled) return;
        setRenderStatus("idle");
      } catch (err: unknown) {
        if (cancelled) return;
        // A failure persists on screen, so there is nothing to hold it for.
        setRenderStatus("error");
        setRenderError(err instanceof Error ? err.message : String(err));
      }
    }, RENDER_DEBOUNCE_MS);

    // Doubles as the debounce cancel *and* the "latest request wins" guard —
    // a dependency change before the timer fires, or before the async
    // render settles, marks this run stale so it can't clobber a newer one.
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // renderSignature stands in for every input the render depends on.
    //
    // `imp.bitmapRenderSignature` is deliberately *not* a dependency even
    // though it is read above. This effect writes it on success, so listing it
    // would make the effect re-run on its own write — cancelling the run that
    // is still holding the status, and stomping it back to idle before the
    // user could see it.
  }, [renderSignature]);

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
