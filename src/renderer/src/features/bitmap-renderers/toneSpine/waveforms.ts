import type { BitmapRendererSelectOption } from "../../../../../types";

export type WaveformId = "triangle" | "square" | "sawtooth" | "sine";

export const WAVEFORM_OPTIONS: BitmapRendererSelectOption[] = [
  { value: "triangle", label: "Triangle" },
  { value: "square", label: "Square" },
  { value: "sawtooth", label: "Sawtooth" },
  { value: "sine", label: "Sine" },
];

export const DEFAULT_WAVEFORM: WaveformId = "triangle";

/**
 * Bipolar triangle pulse: one full cycle rises to +1 at a quarter-phase,
 * returns to the baseline at the half, falls to -1 at three-quarters, and
 * returns to the baseline at the end — three baseline crossings per period,
 * matching the original spiral-amplitude tooth shape exactly.
 */
function triangleAt(cycle: number): number {
  if (cycle <= 0.25) return cycle * 4;
  if (cycle <= 0.5) return 2 - cycle * 4;
  if (cycle <= 0.75) return -(cycle - 0.5) * 4;
  return -4 + cycle * 4;
}

/** Bipolar square pulse: +1 for the first half of the cycle, -1 for the second. */
function squareAt(cycle: number): number {
  return cycle < 0.5 ? 1 : -1;
}

/** Bipolar sawtooth: ramps from -1 to +1 across the whole cycle, then resets. */
function sawtoothAt(cycle: number): number {
  return cycle * 2 - 1;
}

function sineAt(cycle: number): number {
  return Math.sin(cycle * Math.PI * 2);
}

/**
 * Kept as a standalone export (rather than folded into `waveformAt`) because
 * it is the one waveform every existing renderer default relied on before
 * waveform became a selectable field, and the spiral-amplitude unit tests
 * assert its exact cross-baseline values.
 */
export function bipolarToothPulse(phase: number): number {
  return triangleAt(phase - Math.floor(phase));
}

/** Bipolar (-1..1) value of the named waveform at a fractional phase. */
export function waveformAt(id: WaveformId, phase: number): number {
  const cycle = phase - Math.floor(phase);
  switch (id) {
    case "square":
      return squareAt(cycle);
    case "sawtooth":
      return sawtoothAt(cycle);
    case "sine":
      return sineAt(cycle);
    case "triangle":
    default:
      return triangleAt(cycle);
  }
}
