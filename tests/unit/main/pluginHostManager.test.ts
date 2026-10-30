import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RendererPluginRegistry } from "../../../src/main/plugins/pluginRegistry";
import type { RendererPluginRecord } from "../../../src/main/plugins/pluginManifest";

interface FakeWindow {
  id: number;
  destroyed: boolean;
  sent: { channel: string; message: Record<string, unknown> }[];
  handlers: Map<string, ((...args: unknown[]) => void)[]>;
  webContents: {
    id: number;
    send: (channel: string, message: Record<string, unknown>) => void;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    setWindowOpenHandler: (handler: (details: unknown) => { action: string }) => void;
    windowOpenHandler?: (details: unknown) => { action: string };
  };
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  loadURL: (url: string) => Promise<void>;
  isDestroyed: () => boolean;
  destroy: () => void;
  emit: (event: string, ...args: unknown[]) => void;
}

const mocks = vi.hoisted(() => ({
  windows: [] as FakeWindow[],
  ipc: new Map<string, ((...args: unknown[]) => void)[]>(),
  nextId: 1,
}));

vi.mock("electron", () => {
  const makeWindow = (): FakeWindow => {
    const id = mocks.nextId++;
    const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    const on = (event: string, cb: (...args: unknown[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), cb]);
    };
    const win: FakeWindow = {
      id,
      destroyed: false,
      sent: [],
      handlers,
      webContents: {
        id,
        send: (channel, message) => win.sent.push({ channel, message }),
        on,
        setWindowOpenHandler: (handler) => { win.webContents.windowOpenHandler = handler; },
      },
      on,
      loadURL: async () => {},
      isDestroyed: () => win.destroyed,
      destroy: () => { win.destroyed = true; },
      emit: (event, ...args) => (handlers.get(event) ?? []).forEach((cb) => cb(...args)),
    };
    mocks.windows.push(win);
    return win;
  };

  class BrowserWindow {
    constructor() { return makeWindow() as unknown as BrowserWindow; }
  }

  return {
    BrowserWindow,
    ipcMain: {
      on: (channel: string, cb: (...args: unknown[]) => void) => {
        mocks.ipc.set(channel, [...(mocks.ipc.get(channel) ?? []), cb]);
      },
      off: (channel: string, cb: (...args: unknown[]) => void) => {
        mocks.ipc.set(channel, (mocks.ipc.get(channel) ?? []).filter((fn) => fn !== cb));
      },
    },
    protocol: { registerSchemesAsPrivileged: vi.fn() },
    session: {
      fromPartition: () => ({
        protocol: { handle: vi.fn(), isProtocolHandled: () => false },
        webRequest: { onBeforeRequest: vi.fn() },
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
      }),
    },
  };
});

vi.mock("../../../src/main/plugins/pluginSource", () => ({
  readPluginModules: vi.fn(async () => ({ modules: { "index.js": "" }, entry: "index.js" })),
}));

import { PluginHostManager } from "../../../src/main/plugins/pluginHostManager";
import { MAX_OUTPUT_UNITS, MAX_PLUGIN_MESSAGE_LENGTH } from "../../../src/main/plugins/pluginOutputBudget";
import { PluginSourceMissingError } from "../../../src/main/plugins/pluginSourceCache";

function makeRecord(id: string, renderTimeoutMs?: number, sourceHash?: string): RendererPluginRecord {
  return {
    manifest: { id, label: id, apiVersion: 1, defaults: {}, fields: [], renderTimeoutMs, sourceHash },
    entryPath: `/plugins/${id}/index.js`,
    folder: `/plugins/${id}`,
  };
}

/** Registry over a mutable list, so a test can "rescan" by replacing its contents. */
function makeRegistry(records: RendererPluginRecord[]): RendererPluginRegistry {
  return {
    find: (id: string) => records.find((r) => r.manifest.id === id),
    list: () => records,
    rescan: async () => ({ plugins: records, errors: [] }),
  } as unknown as RendererPluginRegistry;
}

/** Delivers a page→main message as the given window's webContents would. */
function fromPage(win: FakeWindow, message: Record<string, unknown>): void {
  (mocks.ipc.get("plugin-host:from-page") ?? []).forEach((cb) =>
    cb({ sender: { id: win.webContents.id } }, message),
  );
}

