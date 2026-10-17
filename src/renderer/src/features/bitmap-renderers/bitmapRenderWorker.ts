/**
 * Web Worker entry for the bitmap pool — in-tree renders and tone smoothing;
 * see `rendererPool.ts`.
 *
 *   IN  → PoolRequest  (RenderRequest | SmoothRequest)
 *   OUT ← PoolReply    { id, ok: true, output } | { id, ok: false, message }
 */
import { handlePoolRequest, type PoolRequest } from "./renderRequest";

self.onmessage = async (event: MessageEvent<PoolRequest>) => {
  const reply = await handlePoolRequest(event.data);
  // A smoothed image is megabytes and is not used here again: hand its
  // buffer over rather than copy it.
  const transfer =
    reply.ok && event.data.kind === "smooth" ? [(reply.output as { values: Uint8Array }).values.buffer] : [];
  (self as unknown as Worker).postMessage(reply, transfer);
};

// Dev-only, and never true inside a worker at runtime: marks this module as
// accepting its own updates, so editing a renderer (imported here through
// the registry) does not leave Vite with an unaccepted chain and a full page
// reload. Running workers are restarted on the new code by `rendererPool`.
import.meta.hot?.accept();
