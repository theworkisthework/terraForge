import type {
  BitmapRendererFieldSchema,
  BitmapRendererIconName,
  BitmapRendererSettings,
  RendererContext,
  RendererOutput,
} from "../../../../types";

// The field-schema contract (BitmapRendererFieldSchema and its number/boolean/
// select variants, BitmapRendererIconName, BitmapLuminance) lives in the
// shared src/types/index.ts because it also has to cross the main/preload/
// renderer IPC boundary for externally-installed plugins (see
// BitmapPluginManifest). Re-exported here so existing renderer-local imports
// don't need to change.
export type {
  RendererSource,
  RendererContext,
  RendererLayer,
  RendererOutput,
  BitmapRendererFieldSchema,
  BitmapRendererIconName,
  BitmapRendererBooleanFieldSchema,
  BitmapRendererNumberFieldSchema,
  BitmapRendererNumberPreset,
  BitmapRendererSelectFieldSchema,
  BitmapRendererSelectOption,
} from "../../../../types";

export interface BitmapRendererDefinition {
  id: string;
  label: string;
  defaults: BitmapRendererSettings;
  /** Settings fields to render in the properties panel, in display order. */
  fields: BitmapRendererFieldSchema[];
  /**
   * Declares that this renderer's closed subpaths are independent shapes —
   * dots — meant to be filled or plot-tapped individually, not one
   * continuous stroke. When set, `materializeBitmapLayers` splits the
   * rendered output into one `SvgPath` per dot (with `hasFill` and a
   * centroid `pointTap`) instead of keeping it as a single stroked path, so
   * the existing hatch-fill and plot-points features work on it unmodified.
   */
  producesDots?: boolean;
  /**
   * Sync for in-tree renderers; an externally-installed plugin's equivalent
   * runs in an isolated sandbox and is always async, so this must accept
   * either.
   */
  render: (context: RendererContext) => RendererOutput | Promise<RendererOutput>;
}