/** Drives a freshly spawned window through page load and plugin evaluation. */
async function bringUp(win: FakeWindow): Promise<void> {
  fromPage(win, { type: "page-ready" });
  await vi.waitFor(() => expect(win.sent.some((s) => s.message.type === "init")).toBe(true));
  fromPage(win, { type: "ready" });
  await Promise.resolve();
}

const renders = (win: FakeWindow) => win.sent.filter((s) => s.message.type === "render");
const source = { id: "src-1", width: 1, height: 1, values: new Uint8Array([1]) };
const context = { width: 1, height: 1, scale: 1, settings: {}, source };

describe("PluginHostManager", () => {
  beforeEach(() => {
    mocks.windows = [];
    mocks.ipc = new Map();
    mocks.nextId = 1;
  });

  afterEach(() => { vi.useRealTimers(); });

  it("rejects when the plugin id is not installed", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([]));
    await expect(manager.render("missing", context)).rejects.toThrow(/not installed/);
    manager.terminateAll();
  });

  it("brings up a sandboxed window and resolves a render from its result", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", { ...context, settings: { k: 1 }, scale: 0.5 });
    const win = mocks.windows[0];
    await bringUp(win);

    const sent = renders(win)[0].message;
    expect(sent).toMatchObject({ context: { settings: { k: 1 }, scale: 0.5 } });
    fromPage(win, { type: "result", reqId: sent.reqId, output: "M0 0" });

    await expect(promise).resolves.toBe("M0 0");
    manager.terminateAll();
  });

  it("reuses one window across repeated renders", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const first = manager.render("acme", context);
    const win = mocks.windows[0];
    await bringUp(win);
    fromPage(win, { type: "result", reqId: renders(win)[0].message.reqId, output: "A" });
    await first;

    const second = manager.render("acme", context);
    await vi.waitFor(() => expect(renders(win)).toHaveLength(2));
    fromPage(win, { type: "result", reqId: renders(win)[1].message.reqId, output: "B" });

    await expect(second).resolves.toBe("B");
    expect(mocks.windows).toHaveLength(1);
    manager.terminateAll();
  });

  it("rejects with the plugin's own message on a render error", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", context);
    const win = mocks.windows[0];
    await bringUp(win);
    fromPage(win, { type: "error", reqId: renders(win)[0].message.reqId, message: "deliberate failure" });

    await expect(promise).rejects.toThrow(/deliberate failure/);
    manager.terminateAll();
  });

  it("cuts an oversized error message down before passing it on", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", context);
    const win = mocks.windows[0];
    await bringUp(win);
    fromPage(win, { type: "error", reqId: renders(win)[0].message.reqId, message: "x".repeat(MAX_PLUGIN_MESSAGE_LENGTH * 10) });

    const err = await promise.then(() => null, (e: Error) => e);
    expect(err?.message).toHaveLength(MAX_PLUGIN_MESSAGE_LENGTH);
    manager.terminateAll();
  });

  it("ignores a page message that is not an object", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", context);
    const win = mocks.windows[0];
    await bringUp(win);
    expect(() => fromPage(win, null as unknown as Record<string, unknown>)).not.toThrow();

    fromPage(win, { type: "result", reqId: renders(win)[0].message.reqId, output: "A" });
    await expect(promise).resolves.toBe("A");
    manager.terminateAll();
  });

  it("rejects and does not reuse the window after a load error", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const failed = manager.render("acme", context);
    const first = mocks.windows[0];
    fromPage(first, { type: "page-ready" });
    await vi.waitFor(() => expect(first.sent.some((s) => s.message.type === "init")).toBe(true));
    fromPage(first, { type: "load-error", message: "bad module" });

    await expect(failed).rejects.toThrow(/failed to load: bad module/);
    expect(first.destroyed).toBe(true);

    const retry = manager.render("acme", context);
    await vi.waitFor(() => expect(mocks.windows).toHaveLength(2));
    const second = mocks.windows[1];
    await bringUp(second);
    fromPage(second, { type: "result", reqId: renders(second)[0].message.reqId, output: "OK" });
    await expect(retry).resolves.toBe("OK");
    manager.terminateAll();
  });

  it("rejects pending work when the plugin's renderer process is gone", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", context);
    const win = mocks.windows[0];
    await bringUp(win);
    win.emit("render-process-gone", {}, { reason: "crashed" });

    await expect(promise).rejects.toThrow(/crashed/);
    manager.terminateAll();
  });

  it("times out a hung render, restarts the worker, and still serves work queued behind it", async () => {
    vi.useFakeTimers();
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme", 1000)]));
    const hung = manager.render("acme", context);
    // Settle-capture before advancing timers: the rejection lands while the
    // timer callback runs, so the handler has to already be attached.
    const hungOutcome = hung.then(() => null, (err: Error) => err.message);
    const queued = manager.render("acme", context);
    const win = mocks.windows[0];

    fromPage(win, { type: "page-ready" });
    await vi.waitFor(() => expect(win.sent.some((s) => s.message.type === "init")).toBe(true));
    fromPage(win, { type: "ready" });
    await Promise.resolve();

    // Only the first render is dispatched — the second waits its turn, so its
    // timeout budget cannot be spent while it is still queued.
    expect(renders(win)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1001);
    expect(await hungOutcome).toMatch(/timed out after 1000ms/);

    // The window survives; only the worker is restarted.
    expect(win.destroyed).toBe(false);
    expect(win.sent.some((s) => s.message.type === "restart")).toBe(true);

    fromPage(win, { type: "ready" });
    await vi.waitFor(() => expect(renders(win)).toHaveLength(2));
    fromPage(win, { type: "result", reqId: renders(win)[1].message.reqId, output: "survived" });

    await expect(queued).resolves.toBe("survived");
    manager.terminateAll();
  });

  it("dispatches renders one at a time so each timeout starts when its render does", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const all = [0, 1, 2, 3].map(() => manager.render("acme", context));
    const win = mocks.windows[0];
    await bringUp(win);

    for (let i = 0; i < 4; i++) {
      await vi.waitFor(() => expect(renders(win)).toHaveLength(i + 1));
      fromPage(win, { type: "result", reqId: renders(win)[i].message.reqId, output: `c${i}` });
    }

    await expect(Promise.all(all)).resolves.toEqual(["c0", "c1", "c2", "c3"]);
    expect(mocks.windows).toHaveLength(1);
    manager.terminateAll();
  });

  it("fails a plugin that never finishes loading instead of hanging forever", async () => {
    vi.useFakeTimers();
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", context);
    const outcome = promise.then(() => null, (err: Error) => err.message);
    // Page comes up but the plugin's own module evaluation never returns, so
    // no "ready" ever arrives.
    fromPage(mocks.windows[0], { type: "page-ready" });

    await vi.advanceTimersByTimeAsync(10001);
    expect(await outcome).toMatch(/did not finish loading/);
    expect(mocks.windows[0].destroyed).toBe(true);
    manager.terminateAll();
  });

  it("refuses to let a host window navigate or open another window", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    void manager.render("acme", context).catch(() => {});
    const win = mocks.windows[0];

    expect(win.webContents.windowOpenHandler?.({ url: "https://example.com" })).toEqual({ action: "deny" });
    const navigation = { preventDefault: vi.fn() };
    win.emit("will-navigate", navigation, "https://example.com");
    expect(navigation.preventDefault).toHaveBeenCalled();
    manager.terminateAll();
  });

  it("ignores messages from a window that is not a known plugin host", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", context);
    const win = mocks.windows[0];
    await bringUp(win);
    const reqId = renders(win)[0].message.reqId;

    fromPage({ webContents: { id: 9999 } } as unknown as FakeWindow, { type: "result", reqId, output: "spoofed" });
    fromPage(win, { type: "result", reqId, output: "genuine" });

    await expect(promise).resolves.toBe("genuine");
    manager.terminateAll();
  });

  it("drops a host whose source changed on invalidateChanged so edited source is re-read", async () => {
    const records = [makeRecord("acme", undefined, "v1")];
    const manager = new PluginHostManager("/preload.js", makeRegistry(records));
    const first = manager.render("acme", context);
    const win = mocks.windows[0];
    await bringUp(win);
    fromPage(win, { type: "result", reqId: renders(win)[0].message.reqId, output: "A" });
    await first;

    records[0] = makeRecord("acme", undefined, "v2");
    manager.invalidateChanged();
    expect(win.destroyed).toBe(true);

    const next = manager.render("acme", context);
    await vi.waitFor(() => expect(mocks.windows).toHaveLength(2));
    const fresh = mocks.windows[1];
    await bringUp(fresh);
    fromPage(fresh, { type: "result", reqId: renders(fresh)[0].message.reqId, output: "B" });

    await expect(next).resolves.toBe("B");
    manager.terminateAll();
  });

  it("leaves a host and its in-flight render alone when its source is unchanged", async () => {
    const records = [makeRecord("acme", undefined, "v1")];
    const manager = new PluginHostManager("/preload.js", makeRegistry(records));
    const promise = manager.render("acme", context);
    const win = mocks.windows[0];
    await bringUp(win);

    records[0] = makeRecord("acme", undefined, "v1");
    manager.invalidateChanged();
    expect(win.destroyed).toBe(false);

    fromPage(win, { type: "result", reqId: renders(win)[0].message.reqId, output: "done" });
    await expect(promise).resolves.toBe("done");
    manager.terminateAll();
  });

  it("drops hosts whose plugin was removed or has no fingerprint", async () => {
    const records = [makeRecord("gone", undefined, "v1"), makeRecord("blind")];
    const manager = new PluginHostManager("/preload.js", makeRegistry(records));
    const gone = manager.render("gone", context);
    const blind = manager.render("blind", context);
    const [goneWin, blindWin] = mocks.windows;
    await bringUp(goneWin);
    await bringUp(blindWin);

    records.splice(0, 1);
    manager.invalidateChanged();

    await expect(gone).rejects.toThrow(/reloaded/);
    await expect(blind).rejects.toThrow(/reloaded/);
    manager.terminateAll();
  });

  it("starts the sandbox from the source snapshot taken at discovery", async () => {
    const record = {
      ...makeRecord("acme", undefined, "v1"),
      source: { modules: { "index.js": "snapshot" }, entry: "index.js" },
    };
    const manager = new PluginHostManager("/preload.js", makeRegistry([record]));
    void manager.render("acme", context).catch(() => {});
    const win = mocks.windows[0];
    fromPage(win, { type: "page-ready" });
    await vi.waitFor(() => expect(win.sent.some((s) => s.message.type === "init")).toBe(true));

    expect(win.sent.find((s) => s.message.type === "init")?.message).toMatchObject({
      modules: { "index.js": "snapshot" },
    });
    manager.terminateAll();
  });

  it("refuses a result over the output budget instead of forwarding it", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", context);
    const win = mocks.windows[0];
    await bringUp(win);

    const huge = new Uint8Array(MAX_OUTPUT_UNITS + 1);
    fromPage(win, { type: "result", reqId: renders(win)[0].message.reqId, output: [{ d: "M0 0", blob: huge }] });

    await expect(promise).rejects.toThrow(/more data than a render may produce/);
    manager.terminateAll();
  });

  it("stops recognising a window's messages once it has closed", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", context);
    const win = mocks.windows[0];
    await bringUp(win);

    // As Electron does it: by the time `closed` fires the window is destroyed
    // and its webContents can no longer be asked for an id.
    win.destroyed = true;
    win.emit("closed");
    await expect(promise).rejects.toThrow(/closed unexpectedly/);

    expect((manager as unknown as { bySenderId: Map<number, unknown> }).bySenderId.size).toBe(0);
    manager.terminateAll();
  });

  it("isolates plugins: one crashing leaves another's in-flight render alone", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme"), makeRecord("beta")]));
    const acme = manager.render("acme", context);
    const beta = manager.render("beta", context);
    const [acmeWin, betaWin] = mocks.windows;
    await bringUp(acmeWin);
    await bringUp(betaWin);

    acmeWin.emit("render-process-gone", {}, { reason: "oom" });
    await expect(acme).rejects.toThrow(/acme/);

    fromPage(betaWin, { type: "result", reqId: renders(betaWin)[0].message.reqId, output: "still fine" });
    await expect(beta).resolves.toBe("still fine");
    manager.terminateAll();
  });

  /**
   * An image is megabytes and most re-renders change only settings, so its
   * pixels cross into the sandbox only when the worker does not hold them.
   */
  describe("source images", () => {
    const withImage = (id: string, values?: Uint8Array) => ({
      ...context,
      source: { id, width: 1, height: 1, ...(values ? { values } : {}) },
    });
    const sentSource = (win: FakeWindow, i: number) =>
      (renders(win)[i].message.context as { source: Record<string, unknown> }).source;

    /** Runs one render to completion against an already-ready window. */
    async function renderOnce(manager: PluginHostManager, win: FakeWindow, ctx: ReturnType<typeof withImage>) {
      const before = renders(win).length;
      const promise = manager.render("acme", ctx);
      await vi.waitFor(() => expect(renders(win)).toHaveLength(before + 1));
      fromPage(win, { type: "result", reqId: renders(win)[before].message.reqId, output: "M0 0" });
      await promise;
    }

    it("sends an image's pixels once, then names it by id alone", async () => {
      const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
      const values = new Uint8Array([7]);
      const first = manager.render("acme", withImage("img", values));
      const win = mocks.windows[0];
      await bringUp(win);
      fromPage(win, { type: "result", reqId: renders(win)[0].message.reqId, output: "M0 0" });
      await first;

      await renderOnce(manager, win, withImage("img"));

      expect(sentSource(win, 0)).toMatchObject({ id: "img", values, store: true });
      expect(sentSource(win, 1)).toEqual({ id: "img", width: 1, height: 1 });
      manager.terminateAll();
    });

    it("reports an id it does not hold, without starting a host", async () => {
      const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
      await expect(manager.render("acme", withImage("unknown"))).rejects.toBeInstanceOf(PluginSourceMissingError);
      expect(mocks.windows).toHaveLength(0);
      manager.terminateAll();
    });

    it("sends the pixels again to a worker restarted after a timeout", async () => {
      vi.useFakeTimers();
      const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme", 1000)]));
      const hung = manager.render("acme", withImage("img", new Uint8Array([1]))).catch(() => {});
      const win = mocks.windows[0];
      await bringUp(win);
      await vi.advanceTimersByTimeAsync(1001);
      await hung;
      fromPage(win, { type: "ready" });

      await renderOnce(manager, win, withImage("img"));
      expect(sentSource(win, 1)).toMatchObject({ id: "img", store: true, values: expect.any(Uint8Array) });
      manager.terminateAll();
    });

    it("tells the worker which images to drop once it holds as many as it may", async () => {
      const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
      const warmUp = manager.render("acme", context);
      const win = mocks.windows[0];
      await bringUp(win);
      fromPage(win, { type: "result", reqId: renders(win)[0].message.reqId, output: "M0 0" });
      await warmUp;

      for (let i = 0; i < 8; i++) await renderOnce(manager, win, withImage(`img${i}`, new Uint8Array([i])));
      await renderOnce(manager, win, withImage("img0")); // keeps img0 recent, so img1 is oldest
      expect(renders(win)[9].message.evict).toEqual([]);

      await renderOnce(manager, win, withImage("img8", new Uint8Array([8])));
      expect(renders(win)[10].message.evict).toEqual(["img1"]);
      manager.terminateAll();
    });

    it("keeps one plugin's held images apart from another's", async () => {
      const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme"), makeRecord("beta")]));
      const acme = manager.render("acme", withImage("img", new Uint8Array([1])));
      const acmeWin = mocks.windows[0];
      await bringUp(acmeWin);
      fromPage(acmeWin, { type: "result", reqId: renders(acmeWin)[0].message.reqId, output: "M0 0" });
      await acme;

      // Main still holds it, so beta can be asked by id — but beta's worker
      // has never seen it, so it gets the pixels.
      const beta = manager.render("beta", withImage("img"));
      const betaWin = mocks.windows[1];
      await bringUp(betaWin);
      expect(sentSource(betaWin, 0)).toMatchObject({ id: "img", store: true, values: expect.any(Uint8Array) });
      fromPage(betaWin, { type: "result", reqId: renders(betaWin)[0].message.reqId, output: "M0 0" });
      await beta;
      manager.terminateAll();
    });
  });
});
