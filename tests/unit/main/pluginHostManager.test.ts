import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BitmapPluginRegistry } from "../../../src/main/plugins/pluginRegistry";
import type { BitmapPluginRecord } from "../../../src/main/plugins/pluginManifest";

interface FakeWindow {
  id: number;
  destroyed: boolean;
  sent: { channel: string; message: Record<string, unknown> }[];
  handlers: Map<string, ((...args: unknown[]) => void)[]>;
  webContents: {
    id: number;
    send: (channel: string, message: Record<string, unknown>) => void;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
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
      webContents: { id, send: (channel, message) => win.sent.push({ channel, message }), on },
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

function makeRecord(id: string, renderTimeoutMs?: number): BitmapPluginRecord {
  return {
    manifest: { id, label: id, apiVersion: 1, defaults: {}, fields: [], renderTimeoutMs },
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
const luminance = { width: 1, height: 1, values: new Uint8Array([1]) };

describe("PluginHostManager", () => {
  beforeEach(() => {
    mocks.windows = [];
    mocks.ipc = new Map();
    mocks.nextId = 1;
  });

  afterEach(() => { vi.useRealTimers(); });

  it("rejects when the plugin id is not installed", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([]));
    await expect(manager.render("missing", luminance, {}, 1)).rejects.toThrow(/not installed/);
    manager.terminateAll();
  });

  it("brings up a sandboxed window and resolves a render from its result", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", luminance, { k: 1 }, 0.5);
    const win = mocks.windows[0];
    await bringUp(win);

    const sent = renders(win)[0].message;
    expect(sent).toMatchObject({ settings: { k: 1 }, baseScale: 0.5 });
    fromPage(win, { type: "result", reqId: sent.reqId, path: "M0 0" });

    await expect(promise).resolves.toBe("M0 0");
    manager.terminateAll();
  });

  it("reuses one window across repeated renders", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const first = manager.render("acme", luminance, {}, 1);
    const win = mocks.windows[0];
    await bringUp(win);
    fromPage(win, { type: "result", reqId: renders(win)[0].message.reqId, path: "A" });
    await first;

    const second = manager.render("acme", luminance, {}, 1);
    await vi.waitFor(() => expect(renders(win)).toHaveLength(2));
    fromPage(win, { type: "result", reqId: renders(win)[1].message.reqId, path: "B" });

    await expect(second).resolves.toBe("B");
    expect(mocks.windows).toHaveLength(1);
    manager.terminateAll();
  });

  it("rejects with the plugin's own message on a render error", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", luminance, {}, 1);
    const win = mocks.windows[0];
    await bringUp(win);
    fromPage(win, { type: "error", reqId: renders(win)[0].message.reqId, message: "deliberate failure" });

    await expect(promise).rejects.toThrow(/deliberate failure/);
    manager.terminateAll();
  });

