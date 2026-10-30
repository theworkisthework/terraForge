import { BrowserWindow, ipcMain } from "electron";
import type { PluginRenderContext, RendererOutput } from "../../types";
import type { RendererPluginRecord } from "./pluginManifest";
import type { RendererPluginRegistry } from "./pluginRegistry";
import { PLUGIN_HOST_ORIGIN } from "./pluginSandboxAssets";
import { markPluginHostWindow } from "./pluginHostWindows";
import { pluginSandboxSession } from "./pluginSandbox";
import { clipPluginText, exceedsOutputBudget } from "./pluginOutputBudget";
import { readPluginModules } from "./pluginSource";
import { PluginSourceCache, type CachedSource } from "./pluginSourceCache";

const DEFAULT_RENDER_TIMEOUT_MS = 4000;
const MIN_RENDER_TIMEOUT_MS = 500;
const MAX_RENDER_TIMEOUT_MS = 15000;
/** Budget for window load + plugin module evaluation, before any render runs. */
const LOAD_TIMEOUT_MS = 10000;
const IDLE_RECYCLE_MS = 5 * 60 * 1000;
const IDLE_SWEEP_INTERVAL_MS = 60 * 1000;
/**
 * How many source images, and how many bytes of them, one plugin's worker
 * keeps between renders. Eight covers re-rendering a four-ink separation
 * while flipping between two drawings; the byte cap fits a four-ink A2.
 */
const WORKER_MAX_SOURCES = 8;
const WORKER_MAX_SOURCE_BYTES = 128 * 1024 * 1024;

const TO_PAGE = "plugin-host:to-page";
const FROM_PAGE = "plugin-host:from-page";

type PageToMainMessage =
  | { type: "page-ready" }
  | { type: "ready" }
  | { type: "load-error"; message: string }
  | { type: "result"; reqId: string; output: RendererOutput }
  | { type: "error"; reqId: string; message: string };

interface PendingRender {
  reqId: string;
  /** The context as received, its source's pixels resolved into `source` instead. */
  context: Omit<PluginRenderContext, "source">;
  source: CachedSource | undefined;
  resolve: (output: RendererOutput) => void;
  reject: (err: Error) => void;
}

interface ReadyWaiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

interface HostedPlugin {
  pluginId: string;
  record: RendererPluginRecord;
  win: BrowserWindow;
  /**
   * Captured at spawn because a destroyed window can no longer be asked for
   * it, and `failHost` often runs exactly then (the `closed` event).
   */
  webContentsId: number;
  state: "starting" | "ready" | "terminated";
  /** Queued renders, dispatched one at a time — see `pump`. */
  queue: PendingRender[];
  active: PendingRender | null;
  activeTimer: NodeJS.Timeout | null;
  loadTimer: NodeJS.Timeout | null;
  readyWaiters: ReadyWaiter[];
  lastUsedAt: number;
  /**
   * The source images this host's worker holds, id → bytes, least recently
   * used first. Main decides what the worker keeps and tells it what to drop,
   * so this is an exact record rather than a guess, and it is emptied
   * whenever the worker is replaced.
   */
  workerSources: Map<string, number>;
}

/**
 * Owns one hidden, sandboxed BrowserWindow per installed bitmap-renderer
 * plugin, spawned lazily on first use and kept warm across renders.
 *
 * The window runs with `sandbox: true`, no Node integration and a
 * `connect-src 'none'` CSP, and the plugin's own code runs inside a Worker
 * within it. That gives two distinct guarantees:
 *
 *  - Security. Plugin code has no filesystem, no network and no Node API.
 *    The main process reads the plugin's source itself and posts it in as
 *    data; the plugin never reaches disk. This is an OS-level boundary
 *    (the Chromium sandbox), not a convention.
 *  - Stability. A crash, hang or infinite loop is contained to one plugin,
 *    and a wedged plugin is killed with `worker.terminate()` — the host page
 *    survives, so recovery costs a worker restart rather than a process
 *    respawn, and queued work for that plugin is not lost.
 *
 * Source images are sent once, not on every render: the main process keeps
 * recent ones (see `PluginSourceCache`) and so does each worker, and a
 * render sends pixels only to a side that does not already have them.
 */
