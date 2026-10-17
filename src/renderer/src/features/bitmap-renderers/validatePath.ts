import {
  MAX_BITMAP_RENDERER_PATH_LENGTH,
  type RendererDot,
  type RendererLayer,
  type RendererResult,
} from "../../../../types";

/**
 * Characters that may legally appear in SVG path data: command letters,
 * digits, exponent markers, sign, decimal point, and separators.
 *
 * This is deliberately a character check rather than a grammar check. The
 * realistic failure is a renderer building its path by concatenation and
 * interpolating a bad number — `"M" + NaN` yields `"MNaN"`, and `Infinity`,
 * `undefined` and `null` stringify just as visibly. Every one of those
 * introduces a letter no path may contain, so a single scan catches them
 * without the false rejections a hand-written path grammar would risk.
 */
const ILLEGAL_PATH_CHARACTER = /[^MmZzLlHhVvCcSsQqTtAa0-9eE+\-.,\s]/;

/**
 * Checks a renderer's output before it becomes plottable geometry.
 *
 * This runs for in-tree renderers as well as plugins: a sandbox stops a
 * plugin reaching the filesystem, but nothing stops any renderer returning
 * nonsense, and this output goes on to drive real hardware. Coordinates
 * outside the bed are *not* rejected here — G-code generation already clips
 * every path to the bed or page, so the job of this check is malformed data
 * and runaway size, which clipping cannot help with.
 */
export function validateRendererPath(path: unknown, rendererId: string): string {
  if (typeof path !== "string") {
    throw new Error(`Renderer "${rendererId}" returned ${typeof path} instead of a path string.`);
  }

  if (path.length > MAX_BITMAP_RENDERER_PATH_LENGTH) {
    throw new Error(
      `Renderer "${rendererId}" returned ${path.length} characters of path data, ` +
        `over the ${MAX_BITMAP_RENDERER_PATH_LENGTH} limit.`,
    );
  }

  const illegal = ILLEGAL_PATH_CHARACTER.exec(path);
  if (illegal) {
    const context = path.slice(Math.max(0, illegal.index - 12), illegal.index + 12);
    throw new Error(
      `Renderer "${rendererId}" returned invalid path data at character ${illegal.index} ` +
        `(${JSON.stringify(illegal[0])}), near ${JSON.stringify(context)}.`,
    );
  }

  return path;
}

/** A renderer layer after validation: `d` always present (possibly ""). */
export interface ValidatedLayer {
  d: string;
  dots: RendererDot[];
  label?: string;
  color?: string;
}

export interface ValidatedOutput {
  layers: ValidatedLayer[];
  warnings: string[];
}

/** Warnings are for a status line, not a log: a few short ones at most. */
const MAX_WARNINGS = 5;
const MAX_WARNING_LENGTH = 300;

function validateDot(dot: unknown, where: string, rendererId: string): RendererDot {
  if (typeof dot !== "object" || dot === null) {
    throw new Error(`Renderer "${rendererId}" ${where} is not an object.`);
  }
  const { d, x, y } = dot as RendererDot;
  if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
    throw new Error(`Renderer "${rendererId}" ${where} needs finite numeric x and y.`);
  }
  return { d: validateRendererPath(d, rendererId), x, y };
}

function validateLayer(layer: unknown, index: number, rendererId: string): ValidatedLayer {
  if (typeof layer !== "object" || layer === null || Array.isArray(layer)) {
    throw new Error(`Renderer "${rendererId}" layer ${index} is not an object.`);
  }
  const { d, dots, label, color } = layer as RendererLayer;
  if (label !== undefined && typeof label !== "string") {
    throw new Error(`Renderer "${rendererId}" layer ${index} has a non-string label.`);
  }
  if (color !== undefined && typeof color !== "string") {
    throw new Error(`Renderer "${rendererId}" layer ${index} has a non-string color.`);
  }
  if (dots !== undefined && !Array.isArray(dots)) {
    throw new Error(`Renderer "${rendererId}" layer ${index} has dots that are not an array.`);
  }
  if (d === undefined && dots === undefined) {
    throw new Error(`Renderer "${rendererId}" layer ${index} has neither a 'd' path nor dots.`);
  }
  return {
    d: d === undefined ? "" : validateRendererPath(d, rendererId),
    dots: (dots ?? []).map((dot, dotIndex) => validateDot(dot, `layer ${index} dot ${dotIndex}`, rendererId)),
    label,
    color,
  };
}

function validateWarnings(warnings: unknown, rendererId: string): string[] {
  if (warnings === undefined) return [];
  if (!Array.isArray(warnings) || warnings.some((warning) => typeof warning !== "string")) {
    throw new Error(`Renderer "${rendererId}" returned warnings that are not an array of strings.`);
  }
  return warnings
    .slice(0, MAX_WARNINGS)
    .map((warning: string) => (warning.length > MAX_WARNING_LENGTH ? `${warning.slice(0, MAX_WARNING_LENGTH)}…` : warning));
}

/**
 * Normalises whatever a renderer returned into validated layers and
 * warnings, checking every path and dot.
 *
 * A bare string is the common case and stays valid — it becomes a single
 * unnamed layer. An array of layers lets a renderer drive several pens
 * itself, which a generative renderer may well want to do without the caller
 * having to run it once per colour the way bitmap colour separation does.
 * The `{ layers, warnings }` form adds notes for the user and is the only way
 * to return dots.
 */
export function validateRendererOutput(output: unknown, rendererId: string): ValidatedOutput {
  if (typeof output === "string") {
    return { layers: [{ d: validateRendererPath(output, rendererId), dots: [] }], warnings: [] };
  }
  if (Array.isArray(output)) {
    return { layers: output.map((layer, index) => validateLayer(layer, index, rendererId)), warnings: [] };
  }
  if (typeof output === "object" && output !== null && Array.isArray((output as RendererResult).layers)) {
    const { layers, warnings } = output as RendererResult;
    return {
      layers: layers.map((layer, index) => validateLayer(layer, index, rendererId)),
      warnings: validateWarnings(warnings, rendererId),
    };
  }
  throw new Error(
    `Renderer "${rendererId}" returned ${output === null ? "null" : typeof output}; ` +
      "expected a path string, an array of layers, or { layers, warnings }.",
  );
}
