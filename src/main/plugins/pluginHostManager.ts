import { BrowserWindow, ipcMain } from "electron";
import type { BitmapLuminance, BitmapRendererSettings } from "../../types";
import type { BitmapPluginRecord } from "./pluginManifest";
import type { BitmapPluginRegistry } from "./pluginRegistry";
import { PLUGIN_HOST_ORIGIN } from "./pluginSandboxAssets";
import { markPluginHostWindow } from "./pluginHostWindows";
import { pluginSandboxSession } from "./pluginSandbox";
import { readPluginModules } from "./pluginSource";

const DEFAULT_RENDER_TIMEOUT_MS = 4000;
const MIN_RENDER_TIMEOUT_MS = 500;
const MAX_RENDER_TIMEOUT_MS = 15000;
/** Budget for window load + plugin module evaluation, before any render runs. */
const LOAD_TIMEOUT_MS = 10000;
const IDLE_RECYCLE_MS = 5 * 60 * 1000;
const IDLE_SWEEP_INTERVAL_MS = 60 * 1000;

const TO_PAGE = "plugin-host:to-page";
const FROM_PAGE = "plugin-host:from-page";

type PageToMainMessage =
  | { type: "page-ready" }
  | { type: "ready" }
  | { type: "load-error"; message: string }
  | { type: "result"; reqId: string; path: string }
  | { type: "error"; reqId: string; message: string };

interface PendingRender {
  reqId: string;
  luminance: BitmapLuminance;
  settings: BitmapRendererSettings;
  baseScale: number;
  resolve: (path: string) => void;
  reject: (err: Error) => void;
}

interface ReadyWaiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

interface HostedPlugin {
  pluginId: string;
  record: BitmapPluginRecord;
  win: BrowserWindow;
  state: "starting" | "ready" | "terminated";
  /** Queued renders, dispatched one at a time — see `pump`. */
  queue: PendingRender[];
  active: PendingRender | null;
  activeTimer: NodeJS.Timeout | null;
  loadTimer: NodeJS.Timeout | null;
  readyWaiters: ReadyWaiter[];
  lastUsedAt: number;
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
 */
export class PluginHostManager {
  private readonly hosts = new Map<string, HostedPlugin>();
  /** webContents id → host, so a page's messages can only affect its own plugin. */
  private readonly bySenderId = new Map<number, HostedPlugin>();
  private nextReqId = 0;
  private readonly sweepTimer: NodeJS.Timeout;
  private readonly onPageMessage: (event: Electron.IpcMainEvent, message: PageToMainMessage) => void;

  constructor(
    private readonly preloadPath: string,
    private readonly registry: BitmapPluginRegistry,
  ) {
    this.onPageMessage = (event, message) => {
      const host = this.bySenderId.get(event.sender.id);
      if (host) this.handleMessage(host, message);
    };
    ipcMain.on(FROM_PAGE, this.onPageMessage);

    this.sweepTimer = setInterval(() => this.sweepIdle(), IDLE_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  async render(
    pluginId: string,
    luminance: BitmapLuminance,
    settings: BitmapRendererSettings,
    baseScale: number,
  ): Promise<string> {
    const record = this.registry.find(pluginId);
    if (!record) {
      throw new Error(`Bitmap renderer plugin "${pluginId}" is not installed.`);
    }

    const host = await this.ensureReady(pluginId, record);

    return new Promise<string>((resolve, reject) => {
      host.queue.push({
        reqId: String(this.nextReqId++),
        luminance,
        settings,
        baseScale,
        resolve,
        reject,
      });
      host.lastUsedAt = Date.now();
      this.pump(host);
    });
  }

  /**
   * Drops any warm host for a plugin so the next render re-reads its source
   * from disk. Call after a rescan — a live worker holds the plugin's modules
   * in memory, so an edited plugin would otherwise keep running old code.
   */
  invalidate(pluginId: string): void {
    const host = this.hosts.get(pluginId);
    if (host) this.failHost(host, new Error(`Plugin "${pluginId}" was reloaded.`));
  }

  /** Drops every warm host — see `invalidate`. Call after a rescan. */
  invalidateAll(): void {
    for (const host of [...this.hosts.values()]) {
      this.failHost(host, new Error(`Plugin "${host.pluginId}" was reloaded.`));
    }
  }

  /** Tears down every live plugin host. Call once, on app quit. */
  terminateAll(): void {
    clearInterval(this.sweepTimer);
    ipcMain.off(FROM_PAGE, this.onPageMessage);
    for (const host of [...this.hosts.values()]) {
      this.failHost(host, new Error(`Plugin "${host.pluginId}" was terminated.`));
    }
  }

  private ensureReady(pluginId: string, record: BitmapPluginRecord): Promise<HostedPlugin> {
    const existing = this.hosts.get(pluginId);
    const host = existing && existing.state !== "terminated" ? existing : this.spawn(pluginId, record);
    if (host.state === "ready") return Promise.resolve(host);

    return new Promise((resolve, reject) => {
      host.readyWaiters.push({ resolve: () => resolve(host), reject });
    });
  }

  private spawn(pluginId: string, record: BitmapPluginRecord): HostedPlugin {
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
      state: "starting",
      queue: [],
      active: null,
      activeTimer: null,
      loadTimer: null,
      readyWaiters: [],
      lastUsedAt: Date.now(),
    };

    markPluginHostWindow(win);
    this.hosts.set(pluginId, host);
    this.bySenderId.set(win.webContents.id, host);
    this.armLoadTimer(host);

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
        this.failHost(host, new Error(`Plugin "${host.pluginId}" failed to load: ${message.message}`));
        return;

      case "result": {
        const pending = this.takeActive(host, message.reqId);
        if (!pending) return;
        pending.resolve(message.path);
        this.pump(host);
        return;
      }

      case "error": {
        const pending = this.takeActive(host, message.reqId);
        if (!pending) return;
        pending.reject(new Error(message.message));
        this.pump(host);
        return;
      }
    }
  }

  /** Reads the plugin's source in the main process and posts it into the sandbox. */
  private async sendInit(host: HostedPlugin): Promise<void> {
    try {
      const { modules, entry } = await readPluginModules(host.record);
      if (host.state === "terminated" || host.win.isDestroyed()) return;
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

    host.win.webContents.send(TO_PAGE, {
      type: "render",
      reqId: next.reqId,
      luminance: next.luminance,
      settings: next.settings,
      baseScale: next.baseScale,
    });
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
    if (!host.win.isDestroyed()) {
      this.bySenderId.delete(host.win.webContents.id);
      host.win.destroy();
    }
  }

  private sweepIdle(): void {
    const now = Date.now();
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