export class PluginHostManager {
  private readonly hosts = new Map<string, HostedPlugin>();
  /** webContents id → host, so a page's messages can only affect its own plugin. */
  private readonly bySenderId = new Map<number, HostedPlugin>();
  private nextReqId = 0;
  private readonly sources = new PluginSourceCache();
  private readonly sweepTimer: NodeJS.Timeout;
  private readonly onPageMessage: (event: Electron.IpcMainEvent, message: PageToMainMessage) => void;

  constructor(
    private readonly preloadPath: string,
    private readonly registry: RendererPluginRegistry,
  ) {
    this.onPageMessage = (event, message) => {
      const host = this.bySenderId.get(event.sender.id);
      if (host && typeof message === "object" && message !== null) this.handleMessage(host, message);
    };
    ipcMain.on(FROM_PAGE, this.onPageMessage);

    this.sweepTimer = setInterval(() => this.sweepIdle(), IDLE_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  /**
   * Throws `PluginSourceMissingError` when `context.source` names an image by
   * id that is not held, so the caller can send it again with its pixels.
   */
  async render(pluginId: string, context: PluginRenderContext): Promise<RendererOutput> {
    const record = this.registry.find(pluginId);
    if (!record) {
      throw new Error(`Renderer plugin "${pluginId}" is not installed.`);
    }

    // Resolved up front, so the render holds its pixels however long it
    // queues, whatever the cache evicts meanwhile.
    const { source: ref, ...rest } = context;
    const source = ref ? this.sources.resolve(ref) : undefined;

    const host = await this.ensureReady(pluginId, record);

    return new Promise<RendererOutput>((resolve, reject) => {
      host.queue.push({ reqId: String(this.nextReqId++), context: rest, source, resolve, reject });
      host.lastUsedAt = Date.now();
      this.pump(host);
    });
  }

  /**
   * Call after a rescan. Drops the warm hosts whose plugin is gone or whose
   * source changed, and leaves the rest running — a rescan is something users
   * press freely, and it should not fail a render of a plugin that did not
   * change. A host whose fingerprint is unknown is dropped too, since there
   * is no way to show it still matches what is on disk.
   */
  invalidateChanged(): void {
    for (const host of [...this.hosts.values()]) {
      const current = this.registry.find(host.pluginId);
      const hash = current?.manifest.sourceHash;
      if (!current || hash === undefined || hash !== host.record.manifest.sourceHash) {
        this.failHost(host, new Error(`Plugin "${host.pluginId}" was reloaded.`));
      } else {
        // Same code, possibly a renamed folder or a new manifest object.
        host.record = current;
      }
    }
  }

  /** Tears down every live plugin host. Call once, on app quit. */
  terminateAll(): void {
    clearInterval(this.sweepTimer);
    ipcMain.off(FROM_PAGE, this.onPageMessage);
    this.sources.clear();
    for (const host of [...this.hosts.values()]) {
      this.failHost(host, new Error(`Plugin "${host.pluginId}" was terminated.`));
    }
  }

  private ensureReady(pluginId: string, record: RendererPluginRecord): Promise<HostedPlugin> {
    const existing = this.hosts.get(pluginId);
    const host = existing && existing.state !== "terminated" ? existing : this.spawn(pluginId, record);
    if (host.state === "ready") return Promise.resolve(host);

    return new Promise((resolve, reject) => {
      host.readyWaiters.push({ resolve: () => resolve(host), reject });
    });
  }

  private spawn(pluginId: string, record: RendererPluginRecord): HostedPlugin {
    const win = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        session: pluginSandboxSession(pluginId),
        preload: this.preloadPath,
        // A plugin is pure computation; it must never be throttled for being
        // in a window the user cannot see.
        backgroundThrottling: false,
      },
    });

    const host: HostedPlugin = {
      pluginId,
      record,
      win,
      webContentsId: win.webContents.id,
      state: "starting",
      queue: [],
      active: null,
      activeTimer: null,
      loadTimer: null,
      readyWaiters: [],
      lastUsedAt: Date.now(),
      workerSources: new Map(),
    };

    markPluginHostWindow(win);
    this.hosts.set(pluginId, host);
    this.bySenderId.set(host.webContentsId, host);
    this.armLoadTimer(host);

