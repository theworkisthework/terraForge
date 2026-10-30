import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPlugin } from "../../src/renderer/src/features/bitmap-renderers/pluginRender";
import type { PluginRenderContext, PluginRenderResult } from "../../src/types";

function stubRender(impl: (context: PluginRenderContext) => PluginRenderResult) {
  const render = vi.fn(async (_id: string, context: PluginRenderContext) => impl(context));
  vi.stubGlobal("terraForge", { rendererPlugins: { render } });
  return render;
}

const ok = (): PluginRenderResult => ({ status: "ok", output: "M0 0" });
const context = (values: Uint8Array) => ({ width: 1, height: 1, scale: 1, settings: {}, source: { width: 1, height: 1, values } });

describe("renderPlugin", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("sends an image's pixels the first time, then only its id", async () => {
    const render = stubRender(ok);
    const values = new Uint8Array([1]);
    await renderPlugin("acme", context(values));
    await renderPlugin("acme", { ...context(values), settings: { changed: true } });

    const [first, second] = render.mock.calls.map(([, ctx]) => ctx.source!);
    expect(first.values).toBe(values);
    expect(second).toEqual({ id: first.id, width: 1, height: 1 });
  });

  it("gives a different image a different id", async () => {
    const render = stubRender(ok);
    await renderPlugin("acme", context(new Uint8Array([1])));
    await renderPlugin("acme", context(new Uint8Array([1])));

    const [first, second] = render.mock.calls.map(([, ctx]) => ctx.source!);
    expect(second.id).not.toBe(first.id);
    expect(second.values).toBeDefined();
  });

  it("sends the pixels again when the main process no longer holds them", async () => {
    const values = new Uint8Array([1]);
    stubRender(ok);
    await renderPlugin("acme", context(values));

    const render = stubRender((ctx) => (ctx.source?.values ? ok() : { status: "source-missing" }));
    await expect(renderPlugin("acme", context(values))).resolves.toBe("M0 0");
    expect(render.mock.calls.map(([, ctx]) => ctx.source!.values !== undefined)).toEqual([false, true]);
  });

  it("passes a render with no source straight through", async () => {
    const render = stubRender(ok);
    await renderPlugin("acme", { width: 1, height: 1, scale: 1, settings: {} });
    expect(render.mock.calls[0][1].source).toBeUndefined();
  });

  it("lets a plugin's own failure through unchanged", async () => {
    vi.stubGlobal("terraForge", { rendererPlugins: { render: vi.fn().mockRejectedValue(new Error("boom")) } });
    await expect(renderPlugin("acme", context(new Uint8Array([1])))).rejects.toThrow("boom");
  });
});
