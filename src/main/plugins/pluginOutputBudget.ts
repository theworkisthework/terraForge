import { MAX_BITMAP_RENDERER_PATH_LENGTH } from "../../types";

/**
 * Ceiling on everything a plugin may send back for one render, counted in
 * "units": a character of any string or object key, a byte of a typed array,
 * and a few units for every number, boolean, array slot and object.
 *
 * The path-length limit alone cannot do this job. It is checked inside the
 * worker, in the same realm as the plugin, so a hostile plugin can skip it by
 * posting its own message — and even an honest-looking result can carry
 * oversized fields the path check never looks at, such as a layer label. This
 * budget is checked outside that realm: in the host page before the result
 * crosses into the main process, and again in the main process before it is
 * forwarded on. Twice the path limit leaves room for dot coordinates and
 * layer metadata on top of a maximal path.
 */
export const MAX_OUTPUT_UNITS = MAX_BITMAP_RENDERER_PATH_LENGTH * 2;

const SLOT_UNITS = 8;

/**
 * Ceiling on the text of an error a plugin reports, and on a render's request
 * id. Neither is part of the output budget, so each needs its own bound — an
 * error message is otherwise free to be as large as the result it replaced.
 * Generous enough for a full stack trace.
 */
export const MAX_PLUGIN_MESSAGE_LENGTH = 8192;
export const MAX_REQ_ID_LENGTH = 32;

/** `value` as bounded text: a non-string becomes "", a long string is cut. */
export function clipPluginText(value: unknown, max = MAX_PLUGIN_MESSAGE_LENGTH): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * Whether `output` is larger than the budget. Stops counting the moment it
 * is over, so rejecting a huge result costs no more than the budget does, and
 * never recurses, so nesting depth cannot overflow the stack. A cyclic value
 * keeps adding units on every lap and so also ends over budget.
 *
 * The host page runs an equivalent of this written in plain JavaScript (see
 * pluginSandboxAssets.ts); the unit tests drive both through the same cases.
 */
export function exceedsOutputBudget(output: unknown): boolean {
  let units = 0;
  const pending: unknown[] = [output];

  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === "string") {
      units += value.length;
    } else if (typeof value !== "object" || value === null) {
      units += SLOT_UNITS;
    } else if (ArrayBuffer.isView(value)) {
      units += value.byteLength;
    } else if (Array.isArray(value)) {
      // Checked before the items are queued: a huge array is over budget on
      // its length alone, and walking it first would cost time and memory in
      // proportion to its size rather than the budget's.
      units += SLOT_UNITS + value.length * SLOT_UNITS;
      if (units > MAX_OUTPUT_UNITS) return true;
      for (const item of value) pending.push(item);
    } else {
      units += SLOT_UNITS;
      for (const key of Object.keys(value)) {
        units += key.length;
        if (units > MAX_OUTPUT_UNITS) return true;
        pending.push((value as Record<string, unknown>)[key]);
      }
    }
    if (units > MAX_OUTPUT_UNITS) return true;
  }
  return false;
}
