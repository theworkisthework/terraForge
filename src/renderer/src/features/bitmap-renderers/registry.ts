import type { BitmapPluginManifest } from "../../../../../types";
import { spiralAmplitudeRenderer } from "./spiralAmplitude";
import type { BitmapRendererDefinition } from "./types";

/** In-tree renderers, shipped in the app bundle. */
export const bitmapRenderers: BitmapRendererDefinition[] = [spiralAmplitudeRenderer];

/** Wraps an installed plugin's manifest into the same definition shape an in-tree renderer uses. */
export function pluginRendererFromManifest(manifest: BitmapPluginManifest): BitmapRendererDefinition {
  return {
    id: manifest.id,
    label: manifest.label,
    defaults: manifest.defaults,
    fields: manifest.fields,
    render: (luminance, settings, baseScale) =>
      window.terraForge.bitmapPlugins.render(manifest.id, luminance, settings, baseScale),
  };
}

/**
 * Strict lookup for an already-chosen renderer id — used wherever a bitmap
 * import references a specific renderer (properties panel, materialization).
 * Returns undefined rather than silently substituting a different renderer,
 * since a plugin id can go missing (uninstalled) after a bitmap was created
 * with it — silently swapping in spiral-amplitude would quietly change the
 * import's geometry instead of surfacing the problem.
 */
export function findBitmapRenderer(
  id: string | undefined,
  pluginManifests: BitmapPluginManifest[] = [],
): BitmapRendererDefinition | undefined {
  if (!id) return undefined;
  const inTree = bitmapRenderers.find((renderer) => renderer.id === id);
  if (inTree) return inTree;
  const manifest = pluginManifests.find((entry) => entry.id === id);
  return manifest ? pluginRendererFromManifest(manifest) : undefined;
}

/**
 * Defaulting lookup — only appropriate where falling back to spiral-amplitude
 * is actually correct, e.g. picking a renderer for a brand-new bitmap import.
 */
export function getBitmapRenderer(
  id: string | undefined,
  pluginManifests: BitmapPluginManifest[] = [],
): BitmapRendererDefinition {
  return findBitmapRenderer(id, pluginManifests) ?? spiralAmplitudeRenderer;
}
