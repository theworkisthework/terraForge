import type { RendererSource } from "../../../../../types";
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
}

function format(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/**
 * How many waveform samples to take per tooth-width cycle, between whatever
 * spine points a spine module already generates (those are spaced for the
 * geometry's own curvature, at up to 4 per cycle — exactly enough for
 * triangle's corners, too coarse for a curve like sine to look smooth). Flat
 * or discontinuous waveforms don't need extra resolution of their own —
 * square and sawtooth get their crisp edges from `DISCONTINUITY_PHASES`
 * below instead of from sample density.
 */
const SAMPLES_PER_CYCLE: Record<WaveformId, number> = {
  triangle: 4,
  square: 4,
  sawtooth: 4,
  sine: 24,
};

/**
 * Phases within a cycle where a waveform jumps rather than varies smoothly.
 * `waveformAt` is right-continuous at each of these (see its square/sawtooth
 * cases), so sampling it exactly at the phase gives the value just *after*
 * the jump, and sampling an instant earlier gives the value just *before* —
 * emitting both, at (as near as makes no visual difference) the same
 * position, renders a sharp vertical edge instead of a diagonal blurred
 * across however many regular samples happen to span the jump.
 */
const DISCONTINUITY_PHASES: Record<WaveformId, number[]> = {
  triangle: [],
  sine: [],
  sawtooth: [0],
  square: [0, 0.5],
};

/** A safety net mirroring the original spiral renderer's own point cap, now
 * shared by every spine — sub-sampling for a smooth waveform multiplies a
 * spine's point count, so this bounds the output regardless of shape. */
const MAX_STRAND_POINTS = 200_000;

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

/** Discontinuity arc-lengths the (fromArc, toArc] span crosses, each paired
 * with an "just before" arc-length an instant earlier — sorted so both land
 * in the right order relative to the regular sub-samples around them. */
function discontinuityArcs(waveform: WaveformId, toothWidth: number, fromArc: number, toArc: number): number[] {
  const phases = DISCONTINUITY_PHASES[waveform];
  if (phases.length === 0) return [];
  const epsilon = toothWidth * 1e-4;
  const arcs: number[] = [];
  const fromCycle = Math.floor(fromArc / toothWidth) - 1;
  const toCycle = Math.ceil(toArc / toothWidth) + 1;
  for (let cycle = fromCycle; cycle <= toCycle; cycle++) {
    for (const phase of phases) {
      const arc = (cycle + phase) * toothWidth;
      if (arc > fromArc && arc <= toArc) {
        arcs.push(Math.max(fromArc, arc - epsilon), arc);
      }
    }
  }
  return arcs.sort((a, b) => a - b);
}

/**
 * Walks one strand's base points, sub-sampling between them densely enough
 * for the chosen waveform, buckets them into fixed-arc-length cells, samples
 * source tone once per cell (at its baseline crossing, matching the original
 * spiral-amplitude behaviour), and displaces each sample along its normal by
 * `waveform(phase) * amplitude * toneDarkness`. Returns one `M...L L L...`
 * path substring, or "" for a strand too short to draw.
 */
export function modulateStrand(points: SpineStrand, options: ToneModulationOptions): string {
  if (points.length === 0) return "";
  const { toothWidth, amplitude, waveform, image } = options;
  const safeToothWidth = Math.max(toothWidth, 1e-6);
  const maxSubStep = safeToothWidth / (SAMPLES_PER_CYCLE[waveform] ?? 4);

  const commands: string[] = [];
  let toothIndex = -1;
  let toothDark = 0;

  const emit = (x: number, y: number, nx: number, ny: number, arc: number) => {
    const nextToothIndex = Math.floor(arc / safeToothWidth);
    if (nextToothIndex !== toothIndex) {
      toothIndex = nextToothIndex;
      toothDark = 1 - luminanceAt(image, x, y) / 255;
    }
    const displacement = amplitude * toothDark * waveformAt(waveform, arc / safeToothWidth);
    commands.push(`${commands.length === 0 ? "M" : "L"}${format(x + displacement * nx)} ${format(y + displacement * ny)}`);
  };

  emit(points[0].x, points[0].y, points[0].nx, points[0].ny, 0);
  let arcLength = 0;

  outer: for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const point = points[index];
    const segmentLength = Math.hypot(point.x - previous.x, point.y - previous.y);
    if (segmentLength === 0) continue;
    const fromArc = arcLength;
    const toArc = arcLength + segmentLength;

    const subStepCount = Math.max(1, Math.ceil(segmentLength / maxSubStep));
    const arcs = new Set<number>(discontinuityArcs(waveform, safeToothWidth, fromArc, toArc));
    for (let step = 1; step <= subStepCount; step++) arcs.add(fromArc + (segmentLength * step) / subStepCount);

    for (const arc of [...arcs].sort((a, b) => a - b)) {
      const t = Math.min(1, Math.max(0, (arc - fromArc) / segmentLength));
      const sample = interpolateSample(previous, point, t);
      emit(sample.x, sample.y, sample.nx, sample.ny, arc);
      if (commands.length >= MAX_STRAND_POINTS) break outer;
    }
    arcLength = toArc;
  }

  return commands.join(" ");
}

/** Modulates every strand and joins the results into one multi-subpath `d`. */
export function renderToneSpine(strands: Iterable<SpineStrand>, options: ToneModulationOptions): string {
  const segments: string[] = [];
  for (const strand of strands) {
    const segment = modulateStrand(strand, options);
    if (segment) segments.push(segment);
  }
  return segments.join(" ");
}
