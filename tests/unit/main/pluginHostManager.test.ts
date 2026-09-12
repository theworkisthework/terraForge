import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import type { BitmapPluginRegistry } from "../../../src/main/plugins/pluginRegistry";
import type { BitmapPluginRecord } from "../../../src/main/plugins/pluginManifest";

class FakeUtilityProcess extends EventEmitter {
  killed = false;
  stdout = null;
  stderr = null;
  sentMessages: unknown[] = [];

  postMessage(message: unknown): void {
    this.sentMessages.push(message);
  }

  kill(): void {
    if (this.killed) return;
    this.killed = true;
    this.emit("exit", null);
  }
}

const mocks = vi.hoisted(() => ({
  forkedProcesses: [] as FakeUtilityProcess[],
  fork: vi.fn(),
}));

vi.mock("electron", () => ({
  utilityProcess: {
    fork: mocks.fork,
  },
}));

import { PluginHostManager } from "../../../src/main/plugins/pluginHostManager";

function makeRecord(id: string, overrides: Partial<BitmapPluginRecord["manifest"]> = {}): BitmapPluginRecord {
  return {
    manifest: {
      id,
      label: id,
      apiVersion: 1,
      defaults: {},
      fields: [],
      ...overrides,
    },
    entryPath: `/plugins/${id}/index.js`,
    folder: `/plugins/${id}`,
  };
}

function makeRegistry(records: BitmapPluginRecord[]): BitmapPluginRegistry {
  return {
    find: (id: string) => records.find((r) => r.manifest.id === id),
    list: () => records,
    rescan: async () => ({ plugins: records, errors: [] }),
  } as unknown as BitmapPluginRegistry;
}

const luminance = { width: 1, height: 1, values: new Uint8Array([1]) };

