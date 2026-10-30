import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handlePoolRequest,
  handleRenderRequest,
  type PoolRequest,
} from "@renderer/features/bitmap-renderers/renderRequest";
import { resetRendererPool, runInTreeRenderer, smoothInWorker } from "@renderer/features/bitmap-renderers/rendererPool";
import { smoothSource } from "@renderer/features/bitmap-renderers/toneAdjust";
import { rasterLinesRenderer } from "@renderer/features/bitmap-renderers/rasterLines";
import { validateRendererOutput } from "@renderer/features/bitmap-renderers/validatePath";
import type { RendererContext } from "../../src/types";

/**
 * Stands in for a real Worker: runs the very handler the worker entry runs,
 * but holds each reply until the test releases it, so "still running" is a
 * state a test can observe.
 */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string; preventDefault: () => void }) => void) | null = null;
  received: PoolRequest[] = [];
  terminated = false;
  private held: PoolRequest[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: PoolRequest) {
    this.received.push(request);
    this.held.push(request);
  }

  terminate() {
    this.terminated = true;
  }

  /** Replies to every request this worker is holding. */
  async release() {
    const requests = this.held.splice(0);
    for (const request of requests) {
      const reply = await handlePoolRequest(request);
      if (!this.terminated) this.onmessage?.({ data: reply });
    }
  }

  crash(message: string) {
    this.onerror?.({ message, preventDefault: () => {} });
  }
}

const live = () => FakeWorker.instances.filter((worker) => !worker.terminated);
const busy = () => live().filter((worker) => worker.received.length > 0);

/** What the pool should hand back: the renderer's own output, validated. */
const expected = () => validateRendererOutput(rasterLinesRenderer.render(context), rasterLinesRenderer.id);

const context: RendererContext = {
  width: 30,
  height: 20,
  scale: 0.5,
  settings: rasterLinesRenderer.defaults,
  source: { width: 30, height: 20, values: new Uint8Array(600).fill(40) },
};

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  resetRendererPool();
});

afterEach(() => {
  resetRendererPool();
  vi.unstubAllGlobals();
});

describe("runInTreeRenderer", () => {
  it("renders in a worker, returning the renderer's output already validated", async () => {
    const pending = runInTreeRenderer(rasterLinesRenderer, context);
    await Promise.all(live().map((worker) => worker.release()));

    expect(await pending).toEqual(expected());
    expect(FakeWorker.instances.length).toBeGreaterThan(0);
  });

  it("queues work beyond the pool and runs it as workers free up", async () => {
    const first = runInTreeRenderer(rasterLinesRenderer, context);
    const poolSize = live().length;
    const extra = Array.from({ length: poolSize + 1 }, () => runInTreeRenderer(rasterLinesRenderer, context));

    // One task per worker; the rest wait.
    expect(live().every((worker) => worker.received.length === 1)).toBe(true);

    for (let round = 0; round < 4; round++) await Promise.all(live().map((worker) => worker.release()));
    await expect(Promise.all([first, ...extra])).resolves.toHaveLength(poolSize + 2);
  });

  it("drops a queued render on abort, without ever sending it to a worker", async () => {
    // Fill every worker, so the next render has to queue.
    void runInTreeRenderer(rasterLinesRenderer, context);
    const poolSize = live().length;
    for (let i = 1; i < poolSize; i++) void runInTreeRenderer(rasterLinesRenderer, context);
    const controller = new AbortController();
    const queued = runInTreeRenderer(rasterLinesRenderer, context, controller.signal);

    controller.abort();

    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    expect(live().reduce((count, worker) => count + worker.received.length, 0)).toBe(poolSize);
  });

  it("stops a running render on abort by replacing its worker, and keeps serving", async () => {
    const controller = new AbortController();
    const running = runInTreeRenderer(rasterLinesRenderer, context, controller.signal);
    const [worker] = busy();

    controller.abort();

    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminated).toBe(true);

    const next = runInTreeRenderer(rasterLinesRenderer, context);
    await Promise.all(live().map((w) => w.release()));
    await expect(next).resolves.toEqual(expected());
  });

  it("rejects at once for a signal that is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runInTreeRenderer(rasterLinesRenderer, context, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(busy()).toHaveLength(0);
  });

  it("fails the render and replaces the worker if the worker itself breaks", async () => {
    const pending = runInTreeRenderer(rasterLinesRenderer, context);
    const [worker] = busy();

    worker.crash("out of memory");

    await expect(pending).rejects.toThrow("out of memory");
    expect(worker.terminated).toBe(true);
    expect(live()).toHaveLength(FakeWorker.instances.length - 1);
  });

  it("renders inline where workers do not exist", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("Worker", undefined);

    await expect(runInTreeRenderer(rasterLinesRenderer, context)).resolves.toEqual(expected());
  });
});

describe("smoothInWorker", () => {
  const spiky = () => {
    const values = new Uint8Array(400).fill(128);
    values[210] = 0;
    return { width: 20, height: 20, values };
  };

  it("smooths in a worker, with the same result as smoothing inline", async () => {
    const pending = smoothInWorker(spiky(), 1, 2);
    expect(busy()).toHaveLength(1);
    await Promise.all(live().map((worker) => worker.release()));

    expect(await pending).toEqual(smoothSource(spiky(), 1, 2));
  });

  it("is cancelled like a render, stopping its worker", async () => {
    const controller = new AbortController();
    const pending = smoothInWorker(spiky(), 1, 2, controller.signal);
    const [worker] = busy();

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminated).toBe(true);
  });

  it("smooths inline where workers do not exist", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("Worker", undefined);

    await expect(smoothInWorker(spiky(), 1, 2)).resolves.toEqual(smoothSource(spiky(), 1, 2));
  });
});

describe("handleRenderRequest", () => {
  it("reports an unknown renderer rather than throwing inside the worker", async () => {
    expect(await handleRenderRequest({ id: 3, rendererId: "nope", context })).toEqual({
      id: 3,
      ok: false,
      message: 'Unknown in-tree renderer "nope".',
    });
  });
});
