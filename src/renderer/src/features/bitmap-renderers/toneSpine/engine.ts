import type { RendererSource } from "../../../../../types";
import { clipLineToRect } from "./lineFamily";
import { luminanceAt } from "./sampling";
import { waveformAt, type WaveformId } from "./waveforms";

/** A point on a spine's unmodulated base curve, plus the outward unit normal
 * amplitude is displaced along at that point. */
export interface SpineSample {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/** One continuous stroke of a spine — a spiral is a single strand; rings,
 * raster rows, and box loops each contribute one strand per line/ring/box. */
export type SpineStrand = SpineSample[];

export interface ToneModulationOptions {
  /** Arc-length (in the same units as the sample coordinates) of one waveform cycle. */
  toothWidth: number;
  /** Peak displacement along the normal, before scaling by tone and the waveform. */
  amplitude: number;
  waveform: WaveformId;
  image: RendererSource;
  /**
   * When true (the default when omitted), a displaced point is clamped back
   * into the image bounds. When false, the wobble can push geometry past the
   * image edge by (at most) the amplitude setting. Either way, a base point
   * outside the image breaks the path rather than drawing through it: the
   * spine generators deliberately reach the image's farthest corner, so
   * drawing it outside the image would add whole areas of unmodulated
   * geometry beyond the picture, not just an amplitude's worth of overflow. There's a real trade-off either way — clamping can flatten a
   * sharp waveform peak (most visible on sawtooth) into a flat edge right
   * where the render reaches the image boundary, which every circular/
   * spiral renderer's outer edge does by design — so this is exposed as a
   * user setting rather than picked once for every renderer.
   */
  clipToImage?: boolean;
  /**
   * Waveform peak clipping, as a percentage (1–100; 100 — the default when
   * omitted — is unclipped). A different feature from `clipToImage`: this
   * shapes the waveform itself, independent of the image boundary, the way
   * audio clipping/distortion does — below 100 the peak reaches full height
   * sooner (the ramp gets proportionally steeper) and then holds flat there
   * instead of coming to a point, so e.g. a sawtooth's tip reads as chopped
   * rather than sharp. Applied as `clamp(value / (pct / 100), -1, 1)` to the
   * waveform's bipolar (-1..1) value before it's scaled by tone and
   * amplitude, so at 100% `value / 1` is already in range and clamping is a
   * no-op — today's exact shape.
   */
  peakClipPct?: number;
  /**
   * How much faster the waveform cycles where the image is dark: a fully
   * dark area runs at `1 + frequencyGain` times the light-area rate, so tone
   * drives frequency as well as amplitude and dark regions read as busier
   * rather than just bigger — closer to hand-engraved tone lines. 0 keeps
   * the tooth width fixed everywhere. Defaults to `DEFAULT_FREQUENCY_GAIN`.
   */
  frequencyGain?: number;
}

/**
 * Bump whenever an engine change alters the geometry produced for the same
 * inputs; every tone-spine renderer's `version` includes it, so drawings
 * rendered by an older engine are offered a re-render.
 *
 * 2: strokes start and end at the strand ends and image edges, and never
 *    draw the spine outside the image.
 * 3: no internal tone smoothing, levels or contrast — the pipeline shapes
 *    the source instead (see `toneAdjust.ts`).
 * 4: one point budget per render across all strands (`MAX_RENDER_POINTS`).
 * 5: no separate per-strand cap — a dense single strand (a spiral) is no
 *    longer cut short below the render budget.
 */
export const TONE_SPINE_ENGINE_VERSION = 5;

function format(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/**
 * How many samples per cycle sine — the only genuinely curved waveform —
 * needs to look smooth rather than faceted. Nothing else uses this: see
 * `BREAKPOINT_PHASES` below for why every other waveform needs no regular
 * sampling at all.
 */
const SINE_SAMPLES_PER_CYCLE = 24;

/**
 * Phases within a cycle where a waveform's *value* jumps rather than
 * varying smoothly. `waveformAt` is right-continuous at each of these (see
 * its square/sawtooth cases), so sampling it exactly at the phase gives the
 * value just *after* the jump, and sampling an instant earlier gives the
 * value just *before* — emitting both, at (as near as makes no visual
 * difference) the same position, renders a sharp vertical edge instead of a
 * diagonal.
 */
const JUMP_PHASES: Record<WaveformId, number[]> = {
  triangle: [],
  sine: [],
  sawtooth: [0],
  square: [0, 0.5],
};

/**
 * Phases within a cycle where a waveform's *slope* changes but its value
 * stays continuous — triangle's corners. Together with `JUMP_PHASES`, these
 * are the points where every piecewise-linear waveform (everything except
 * sine) needs an exact drawn point; between consecutive points of either
 * kind the waveform is perfectly linear, so the engine draws one straight
 * line connecting them instead of following however many points the base
 * spine happens to produce along the way (see the `isPiecewiseLinear`
 * branch in `modulateStrand`) — without that, a long straight-seeming ramp
 * (sawtooth's especially, since its one ramp spans a full cycle) gets drawn
 * as several intermediate points, each displaced along its own
 * locally-rotating normal, visibly bowing what should read as one straight
 * tooth wherever the base spine curves tightly (a spiral's centre, a small
 * circular ring). Both empty for sine: it has no breakpoints at all, so it
 * always falls through to regular dense sampling instead.
 */
const SLOPE_PHASES: Record<WaveformId, number[]> = {
  triangle: [0, 0.25, 0.5, 0.75],
  sine: [],
  sawtooth: [],
  square: [],
};

/**
 * Each piecewise-linear waveform's breakpoints as `{ phase, value }` pairs
 * spanning exactly one cycle (0 to 1) — used only to derive the *extra*
 * breakpoints peak-clipping needs (see `peakClipBreakpointPhases` below).
 * Square is omitted: its value never leaves ±1, so there's no intermediate
 * value for peak-clipping to ever saturate — it was already a no-op for
 * square before piecewise-linear drawing, and stays one now.
 */
const BREAKPOINT_VALUES: Partial<Record<WaveformId, { phase: number; value: number }[]>> = {
  triangle: [
    { phase: 0, value: 0 },
    { phase: 0.25, value: 1 },
    { phase: 0.5, value: 0 },
    { phase: 0.75, value: -1 },
    { phase: 1, value: 0 },
  ],
  sawtooth: [
    { phase: 0, value: -1 },
    { phase: 1, value: 1 },
  ],
};

/**
 * The exact phases, within one cycle, where peak-clipping (`drive < 1`)
 * makes a piecewise-linear waveform's ramp first reach ±1 and flatten.
 * Without these as real breakpoints, peak-clipping would have nothing left
 * to visibly affect: it only ever changed *intermediate* waveform values,
 * and piecewise-linear waveforms now draw only at their own breakpoints —
 * which for triangle are exactly 0 and ±1 already, and for sawtooth are a
 * single value jump — so peak-clipping needs to introduce new breakpoints
 * of its own to have anywhere left to act. Each is a slope change, not a
 * value jump: the clipped shape is still continuous there, just bends.
 * Found by linear interpolation within each known breakpoint-to-breakpoint
 * segment, since every segment here is a straight line between two known
 * values. Returns `[]` at `drive >= 1` (unclipped) or for a waveform with
 * no entry in `BREAKPOINT_VALUES` (square, sine).
 */
function peakClipBreakpointPhases(waveform: WaveformId, drive: number): number[] {
  if (drive >= 1) return [];
  const segments = BREAKPOINT_VALUES[waveform];
  if (!segments) return [];
  const phases: number[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i];
    const b = segments[i + 1];
    for (const threshold of [drive, -drive]) {
      if ((threshold - a.value) * (threshold - b.value) < 0) {
        const t = (threshold - a.value) / (b.value - a.value);
        phases.push(a.phase + (b.phase - a.phase) * t);
      }
    }
  }
  return phases;
}

/**
 * The default for `ToneModulationOptions.frequencyGain`: in a fully dark
 * area the waveform cycles three times as fast as in a fully light one.
 */
export const DEFAULT_FREQUENCY_GAIN = 2;

/**
 * The most points one whole render may draw, across all its strands — the
 * only point limit. It stops a runaway render early, keeping what was drawn
 * and saying so, well inside the path-length check (at roughly a dozen
 * characters a point). There is deliberately no separate per-strand cap: it
 * cut a dense spiral — one strand — short while rings at the same density,
 * spread over many strands, drew in full.
 */
export const MAX_RENDER_POINTS = 3_000_000;

/** Points still available to a render, shared by all its strands. */
interface PointBudget {
  remaining: number;
  truncated: boolean;
}

const DISCONTINUITY_EPSILON = 1e-4;

function interpolateSample(a: SpineSample, b: SpineSample, t: number): SpineSample {
  const nx = a.nx + (b.nx - a.nx) * t;
  const ny = a.ny + (b.ny - a.ny) * t;
  const length = Math.hypot(nx, ny) || 1;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    nx: nx / length,
    ny: ny / length,
  };
}

function isInsideBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && x <= width && y >= 0 && y <= height;
}

/** Fraction (0–1) of the way from `outside` to `inside` at which the segment
 * between them enters the `[0,width] x [0,height]` image rectangle. */
function entryFraction(outside: SpineSample, inside: SpineSample, width: number, height: number): number {
  const range = clipLineToRect(outside, { x: inside.x - outside.x, y: inside.y - outside.y }, width, height);
  return range ? Math.max(0, Math.min(1, range[0])) : 0;
}

/** Fraction (0–1) of the way from `inside` to `outside` at which the segment
 * between them leaves the `[0,width] x [0,height]` image rectangle. */
function exitFraction(inside: SpineSample, outside: SpineSample, width: number, height: number): number {
  const range = clipLineToRect(inside, { x: outside.x - inside.x, y: outside.y - inside.y }, width, height);
  return range ? Math.max(0, Math.min(1, range[1])) : 0;
}

/** Breakpoint phases (`n + offset` for integer `n`, for each `offset` in
 * `phases`) strictly after `phaseBefore` and at or before `phaseAfter`.
 * Phase advances at a tone-dependent, path-history-dependent rate rather
 * than a closed-form function of arc length, so crossings are found
 * reactively per visit instead of precomputed in advance. */
function breakpointCrossings(phaseBefore: number, phaseAfter: number, phases: number[]): number[] {
  const crossings: number[] = [];
  for (const offset of phases) {
    let n = Math.floor(phaseBefore - offset) + 1;
    let boundary = n + offset;
    while (boundary <= phaseAfter) {
      crossings.push(boundary);
      n++;
      boundary = n + offset;
    }
  }
  return crossings.sort((a, b) => a - b);
}

