import type { RendererPluginManifest } from "../../../../types";
import { circularRingsRenderer } from "./circularRings";
import { concentricBoxesRenderer } from "./concentricBoxes";
import { concentricPolygonsRenderer } from "./concentricPolygons";
import { dotHalftoneRenderer } from "./dotHalftone";
import { isometricGridRenderer } from "./isometricGrid";
import { renderPlugin } from "./pluginRender";
import { radialBurstRenderer } from "./radialBurst";
import { rasterLinesRenderer } from "./rasterLines";
import { spiralAmplitudeRenderer } from "./spiralAmplitude";
import type { BitmapRendererDefinition } from "./types";

/** In-tree renderers, shipped in the app bundle. */
export const bitmapRenderers: BitmapRendererDefinition[] = [
  spiralAmplitudeRenderer,
  circularRingsRenderer,
  rasterLinesRenderer,
  concentricBoxesRenderer,
  concentricPolygonsRenderer,
  radialBurstRenderer,
  isometricGridRenderer,
  dotHalftoneRenderer,
];

/** One definition per manifest object: a manifest is replaced, never edited,
 * when plugins are rescanned, so its identity is a safe cache key — and the
 * panel looks renderers up on every render. */
const pluginDefinitions = new WeakMap<RendererPluginManifest, BitmapRendererDefinition>();

/** Wraps an installed plugin's manifest into the same definition shape an in-tree renderer uses. */
export function pluginRendererFromManifest(manifest: RendererPluginManifest): BitmapRendererDefinition {
  let definition = pluginDefinitions.get(manifest);
  if (!definition) {
    definition = buildPluginDefinition(manifest);
    pluginDefinitions.set(manifest, definition);
  }
  return definition;
}

function buildPluginDefinition(manifest: RendererPluginManifest): BitmapRendererDefinition {
  return {
    id: manifest.id,
    label: manifest.label,
    source: manifest.source ?? "required",
    inkOffset: manifest.inkOffset === true,
    version: `plugin:${manifest.sourceHash ?? "unknown"}`,
    defaults: manifest.defaults,
    fields: manifest.fields,
    render: (context) => renderPlugin(manifest.id, context),
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
  pluginManifests: RendererPluginManifest[] = [],
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
  pluginManifests: RendererPluginManifest[] = [],
): BitmapRendererDefinition {
  return findBitmapRenderer(id, pluginManifests) ?? spiralAmplitudeRenderer;
}