    // The host page is ours and never navigates or opens windows, so either
    // happening means something has gone wrong. Refuse both rather than let a
    // sandboxed page leave its fixed origin or spawn a window it controls.
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event) => event.preventDefault());
    win.webContents.on("render-process-gone", (_event, details) => {
      this.failHost(host, new Error(`Plugin "${pluginId}" crashed: ${details.reason}.`));
    });
    win.on("closed", () => {
      this.failHost(host, new Error(`Plugin "${pluginId}" host window closed unexpectedly.`));
    });

    void win.loadURL(`${PLUGIN_HOST_ORIGIN}/host.html`).catch((err: unknown) => {
      this.failHost(
        host,
        new Error(`Plugin "${pluginId}" host failed to load: ${err instanceof Error ? err.message : String(err)}`),
      );
    });

    return host;
  }

  private armLoadTimer(host: HostedPlugin): void {
    if (host.loadTimer) clearTimeout(host.loadTimer);
    host.loadTimer = setTimeout(() => {
      this.failHost(host, new Error(`Plugin "${host.pluginId}" did not finish loading within ${LOAD_TIMEOUT_MS}ms.`));
    }, LOAD_TIMEOUT_MS);
  }

  private handleMessage(host: HostedPlugin, message: PageToMainMessage): void {
    if (host.state === "terminated") return;

    switch (message.type) {
      case "page-ready":
        void this.sendInit(host);
        return;

      case "ready": {
        if (host.loadTimer) { clearTimeout(host.loadTimer); host.loadTimer = null; }
        host.state = "ready";
        const waiters = host.readyWaiters;
        host.readyWaiters = [];
        waiters.forEach((waiter) => waiter.resolve());
        this.pump(host);
        return;
      }

      case "load-error":
        this.failHost(host, new Error(`Plugin "${host.pluginId}" failed to load: ${clipPluginText(message.message)}`));
        return;

      case "result": {
        const pending = this.takeActive(host, message.reqId);
        if (!pending) return;
        // The host page bounds a result before sending it, but this process
        // is the last stop before the renderer and does not take that on
        // trust: a result over budget is refused, not forwarded.
        if (exceedsOutputBudget(message.output)) {
          pending.reject(new Error(`Plugin "${host.pluginId}" returned more data than a render may produce.`));
        } else {
          pending.resolve(message.output);
        }
        this.pump(host);
        return;
      }

      case "error": {
        const pending = this.takeActive(host, message.reqId);
        if (!pending) return;
        // Bounded like a result is: the message is plugin-supplied text, and
        // it goes on to the renderer.
        pending.reject(new Error(clipPluginText(message.message)));
        this.pump(host);
        return;
      }
    }
  }

  /** Reads the plugin's source in the main process and posts it into the sandbox. */
  private async sendInit(host: HostedPlugin): Promise<void> {
    try {
      // The snapshot taken at discovery when there is one, so the code that
      // runs is the code that was fingerprinted.
      const { modules, entry } = host.record.source ?? (await readPluginModules(host.record));
      if (host.state === "terminated" || host.win.isDestroyed()) return;
      // The page starts a fresh worker on every init, holding nothing.
      host.workerSources.clear();
      host.win.webContents.send(TO_PAGE, { type: "init", modules, entry });
    } catch (err) {
      this.failHost(
        host,
        new Error(
          `Plugin "${host.pluginId}" source could not be read: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  }

  private takeActive(host: HostedPlugin, reqId: string): PendingRender | null {
    if (!host.active || host.active.reqId !== reqId) return null;
    if (host.activeTimer) { clearTimeout(host.activeTimer); host.activeTimer = null; }
    const pending = host.active;
    host.active = null;
    host.lastUsedAt = Date.now();
    return pending;
  }

  /**
   * Dispatches at most one render at a time per plugin. Serialising matters
   * for more than fairness: a colour separation fans one bitmap out into
   * three or four channel renders at once, and a shared worker runs them in
   * sequence regardless. Timing them all from the moment they were queued
   * would make the last channel's deadline expire while it was still waiting
   * its turn, so each render's timeout starts when it is actually dispatched.
   */
  private pump(host: HostedPlugin): void {
    if (host.state !== "ready" || host.active || host.queue.length === 0) return;
    if (host.win.isDestroyed()) return;

    const next = host.queue.shift()!;
    host.active = next;
    host.lastUsedAt = Date.now();

    const timeoutMs = Math.min(
      Math.max(host.record.manifest.renderTimeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS, MIN_RENDER_TIMEOUT_MS),
      MAX_RENDER_TIMEOUT_MS,
    );
    host.activeTimer = setTimeout(() => this.onRenderTimeout(host, timeoutMs), timeoutMs);

    const { source, evict } = this.sourceForWorker(host, next.source);
    host.win.webContents.send(TO_PAGE, {
      type: "render",
      reqId: next.reqId,
      context: { ...next.context, source },
      evict,
    });
  }

  /**
   * What to send the worker for a render's source: the id alone when the
   * worker already holds it, otherwise the pixels too, with `store` telling
   * the worker whether to keep them and `evict` naming what it must drop to
   * make room. Least recently used goes first.
   */
  private sourceForWorker(
    host: HostedPlugin,
    source: CachedSource | undefined,
  ): { source?: Record<string, unknown>; evict: string[] } {
    if (!source) return { evict: [] };
    const ref = { id: source.id, width: source.width, height: source.height };
    const held = host.workerSources;

    const bytes = held.get(source.id);
    if (bytes !== undefined) {
      held.delete(source.id);
      held.set(source.id, bytes);
      return { source: ref, evict: [] };
    }

    const size = source.values.byteLength;
    if (size > WORKER_MAX_SOURCE_BYTES) return { source: { ...ref, values: source.values, store: false }, evict: [] };

    held.set(source.id, size);
    let total = 0;
    for (const value of held.values()) total += value;
    const evict: string[] = [];
    for (const [id, value] of held) {
      if (id === source.id) break;
      if (held.size <= WORKER_MAX_SOURCES && total <= WORKER_MAX_SOURCE_BYTES) break;
      held.delete(id);
      total -= value;
      evict.push(id);
    }
    return { source: { ...ref, values: source.values, store: true }, evict };
  }

  /**
   * A hung render kills only the worker, not the host window. Anything still
   * queued for this plugin survives and runs against the fresh worker, so one
   * slow channel cannot fail the whole separation.
   */
  private onRenderTimeout(host: HostedPlugin, timeoutMs: number): void {
    const pending = host.active;
    host.activeTimer = null;
    host.active = null;
    pending?.reject(new Error(`Plugin "${host.pluginId}" timed out after ${timeoutMs}ms.`));

    if (host.state === "terminated" || host.win.isDestroyed()) return;
    host.state = "starting";
    host.workerSources.clear();
    this.armLoadTimer(host);
    host.win.webContents.send(TO_PAGE, { type: "restart" });
  }

  /** Rejects every waiter and in-flight/queued render for a host, then destroys it. */
  private failHost(host: HostedPlugin, err: Error): void {
    if (host.state === "terminated") return;
    host.state = "terminated";

    if (host.loadTimer) { clearTimeout(host.loadTimer); host.loadTimer = null; }
    if (host.activeTimer) { clearTimeout(host.activeTimer); host.activeTimer = null; }

    const waiters = host.readyWaiters;
    host.readyWaiters = [];
    waiters.forEach((waiter) => waiter.reject(err));

    const outstanding = [host.active, ...host.queue].filter((entry): entry is PendingRender => entry !== null);
    host.active = null;
    host.queue = [];
    outstanding.forEach((entry) => entry.reject(err));

    if (this.hosts.get(host.pluginId) === host) this.hosts.delete(host.pluginId);
    this.bySenderId.delete(host.webContentsId);
    if (!host.win.isDestroyed()) host.win.destroy();
  }

  private sweepIdle(): void {
    const now = Date.now();
    this.sources.sweep(now);
    for (const host of [...this.hosts.values()]) {
      const idle = now - host.lastUsedAt > IDLE_RECYCLE_MS;
      const busy = host.active !== null || host.queue.length > 0;
      // "starting" is swept too: a host that never reached ready is wedged,
      // and its load timer has already rejected anyone waiting on it.
      if (!busy && idle) {
        this.failHost(host, new Error(`Plugin "${host.pluginId}" was recycled after being idle.`));
      }
    }
  }
}
