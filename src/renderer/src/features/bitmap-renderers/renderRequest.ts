import type { RendererContext, RendererSource } from "../../../../types";
import { bitmapRenderers } from "./registry";
import { smoothSource } from "./toneAdjust";
import type { BitmapColorData } from "./bitmapImage";
import {
  separateColours,
  type CustomPaletteSwatch,
  type SeparatedChannel,
  type SeparationMode,
} from "./colourSeparation";
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

/** Colour separation posted to a renderer worker — see `separateColours`. */
export interface SeparateRequest {
  id: number;
  kind: "separate";
  image: BitmapColorData;
  mode: Exclude<SeparationMode, "none">;
  palette: CustomPaletteSwatch[];
  /** Absent: the paper the mode is made for. */
  paper?: string;
}

export type PoolRequest = RenderRequest | SmoothRequest | SeparateRequest;

export type RenderReply =
  | { id: number; ok: true; output: ValidatedOutput }
  | { id: number; ok: false; message: string };

export type SmoothReply =
  | { id: number; ok: true; output: RendererSource }
  | { id: number; ok: false; message: string };

export type SeparateReply =
  | { id: number; ok: true; output: SeparatedChannel[] }
  | { id: number; ok: false; message: string };

export type PoolReply = RenderReply | SmoothReply | SeparateReply;

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

/** Runs colour separation for the pool: a pass over every pixel per ink,
 * and for unmixed modes a solve per palette, kept off the UI thread. */
export function handleSeparateRequest({ id, image, mode, palette, paper }: SeparateRequest): SeparateReply {
  try {
    return { id, ok: true, output: separateColours(image, mode, palette, paper) };
  } catch (err) {
    return { id, ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** The buffers in a reply that can be handed over rather than copied: the
 * images it carries are megabytes and not used in the worker again. */
export function replyTransfers(reply: PoolReply, kind: PoolRequest["kind"]): Transferable[] {
  if (!reply.ok) return [];
  if (kind === "smooth") return [(reply.output as RendererSource).values.buffer];
  if (kind === "separate") return (reply.output as SeparatedChannel[]).map((channel) => channel.luminance.values.buffer);
  return [];
}

/** Dispatches any pool request to its handler. */
export async function handlePoolRequest(request: PoolRequest): Promise<PoolReply> {
  if (request.kind === "smooth") return handleSmoothRequest(request);
  if (request.kind === "separate") return handleSeparateRequest(request);
  return handleRenderRequest(request);
}
