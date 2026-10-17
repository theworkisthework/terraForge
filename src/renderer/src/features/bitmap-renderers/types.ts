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
  RendererDot,
  RendererResult,
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
  /**
   * Identifies this renderer's output behaviour. Change it whenever the same
   * settings would now produce different geometry — an algorithm fix, a new
   * default curve — so drawings rendered with the old behaviour are offered a
   * re-render instead of silently keeping, or silently losing, what the user
   * saw. Compared for equality only. Plugins get theirs from a hash of their
   * source (`BitmapPluginManifest.sourceHash`).
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
