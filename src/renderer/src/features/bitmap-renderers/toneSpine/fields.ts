import type { BitmapRendererSelectFieldSchema } from "../../../../../types";
import { WAVEFORM_OPTIONS } from "./waveforms";

/** The waveform picker every tone-spine renderer shares. */
export function waveformField(): BitmapRendererSelectFieldSchema {
  return { type: "select", key: "waveform", label: "Waveform", options: WAVEFORM_OPTIONS };
}
