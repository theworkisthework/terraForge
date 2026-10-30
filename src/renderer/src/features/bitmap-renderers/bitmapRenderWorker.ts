/**
 * Web Worker entry for the bitmap pool — in-tree renders, tone smoothing and
 * colour separation; see `rendererPool.ts`.
 *
 *   IN  → PoolRequest  (RenderRequest | SmoothRequest | SeparateRequest)
 *   OUT ← PoolReply    { id, ok: true, output } | { id, ok: false, message }
 */
import { handlePoolRequest, replyTransfers, type PoolRequest } from "./renderRequest";

self.onmessage = async (event: MessageEvent<PoolRequest>) => {
  const reply = await handlePoolRequest(event.data);
  (self as unknown as Worker).postMessage(reply, replyTransfers(reply, event.data.kind));
};

// Dev-only, and never true inside a worker at runtime: marks this module as
// accepting its own updates, so editing a renderer (imported here through
// the registry) does not leave Vite with an unaccepted chain and a full page
// reload. Running workers are restarted on the new code by `rendererPool`.
import.meta.hot?.accept();