/**
 * Walks one strand's base points and continuously samples source tone at
 * every visited point — rather than once per cycle — so tone can drive the
 * waveform's phase rate as well as its amplitude: a darker point both
 * displaces more and oscillates faster, the "busier where it's darker" look
 * a fixed-frequency wobble can't produce. A base point outside the image's
 * own bounds is skipped (phase stays frozen while invisible, so the wobble
 * resumes smoothly on re-entry) and breaks the path into a new `M`. When
 * `options.clipToImage` is true, a point that is inside also has its
 * displaced position clamped back into bounds, so the wobble itself never
 * pushes geometry past the image edge; when false, it may overflow by up to
 * the amplitude — see `ToneModulationOptions.clipToImage`.
 *
 * For a piecewise-linear waveform (triangle/square/sawtooth —
 * `JUMP_PHASES`/`SLOPE_PHASES`, plus any extra phases peak-clipping adds),
 * only breakpoints and the points where the stroke starts, enters or leaves
 * the image, and ends are ever drawn: every base
 * point in between is still visited (so tone/phase tracking stays
 * continuous), just not drawn, so consecutive breakpoints are connected by
 * one straight line rather than however many points the base spine happens
 * to produce along the way. Sine (no breakpoints) keeps the dense regular
 * sub-sampling below instead, since it's the one waveform that's genuinely
 * curved rather than straight between fixed points.
 *
 * Returns one `M...L L L...` path substring (with possible internal `M`
 * breaks), or "" for a strand too short to draw.
 */
