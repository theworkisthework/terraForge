import {
  MAX_BITMAP_RENDERER_PATH_LENGTH,
  type RendererLayer,
  type RendererOutput,
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

/**
 * Normalises whatever a renderer returned into layers, checking each one.
 *
 * A bare string is the common case and stays valid — it becomes a single
 * unnamed layer. An array lets a renderer drive several pens itself, which a
 * generative renderer may well want to do without the caller having to run it
 * once per colour the way bitmap colour separation does.
 */
export function validateRendererOutput(output: unknown, rendererId: string): RendererLayer[] {
  if (typeof output === "string") {
    return [{ d: validateRendererPath(output, rendererId) }];
  }

  if (!Array.isArray(output)) {
    throw new Error(
      `Renderer "${rendererId}" returned ${output === null ? "null" : typeof output}; ` +
        "expected a path string or an array of layers.",
    );
  }

  return (output as RendererOutput[]).map((layer, index) => {
    if (typeof layer !== "object" || layer === null || Array.isArray(layer)) {
      throw new Error(`Renderer "${rendererId}" layer ${index} is not an object.`);
    }
    const { d, label, color } = layer as RendererLayer;
    if (label !== undefined && typeof label !== "string") {
      throw new Error(`Renderer "${rendererId}" layer ${index} has a non-string label.`);
    }
    if (color !== undefined && typeof color !== "string") {
      throw new Error(`Renderer "${rendererId}" layer ${index} has a non-string color.`);
    }
    return { d: validateRendererPath(d, rendererId), label, color };
  });
}
