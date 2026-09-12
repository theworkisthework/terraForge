import type { BitmapRendererSettings } from "../../../../../types";

export interface BitmapLuminance {
  width: number;
  height: number;
  values: Uint8Array;
}

/**
 * Icon identifiers a renderer's field schema can reference. The properties
 * panel owns the mapping onto actual icon components, so renderer modules
 * stay free of any UI/React dependency.
 */
export type BitmapRendererIconName =
  | "rotate-cw"
  | "rotate-ccw"
  | "arrow-left-right"
  | "arrow-up-down"
  | "flip-horizontal"
  | "flip-vertical";

interface BitmapRendererFieldBase {
  /** Key into the renderer's settings bag. */
  key: string;
  /** Visible field label, e.g. "Spacing (mm)". */
  label: string;
  /** Accessible name for the control; falls back to `label` when omitted. */
  ariaLabel?: string;
}

/** A quick-nudge button shown alongside a number field, e.g. a rotate step. */
export interface BitmapRendererNumberPreset {
  label: string;
  ariaLabel?: string;
  icon?: BitmapRendererIconName;
  /** Added to the field's current value when the preset button is clicked (clamped to min/max). */
  delta: number;
}

export interface BitmapRendererNumberFieldSchema extends BitmapRendererFieldBase {
  type: "number";
  /** Visual widget for the value; defaults to a plain number input. */
  control?: "input" | "slider";
  min: number;
  max: number;
  step: number;
  presets?: BitmapRendererNumberPreset[];
}

export interface BitmapRendererBooleanFieldSchema extends BitmapRendererFieldBase {
  type: "boolean";
}

export interface BitmapRendererSelectOption {
  value: string;
  label: string;
  icon?: BitmapRendererIconName;
}

export interface BitmapRendererSelectFieldSchema extends BitmapRendererFieldBase {
  type: "select";
  /** Visual widget for the choice; defaults to a dropdown. "icon-buttons" renders
   * `options` as a row of toggle buttons — e.g. a horizontal/vertical switch. */
  control?: "dropdown" | "icon-buttons";
  options: BitmapRendererSelectOption[];
}

/** Describes one control a renderer wants surfaced in the properties panel. */
export type BitmapRendererFieldSchema =
  | BitmapRendererNumberFieldSchema
  | BitmapRendererBooleanFieldSchema
  | BitmapRendererSelectFieldSchema;

export interface BitmapRendererDefinition {
  id: string;
  label: string;
  defaults: BitmapRendererSettings;
  /** Settings fields to render in the properties panel, in display order. */
  fields: BitmapRendererFieldSchema[];
  render: (
    luminance: BitmapLuminance,
    settings: BitmapRendererSettings,
    baseScale: number,
  ) => string;
}