export function modulateStrand(points: SpineStrand, options: ToneModulationOptions, budget?: PointBudget): string {
  if (points.length === 0) return "";
  const pointLimit = budget?.remaining ?? MAX_RENDER_POINTS;
  const {
    toothWidth,
    amplitude,
    waveform,
    image,
    clipToImage = true,
    peakClipPct = 100,
    frequencyGain = DEFAULT_FREQUENCY_GAIN,
  } = options;
  // 1–100%: dividing by a smaller drive pushes the raw -1..1 waveform value
  // past ±1 sooner, so the subsequent clamp flattens it there instead of
  // letting it reach a point — the audio-clipping-style shaping described
  // on `ToneModulationOptions.peakClipPct`.
  const peakClipDrive = Math.max(0.01, Math.min(1, peakClipPct / 100));
  const safeToothWidth = Math.max(toothWidth, 1e-6);
  const jumpPhases = JUMP_PHASES[waveform] ?? [];
  // Peak-clipping's own breakpoints are always slope changes (the shape
  // stays continuous there, just bends), merged alongside the waveform's
  // own slope breakpoints — never the jump list, regardless of waveform.
  const slopePhases = [...(SLOPE_PHASES[waveform] ?? []), ...peakClipBreakpointPhases(waveform, peakClipDrive)];
  const isPiecewiseLinear = jumpPhases.length > 0 || slopePhases.length > 0;
  // Only relevant for sine: every other waveform draws solely at its own
  // breakpoints (see the doc comment above), so this sub-stepping is never
  // reached for them.
  const maxSubStep = safeToothWidth / SINE_SAMPLES_PER_CYCLE;

  const commands: string[] = [];
  let broken = true;
  let phase = 0;

  const pushPoint = (base: SpineSample, toneDark: number, atPhase: number) => {
    const shapedValue = Math.max(-1, Math.min(1, waveformAt(waveform, atPhase) / peakClipDrive));
    const displacement = amplitude * toneDark * shapedValue;
    const rawX = base.x + displacement * base.nx;
    const rawY = base.y + displacement * base.ny;
    const x = clipToImage ? Math.min(image.width, Math.max(0, rawX)) : rawX;
    const y = clipToImage ? Math.min(image.height, Math.max(0, rawY)) : rawY;
    commands.push(`${broken ? "M" : "L"}${format(x)} ${format(y)}`);
    broken = false;
  };

  /**
   * Visits one base sample; returns false once the strand's point budget is
   * spent. `segmentStart` is the previous sample the walk is coming from
   * (a base point, or for sine a sub-step). It locates where a stroke
   * re-enters the image, and for a piecewise-linear waveform places each
   * breakpoint crossing at its
   * actual fractional position along the segment (by phase, which advances
   * linearly across it) rather than at `base` itself — without that, a
   * segment spanning several waveform cycles (coarse spine spacing relative
   * to `toothWidth`, e.g. a grid renderer's cell edges) would draw every one
   * of those cycles' breakpoints on top of `base`, fanning them out into a
   * zigzag star instead of tracing separate teeth along the segment. `null`
   * for the strand's very first sample, which has no preceding point.
   */
  const visit = (
    segmentStart: SpineSample | null,
    base: SpineSample,
    subArcLength: number,
    isFinal: boolean,
  ): boolean => {
    // The image is the extent of the picture, so a base point outside it is
    // never drawn, whatever `clipToImage` says — see that option.
    if (!isInsideBounds(base.x, base.y, image.width, image.height)) {
      if (!broken && segmentStart) {
        // Leaving the image: finish the stroke exactly at the edge rather than
        // at the last sample inside it, which can fall up to a whole segment
        // short. Clamped so rounding can never put the exit point outside and
        // send it back through this branch.
        const fraction = exitFraction(segmentStart, base, image.width, image.height);
        const exit = interpolateSample(segmentStart, base, fraction);
        exit.x = Math.min(image.width, Math.max(0, exit.x));
        exit.y = Math.min(image.height, Math.max(0, exit.y));
        if (!visit(segmentStart, exit, subArcLength * fraction, true)) return false;
      }
      broken = true;
      return true;
    }
    // Tone arrives already shaped — smoothed, levelled, contrasted — by the
    // pipeline's source preparation, so it is used exactly as sampled.
    const toneDark = 1 - luminanceAt(image, base.x, base.y) / 255;
    let walkedFrom = segmentStart;
    let walkedLength = subArcLength;
    if (broken && (isPiecewiseLinear || segmentStart)) {
      // A piecewise-linear waveform otherwise draws nothing until its first
      // breakpoint — up to a whole tooth for sawtooth — leaving every strand
      // short at its start and every closed ring with a gap. So the point the
      // stroke (re)starts from is drawn explicitly: the strand's first point,
      // or, re-entering the image, where this segment crosses into it. (Sine
      // already draws every sample, so it only needs the re-entry point.)
      let startPoint = base;
      if (segmentStart) {
        const fraction = entryFraction(segmentStart, base, image.width, image.height);
        startPoint = interpolateSample(segmentStart, base, fraction);
        walkedFrom = startPoint;
        walkedLength = subArcLength * (1 - fraction);
      }
      pushPoint(startPoint, toneDark, phase);
      if (commands.length >= pointLimit) return false;
    }
    const phaseBefore = phase;
    phase += (walkedLength / safeToothWidth) * (1 + frequencyGain * toneDark);
    const phaseSpan = phase - phaseBefore;
    const crossings = [
      ...breakpointCrossings(phaseBefore, phase, jumpPhases).map((boundary) => ({ boundary, isJump: true })),
      ...breakpointCrossings(phaseBefore, phase, slopePhases).map((boundary) => ({ boundary, isJump: false })),
    ].sort((a, b) => a.boundary - b.boundary);
    for (const crossing of crossings) {
      const t = phaseSpan > 0 ? Math.max(0, Math.min(1, (crossing.boundary - phaseBefore) / phaseSpan)) : 1;
      const position = walkedFrom ? interpolateSample(walkedFrom, base, t) : base;
      if (crossing.isJump) {
        pushPoint(position, toneDark, crossing.boundary - DISCONTINUITY_EPSILON);
        if (commands.length >= pointLimit) return false;
      }
      pushPoint(position, toneDark, crossing.boundary);
      if (commands.length >= pointLimit) return false;
    }
    if (!isPiecewiseLinear || isFinal) {
      pushPoint(base, toneDark, phase);
    }
    return commands.length < pointLimit;
  };

  if (!visit(null, points[0], 0, points.length === 1)) {
    if (budget) {
      budget.remaining -= commands.length;
      budget.truncated = true;
    }
    return commands.join(" ");
  }

  outer: for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const point = points[index];
    const segmentLength = Math.hypot(point.x - previous.x, point.y - previous.y);
    if (segmentLength === 0) continue;
    const isLastSegment = index === points.length - 1;

    if (isPiecewiseLinear) {
      // One visit per base segment is enough: a breakpoint crossing is
      // placed at its exact fractional position along this segment (see
      // `visit`'s `segmentStart` param) regardless of how coarse this outer
      // step is — only the *drawn* resolution depends on sub-stepping, and a
      // piecewise-linear waveform draws nothing extra between breakpoints
      // anyway.
      if (!visit(previous, point, segmentLength, isLastSegment)) break outer;
    } else {
      const subStepCount = Math.max(1, Math.ceil(segmentLength / maxSubStep));
      const subArcLength = segmentLength / subStepCount;
      let subStart = previous;
      for (let step = 1; step <= subStepCount; step++) {
        const sample = interpolateSample(previous, point, step / subStepCount);
        if (!visit(subStart, sample, subArcLength, isLastSegment && step === subStepCount)) break outer;
        subStart = sample;
      }
    }
  }

  if (budget) {
    budget.remaining -= commands.length;
    if (commands.length >= pointLimit) budget.truncated = true;
  }
  return commands.join(" ");
}

export interface ToneSpineOutput {
  /** Every strand's modulated path, joined into one multi-subpath `d`. */
  d: string;
  /** Whether a point limit cut the output short. */
  truncated: boolean;
}

/** Modulates every strand within one shared point budget — `MAX_RENDER_POINTS`
 * unless a smaller one is given (tests use that to exercise the limit without
 * drawing millions of points). */
export function renderToneSpine(
  strands: Iterable<SpineStrand>,
  options: ToneModulationOptions,
  maxPoints = MAX_RENDER_POINTS,
): ToneSpineOutput {
  const budget: PointBudget = { remaining: maxPoints, truncated: false };
  const segments: string[] = [];
  for (const strand of strands) {
    if (budget.remaining <= 0) {
      budget.truncated = true;
      break;
    }
    const segment = modulateStrand(strand, options, budget);
    if (segment) segments.push(segment);
  }
  return { d: segments.join(" "), truncated: budget.truncated };
}