describe("PluginHostManager", () => {
  beforeEach(() => {
    mocks.forkedProcesses = [];
    mocks.fork.mockReset();
    mocks.fork.mockImplementation(() => {
      const proc = new FakeUtilityProcess();
      mocks.forkedProcesses.push(proc);
      return proc;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects when the plugin id is not installed", async () => {
    const manager = new PluginHostManager("/host-entry.js", makeRegistry([]));
    await expect(manager.render("missing", luminance, {}, 1)).rejects.toThrow(/not installed/);
    manager.terminateAll();
  });

  it("spawns a process, waits for ready, and resolves render from a result message", async () => {
    const registry = makeRegistry([makeRecord("acme")]);
    const manager = new PluginHostManager("/host-entry.js", registry);

    const renderPromise = manager.render("acme", luminance, { k: 1 }, 0.5);
    const proc = mocks.forkedProcesses[0];

    expect(proc.sentMessages[0]).toMatchObject({ type: "init", entryPath: "/plugins/acme/index.js" });
    proc.emit("message", { type: "ready" });

    // ensureReady resolving unblocks the render() message post — allow the
    // microtask queue to flush before asserting.
    await Promise.resolve();
    expect(proc.sentMessages[1]).toMatchObject({ type: "render", settings: { k: 1 }, baseScale: 0.5 });

    const reqId = (proc.sentMessages[1] as { reqId: string }).reqId;
    proc.emit("message", { type: "result", reqId, path: "M0 0" });

    await expect(renderPromise).resolves.toBe("M0 0");
    manager.terminateAll();
  });

  it("reuses the same process across repeated renders", async () => {
    const registry = makeRegistry([makeRecord("acme")]);
    const manager = new PluginHostManager("/host-entry.js", registry);

    const first = manager.render("acme", luminance, {}, 1);
    const proc = mocks.forkedProcesses[0];
    proc.emit("message", { type: "ready" });
    await Promise.resolve();
    proc.emit("message", { type: "result", reqId: (proc.sentMessages[1] as { reqId: string }).reqId, path: "A" });
    await first;

    const second = manager.render("acme", luminance, {}, 1);
    await Promise.resolve();
    proc.emit("message", { type: "result", reqId: (proc.sentMessages[2] as { reqId: string }).reqId, path: "B" });
    await expect(second).resolves.toBe("B");

    expect(mocks.fork).toHaveBeenCalledTimes(1);
    manager.terminateAll();
  });

  it("rejects with the plugin's error message on a render error", async () => {
    const registry = makeRegistry([makeRecord("acme")]);
    const manager = new PluginHostManager("/host-entry.js", registry);

    const renderPromise = manager.render("acme", luminance, {}, 1);
    const proc = mocks.forkedProcesses[0];
    proc.emit("message", { type: "ready" });
    await Promise.resolve();
    const reqId = (proc.sentMessages[1] as { reqId: string }).reqId;
    proc.emit("message", { type: "error", reqId, message: "deliberate failure" });

    await expect(renderPromise).rejects.toThrow("deliberate failure");
    manager.terminateAll();
  });

  it("rejects and does not reuse the process after a load-error", async () => {
    const registry = makeRegistry([makeRecord("acme")]);
    const manager = new PluginHostManager("/host-entry.js", registry);

    const first = manager.render("acme", luminance, {}, 1);
    mocks.forkedProcesses[0].emit("message", { type: "load-error", message: "bad require" });
    await expect(first).rejects.toThrow(/failed to load/);
    expect(mocks.forkedProcesses[0].killed).toBe(true);

    const second = manager.render("acme", luminance, {}, 1);
    expect(mocks.fork).toHaveBeenCalledTimes(2);
    mocks.forkedProcesses[1].emit("message", { type: "ready" });
    await Promise.resolve();
    const reqId = (mocks.forkedProcesses[1].sentMessages[1] as { reqId: string }).reqId;
    mocks.forkedProcesses[1].emit("message", { type: "result", reqId, path: "OK" });
    await expect(second).resolves.toBe("OK");
    manager.terminateAll();
  });

  it("rejects a pending render when the process exits unexpectedly", async () => {
    const registry = makeRegistry([makeRecord("acme")]);
    const manager = new PluginHostManager("/host-entry.js", registry);

    const renderPromise = manager.render("acme", luminance, {}, 1);
    const proc = mocks.forkedProcesses[0];
    proc.emit("message", { type: "ready" });
    await Promise.resolve();
    proc.emit("exit", 1);

    await expect(renderPromise).rejects.toThrow(/exited unexpectedly/);
    manager.terminateAll();
  });

  it("treats a fatal message as a crash: rejects pending work and kills the process", async () => {
    const registry = makeRegistry([makeRecord("acme")]);
    const manager = new PluginHostManager("/host-entry.js", registry);

    const renderPromise = manager.render("acme", luminance, {}, 1);
    const proc = mocks.forkedProcesses[0];
    proc.emit("message", { type: "ready" });
    await Promise.resolve();
    proc.emit("message", { type: "fatal", message: "uncaught exception in plugin timer" });

    await expect(renderPromise).rejects.toThrow(/crashed/);
    expect(proc.killed).toBe(true);
    manager.terminateAll();
  });

  it("times out a hung render and kills the process", async () => {
    vi.useFakeTimers();
    const registry = makeRegistry([makeRecord("acme", { renderTimeoutMs: 100 })]);
    const manager = new PluginHostManager("/host-entry.js", registry);

    const renderPromise = manager.render("acme", luminance, {}, 1);
    const proc = mocks.forkedProcesses[0];
    proc.emit("message", { type: "ready" });
    await Promise.resolve();

    const assertion = expect(renderPromise).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(150);
    await assertion;
    expect(proc.killed).toBe(true);
    manager.terminateAll();
  });

  it("recycles an idle process after the idle window, but leaves a busy one alone", async () => {
    vi.useFakeTimers();
    const registry = makeRegistry([makeRecord("acme")]);
    const manager = new PluginHostManager("/host-entry.js", registry);

    const first = manager.render("acme", luminance, {}, 1);
    const proc = mocks.forkedProcesses[0];
    proc.emit("message", { type: "ready" });
    await Promise.resolve();
    proc.emit("message", { type: "result", reqId: (proc.sentMessages[1] as { reqId: string }).reqId, path: "A" });
    await first;

    // Well under the 5-minute idle window plus one sweep interval — should survive.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(proc.killed).toBe(false);

    // Past the 5-minute idle window plus another sweep — should be recycled.
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(proc.killed).toBe(true);
    manager.terminateAll();
  });

  it("isolates plugins from one another: one crashing does not affect another's in-flight render", async () => {
    const registry = makeRegistry([makeRecord("acme"), makeRecord("beta")]);
    const manager = new PluginHostManager("/host-entry.js", registry);

    const acmeRender = manager.render("acme", luminance, {}, 1);
    const acmeProc = mocks.forkedProcesses[0];
    acmeProc.emit("message", { type: "ready" });
    await Promise.resolve();

    const betaRender = manager.render("beta", luminance, {}, 1);
    const betaProc = mocks.forkedProcesses[1];
    betaProc.emit("message", { type: "ready" });
    await Promise.resolve();

    // acme crashes entirely — beta must be unaffected.
    acmeProc.emit("message", { type: "fatal", message: "boom" });
    await expect(acmeRender).rejects.toThrow(/crashed/);

    const betaReqId = (betaProc.sentMessages[1] as { reqId: string }).reqId;
    betaProc.emit("message", { type: "result", reqId: betaReqId, path: "still fine" });
    await expect(betaRender).resolves.toBe("still fine");
    expect(betaProc.killed).toBe(false);

    manager.terminateAll();
  });
});
