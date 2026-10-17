import type { RendererContext, RendererSource } from "../../../../types";
import { bitmapRenderers } from "./registry";
import { smoothSource } from "./toneAdjust";
import { validateRendererOutput, type ValidatedOutput } from "./validatePath";

/** A render posted to a renderer worker: which in-tree renderer, and its context. */
export interface RenderRequest {
  id: number;
  kind?: "render";
  rendererId: string;
  context: RendererContext;
}

/** Tone smoothing posted to a renderer worker — see `smoothSource`. */
export interface SmoothRequest {
  id: number;
  kind: "smooth";
  source: RendererSource;
  smoothingMM: number;
  pixelsPerMM: number;
}

export type PoolRequest = RenderRequest | SmoothRequest;

export type RenderReply =
  | { id: number; ok: true; output: ValidatedOutput }
  | { id: number; ok: false; message: string };

export type SmoothReply =
  | { id: number; ok: true; output: RendererSource }
  | { id: number; ok: false; message: string };

export type PoolReply = RenderReply | SmoothReply;

/**
 * Runs one in-tree render, validates it, and packages the outcome for posting
 * back. Validating here rather than after the reply keeps a full scan of what
 * can be megabytes of path data off the UI thread. Kept apart from the worker
 * entry so tests can drive exactly the code a worker runs, without a real
 * worker. Only in-tree renderers are reachable here — plugins have their own
 * sandbox.
 */
export async function handleRenderRequest({ id, rendererId, context }: RenderRequest): Promise<RenderReply> {
  const renderer = bitmapRenderers.find((entry) => entry.id === rendererId);
  if (!renderer) return { id, ok: false, message: `Unknown in-tree renderer "${rendererId}".` };
  try {
    return { id, ok: true, output: validateRendererOutput(await renderer.render(context), rendererId) };
  } catch (err) {
    return { id, ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Runs tone smoothing for the pool — the heavy half of tone preparation,
 * hundreds of milliseconds on a large photo, kept off the UI thread. */
export function handleSmoothRequest({ id, source, smoothingMM, pixelsPerMM }: SmoothRequest): SmoothReply {
  try {
    return { id, ok: true, output: smoothSource(source, smoothingMM, pixelsPerMM) };
  } catch (err) {
    return { id, ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Dispatches any pool request to its handler. */
export async function handlePoolRequest(request: PoolRequest): Promise<PoolReply> {
  return request.kind === "smooth" ? handleSmoothRequest(request) : handleRenderRequest(request);
}
