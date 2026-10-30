import { describe, expect, it } from "vitest";
import { WORKER_JS } from "../../../src/main/plugins/pluginSandboxAssets";
import { MAX_BITMAP_RENDERER_PATH_LENGTH } from "../../../src/types";

type Posted = { type: string; output?: unknown; message?: string };

/**
 * Runs the real sandbox worker script against a stand-in `self`, so these
 * tests exercise exactly what ships rather than a re-implementation of it.
 */
function startWorker(pluginSource: string) {
  const posted: Posted[] = [];
  const self: { postMessage: (message: Posted) => void; onmessage?: (event: { data: unknown }) => void } = {
    postMessage: (message) => posted.push(message),
  };
  new Function("self", WORKER_JS)(self);
  self.onmessage!({ data: { type: "init", modules: { "index.js": pluginSource }, entry: "index.js" } });

  const render = async (): Promise<Posted> => {
    const before = posted.length;
    self.onmessage!({ data: { type: "render", reqId: "1", context: {} } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return posted[before];
  };
  return { posted, render, self };
}

const plugin = (body: string) => `module.exports.render = function () { ${body} };`;

describe("sandbox worker output check", () => {
  it("passes a path string, an array of layers, and the full { layers, warnings } form", async () => {
    for (const body of [
      'return "M0 0 L1 1";',
      'return [{ d: "M0 0", label: "A" }];',
      'return { layers: [{ d: "M0 0" }], warnings: ["Cut short"] };',
    ]) {
      const result = await startWorker(plugin(body)).render();
      expect(result.type, body).toBe("result");
    }
  });

  it("passes a layer of dots with no stroked path", async () => {
    const result = await startWorker(plugin('return { layers: [{ dots: [{ d: "M0 0 L1 0 Z", x: 0, y: 0 }] }] };')).render();
    expect(result).toMatchObject({
      type: "result",
      output: { layers: [{ dots: [{ d: "M0 0 L1 0 Z", x: 0, y: 0 }] }] },
    });
  });

  it("rejects a layer with neither a path nor dots", async () => {
    const result = await startWorker(plugin('return [{ label: "Empty" }];')).render();
    expect(result.type).toBe("error");
    expect(result.message).toMatch(/neither a 'd' path string nor a dots array/);
  });

  it("rejects a shape that is none of the accepted forms", async () => {
    const result = await startWorker(plugin("return 42;")).render();
    expect(result.type).toBe("error");
    expect(result.message).toMatch(/must return a path string, an array of layers, or \{ layers, warnings \}/);
  });

  it("counts dot outlines toward the size limit, so dots cannot slip past it", async () => {
    const huge = MAX_BITMAP_RENDERER_PATH_LENGTH + 1;
    const result = await startWorker(
      plugin(`return { layers: [{ dots: [{ d: "M".repeat(${huge}), x: 0, y: 0 }] }] };`),
    ).render();
    expect(result.type).toBe("error");
    expect(result.message).toMatch(/over the \d+ limit/);
  });
});

describe("sandbox worker source images", () => {
  /** Posts one render with the given source fields and returns what the worker posted back. */
  function sendRender(worker: ReturnType<typeof startWorker>, source: Record<string, unknown> | undefined, evict: string[] = []) {
    const self = worker.self;
    return async (): Promise<Posted> => {
      const before = worker.posted.length;
      self.onmessage!({ data: { type: "render", reqId: "1", context: { source }, evict } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      return worker.posted[before];
    };
  }

  // Sums its source and then scribbles over it, as a plugin working in place would.
  const summing = plugin(`
    var v = arguments[0].source.values, sum = 0;
    for (var i = 0; i < v.length; i++) { sum += v[i]; v[i] = 0; }
    return "M" + sum + " 0";
  `);

  it("keeps a stored image and renders from it by id", async () => {
    const worker = startWorker(summing);
    const first = await sendRender(worker, { id: "a", width: 3, height: 1, values: new Uint8Array([1, 2, 3]), store: true })();
    const second = await sendRender(worker, { id: "a", width: 3, height: 1 })();
    expect(first).toMatchObject({ type: "result", output: "M6 0" });
    // A plugin that overwrote its input still gets the original next time.
    expect(second).toMatchObject({ type: "result", output: "M6 0" });
  });

  it("does not keep an image it was told not to", async () => {
    const worker = startWorker(summing);
    await sendRender(worker, { id: "a", width: 1, height: 1, values: new Uint8Array([5]), store: false })();
    const missing = await sendRender(worker, { id: "a", width: 1, height: 1 })();
    expect(missing).toMatchObject({ type: "error", message: expect.stringMatching(/source image was not available/) });
  });

  it("drops the images it is told to evict", async () => {
    const worker = startWorker(summing);
    await sendRender(worker, { id: "a", width: 1, height: 1, values: new Uint8Array([5]), store: true })();
    await sendRender(worker, { id: "b", width: 1, height: 1, values: new Uint8Array([6]), store: true }, ["a"])();
    expect(await sendRender(worker, { id: "a", width: 1, height: 1 })()).toMatchObject({ type: "error" });
    expect(await sendRender(worker, { id: "b", width: 1, height: 1 })()).toMatchObject({ output: "M6 0" });
  });

  it("hands the plugin its source in the shape a renderer expects", async () => {
    const worker = startWorker(plugin("var s = arguments[0].source; return 'M' + s.width + ' ' + s.height + (s.id === undefined ? '' : ' leaked');"));
    expect(await sendRender(worker, { id: "a", width: 4, height: 2, values: new Uint8Array(8), store: true })()).toMatchObject({
      output: "M4 2",
    });
  });
});