  it("rejects and does not reuse the window after a load error", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const failed = manager.render("acme", luminance, {}, 1);
    const first = mocks.windows[0];
    fromPage(first, { type: "page-ready" });
    await vi.waitFor(() => expect(first.sent.some((s) => s.message.type === "init")).toBe(true));
    fromPage(first, { type: "load-error", message: "bad module" });

    await expect(failed).rejects.toThrow(/failed to load: bad module/);
    expect(first.destroyed).toBe(true);

    const retry = manager.render("acme", luminance, {}, 1);
    await vi.waitFor(() => expect(mocks.windows).toHaveLength(2));
    const second = mocks.windows[1];
    await bringUp(second);
    fromPage(second, { type: "result", reqId: renders(second)[0].message.reqId, path: "OK" });
    await expect(retry).resolves.toBe("OK");
    manager.terminateAll();
  });

  it("rejects pending work when the plugin's renderer process is gone", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", luminance, {}, 1);
    const win = mocks.windows[0];
    await bringUp(win);
    win.emit("render-process-gone", {}, { reason: "crashed" });

    await expect(promise).rejects.toThrow(/crashed/);
    manager.terminateAll();
  });

  it("times out a hung render, restarts the worker, and still serves work queued behind it", async () => {
    vi.useFakeTimers();
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme", 1000)]));
    const hung = manager.render("acme", luminance, {}, 1);
    // Settle-capture before advancing timers: the rejection lands while the
    // timer callback runs, so the handler has to already be attached.
    const hungOutcome = hung.then(() => null, (err: Error) => err.message);
    const queued = manager.render("acme", luminance, {}, 1);
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
    fromPage(win, { type: "result", reqId: renders(win)[1].message.reqId, path: "survived" });

    await expect(queued).resolves.toBe("survived");
    manager.terminateAll();
  });

  it("dispatches renders one at a time so each timeout starts when its render does", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const all = [0, 1, 2, 3].map(() => manager.render("acme", luminance, {}, 1));
    const win = mocks.windows[0];
    await bringUp(win);

    for (let i = 0; i < 4; i++) {
      await vi.waitFor(() => expect(renders(win)).toHaveLength(i + 1));
      fromPage(win, { type: "result", reqId: renders(win)[i].message.reqId, path: `c${i}` });
    }

    await expect(Promise.all(all)).resolves.toEqual(["c0", "c1", "c2", "c3"]);
    expect(mocks.windows).toHaveLength(1);
    manager.terminateAll();
  });

  it("fails a plugin that never finishes loading instead of hanging forever", async () => {
    vi.useFakeTimers();
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", luminance, {}, 1);
    const outcome = promise.then(() => null, (err: Error) => err.message);
    // Page comes up but the plugin's own module evaluation never returns, so
    // no "ready" ever arrives.
    fromPage(mocks.windows[0], { type: "page-ready" });

    await vi.advanceTimersByTimeAsync(10001);
    expect(await outcome).toMatch(/did not finish loading/);
    expect(mocks.windows[0].destroyed).toBe(true);
    manager.terminateAll();
  });

  it("ignores messages from a window that is not a known plugin host", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const promise = manager.render("acme", luminance, {}, 1);
    const win = mocks.windows[0];
    await bringUp(win);
    const reqId = renders(win)[0].message.reqId;

    fromPage({ webContents: { id: 9999 } } as unknown as FakeWindow, { type: "result", reqId, path: "spoofed" });
    fromPage(win, { type: "result", reqId, path: "genuine" });

    await expect(promise).resolves.toBe("genuine");
    manager.terminateAll();
  });

  it("drops warm hosts on invalidateAll so edited source is re-read", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme")]));
    const first = manager.render("acme", luminance, {}, 1);
    const win = mocks.windows[0];
    await bringUp(win);
    fromPage(win, { type: "result", reqId: renders(win)[0].message.reqId, path: "A" });
    await first;

    manager.invalidateAll();
    expect(win.destroyed).toBe(true);

    const next = manager.render("acme", luminance, {}, 1);
    await vi.waitFor(() => expect(mocks.windows).toHaveLength(2));
    const fresh = mocks.windows[1];
    await bringUp(fresh);
    fromPage(fresh, { type: "result", reqId: renders(fresh)[0].message.reqId, path: "B" });

    await expect(next).resolves.toBe("B");
    manager.terminateAll();
  });

  it("isolates plugins: one crashing leaves another's in-flight render alone", async () => {
    const manager = new PluginHostManager("/preload.js", makeRegistry([makeRecord("acme"), makeRecord("beta")]));
    const acme = manager.render("acme", luminance, {}, 1);
    const beta = manager.render("beta", luminance, {}, 1);
    const [acmeWin, betaWin] = mocks.windows;
    await bringUp(acmeWin);
    await bringUp(betaWin);

    acmeWin.emit("render-process-gone", {}, { reason: "oom" });
    await expect(acme).rejects.toThrow(/acme/);

    fromPage(betaWin, { type: "result", reqId: renders(betaWin)[0].message.reqId, path: "still fine" });
    await expect(beta).resolves.toBe("still fine");
    manager.terminateAll();
  });
});
