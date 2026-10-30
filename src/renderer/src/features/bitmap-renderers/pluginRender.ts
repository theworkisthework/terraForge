import type { PluginRenderContext, RendererContext, RendererOutput } from "../../../../types";

/**
 * Ids for source images, keyed on the pixel array itself. Prepared sources
 * are cached and reused across re-renders (see `preparedSources`), so a
 * settings-only change hands over the very same array and gets the same id —
 * which is what lets it be sent without its pixels. This relies on a source's
 * pixels never changing once it has been rendered from, the rule every
 * renderer already follows for the shared prepared sources.
 */
const sourceIds = new WeakMap<Uint8Array, string>();
/** Per window load, so an id from before a reload never names another image. */
const session = Math.random().toString(36).slice(2, 10);
let nextSourceId = 0;

/**
 * Ids recently sent to the main process with their pixels. Only a hint: main
 * may have evicted one since, and then says so and the image is sent again.
 * Bounded so it never outgrows what main could plausibly still hold.
 */
const sentToMain = new Set<string>();
const MAX_SENT_IDS = 64;

function idFor(values: Uint8Array): string {
  let id = sourceIds.get(values);
  if (!id) {
    id = `${session}-${nextSourceId++}`;
    sourceIds.set(values, id);
  }
  return id;
}

function markSent(id: string): void {
  sentToMain.delete(id);
  sentToMain.add(id);
  if (sentToMain.size > MAX_SENT_IDS) sentToMain.delete(sentToMain.values().next().value!);
}

async function send(pluginId: string, context: PluginRenderContext): Promise<RendererOutput | null> {
  const result = await window.terraForge.rendererPlugins.render(pluginId, context);
  return result.status === "ok" ? result.output : null;
}

/**
 * Runs a plugin render, sending the source image's pixels only when the main
 * process may not already hold them. Copying an image across processes costs
 * about 4ms per megapixel, every render, so this is the difference between a
 * settings tweak on a large separation re-sending hundreds of megabytes and
 * sending none.
 */
export async function renderPlugin(pluginId: string, context: RendererContext): Promise<RendererOutput> {
  const { source, ...rest } = context;
  if (!source) {
    const output = await send(pluginId, rest);
    if (output === null) throw new Error("The main process asked for a source image this render does not have.");
    return output;
  }

  const ref = { id: idFor(source.values), width: source.width, height: source.height };
  if (sentToMain.has(ref.id)) {
    const output = await send(pluginId, { ...rest, source: ref });
    if (output !== null) return output;
    sentToMain.delete(ref.id);
  }

  // Marked before the reply, so a second render of the same image started
  // meanwhile need not send it too: IPC keeps order, so main has stored it
  // by the time that render arrives. If it never did, that render is told so
  // and sends it again.
  const sending = send(pluginId, { ...rest, source: { ...ref, values: source.values } });
  markSent(ref.id);
  const output = await sending;
  if (output === null) throw new Error("The main process did not keep a source image it was just sent.");
  return output;
}
