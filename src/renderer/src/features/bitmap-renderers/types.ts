import type {
  BitmapLuminance,
  BitmapRendererFieldSchema,
  BitmapRendererIconName,
  BitmapRendererSettings,
} from "../../../../../types";

// The field-schema contract (BitmapRendererFieldSchema and its number/boolean/
// select variants, BitmapRendererIconName, BitmapLuminance) lives in the
// shared src/types/index.ts because it also has to cross the main/preload/
// renderer IPC boundary for externally-installed plugins (see
// BitmapPluginManifest). Re-exported here so existing renderer-local imports
// don't need to change.
export type {
  BitmapLuminance,
  BitmapRendererFieldSchema,
  BitmapRendererIconName,
  BitmapRendererBooleanFieldSchema,
  BitmapRendererNumberFieldSchema,
  BitmapRendererNumberPreset,
  BitmapRendererSelectFieldSchema,
  BitmapRendererSelectOption,
} from "../../../../../types";

export interface BitmapRendererDefinition {
  id: string;
  label: string;
  defaults: BitmapRendererSettings;
  /** Settings fields to render in the properties panel, in display order. */
  fields: BitmapRendererFieldSchema[];
  /**
   * Sync for in-tree renderers; an externally-installed plugin's equivalent
   * runs in an isolated process and is always async, so this must accept
   * either.
   */
  render: (
    luminance: BitmapLuminance,
    settings: BitmapRendererSettings,
    baseScale: number,
  ) => string | Promise<string>;
}
