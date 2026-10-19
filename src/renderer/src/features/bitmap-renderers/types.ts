import type {
  RendererPluginManifest,
  BitmapRendererFieldSchema,
  BitmapRendererSettings,
  RendererContext,
  RendererOutput,
} from "../../../../types";

/** A renderer as the app uses it — in-tree, or built from a plugin's manifest. */
export interface BitmapRendererDefinition {
  id: string;
  label: string;
  /**
   * Whether it needs a source image — the same declaration a plugin makes in
   * its manifest. Only renderers that can take one are offered for a bitmap.
   */
  source: NonNullable<RendererPluginManifest["source"]>;
  /**
   * Whether it offsets each separated ink's pattern when asked
   * (`RendererContext.ink.offset`) — the same declaration a plugin makes in
   * its manifest. "Offset each ink" is offered only when it does.
   */
  inkOffset?: boolean;
  defaults: BitmapRendererSettings;
  /**
   * Settings keys this renderer has renamed, old → new. Applied when saved
   * settings are read (`rendererSettings`), so a drawing saved under the old
   * key keeps its value rather than falling back to the default.
   */
  renamedSettings?: Record<string, string>;
  /**
   * Identifies this renderer's output behaviour. Change it whenever the same
   * settings would now produce different geometry — an algorithm fix, a new
   * default curve — so drawings rendered with the old behaviour are offered a
   * re-render instead of silently keeping, or silently losing, what the user
   * saw. Compared for equality only. Plugins get theirs from a hash of their
   * source (`RendererPluginManifest.sourceHash`).
   */
  version: string;
  /** Settings fields to render in the properties panel, in display order. */
  fields: BitmapRendererFieldSchema[];
  /**
   * Sync for in-tree renderers; an externally-installed plugin's equivalent
   * runs in an isolated sandbox and is always async, so this must accept
   * either.
   */
  render: (context: RendererContext) => RendererOutput | Promise<RendererOutput>;
}
