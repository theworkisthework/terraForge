import { utilityProcess } from "electron";
import type { BitmapLuminance, BitmapRendererSettings } from "../../types";
import type { BitmapPluginRegistry } from "./pluginRegistry";

const DEFAULT_RENDER_TIMEOUT_MS = 4000;
const MAX_RENDER_TIMEOUT_MS = 15000;
const IDLE_RECYCLE_MS = 5 * 60 * 1000;
const IDLE_SWEEP_INTERVAL_MS = 60 * 1000;

type UtilityProcessHandle = ReturnType<typeof utilityProcess.fork>;

type HostToMainMessage =
  | { type: "ready" }
  | { type: "load-error"; message: string }
  | { type: "result"; reqId: string; path: string }
  | { type: "error"; reqId: string; message: string }
  | { type: "fatal"; message: string };

interface PendingRender {
  resolve: (path: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface ReadyWaiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

interface HostedPlugin {
  proc: UtilityProcessHandle;
  state: "starting" | "ready" | "terminated";
  pending: Map<string, PendingRender>;
  readyWaiters: ReadyWaiter[];
  lastUsedAt: number;
}

/**
 * Owns one isolated utilityProcess per installed bitmap-renderer plugin,
 * spawned lazily on first use and kept warm across subsequent renders. A
 * crash, timeout, or load failure in one plugin never affects any other —
 * that per-plugin isolation is the entire reason this exists (see the plan).
 */
export class PluginHostManager {
  private readonly hosts = new Map<string, HostedPlugin>();
  private nextReqId = 0;
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly hostEntryPath: string,
    private readonly registry: BitmapPluginRegistry,
  ) {
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

    const host = await this.ensureReady(pluginId, record.entryPath);
    const timeoutMs = Math.min(
      record.manifest.renderTimeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS,
      MAX_RENDER_TIMEOUT_MS,
    );

    return new Promise<string>((resolve, reject) => {
      const reqId = String(this.nextReqId++);
      const timer = setTimeout(() => {
        host.pending.delete(reqId);
        reject(new Error(`Plugin "${pluginId}" timed out after ${timeoutMs}ms.`));
        this.terminate(pluginId, host);
      }, timeoutMs);

      host.pending.set(reqId, { resolve, reject, timer });
      host.lastUsedAt = Date.now();
      host.proc.postMessage({ type: "render", reqId, luminance, settings, baseScale });
    });
  }

  /** Kills every live plugin process. Call once, on app quit. */
  terminateAll(): void {
    clearInterval(this.sweepTimer);
    for (const [pluginId, host] of this.hosts) {
      this.terminate(pluginId, host);
    }
  }

  private ensureReady(pluginId: string, entryPath: string): Promise<HostedPlugin> {
    const existing = this.hosts.get(pluginId);
    const host = existing && existing.state !== "terminated" ? existing : this.spawn(pluginId, entryPath);

    if (host.state === "ready") return Promise.resolve(host);

    return new Promise((resolve, reject) => {
      host.readyWaiters.push({ resolve: () => resolve(host), reject });
    });
  }

  private spawn(pluginId: string, entryPath: string): HostedPlugin {
    const proc = utilityProcess.fork(this.hostEntryPath, [], {
      stdio: "pipe",
      serviceName: `bitmap-plugin:${pluginId}`,
    });

    const host: HostedPlugin = {
      proc,
      state: "starting",
      pending: new Map(),
      readyWaiters: [],
      lastUsedAt: Date.now(),
    };
    this.hosts.set(pluginId, host);

    // Plugin console output is diagnostic-only — never surfaced in the app UI.
    proc.stdout?.on("data", (chunk: Buffer) =>
      console.log(`[bitmap-plugin:${pluginId}]`, chunk.toString().trimEnd()),
    );
    proc.stderr?.on("data", (chunk: Buffer) =>
      console.error(`[bitmap-plugin:${pluginId}]`, chunk.toString().trimEnd()),
    );

    proc.on("message", (message: HostToMainMessage) => this.handleMessage(pluginId, host, message));

    proc.on("exit", () => {
      this.failHost(pluginId, host, new Error(`Plugin "${pluginId}" process exited unexpectedly.`));
    });

    proc.postMessage({ type: "init", entryPath });
    return host;
  }

  private handleMessage(pluginId: string, host: HostedPlugin, message: HostToMainMessage): void {
    switch (message.type) {
      case "ready":
        host.state = "ready";
        host.readyWaiters.forEach((waiter) => waiter.resolve());
        host.readyWaiters = [];
        return;

      case "load-error":
        this.failHost(
          pluginId,
          host,
          new Error(`Plugin "${pluginId}" failed to load: ${message.message}`),
        );
        return;

      case "result": {
        const pending = host.pending.get(message.reqId);
        if (!pending) return;
        clearTimeout(pending.timer);
        host.pending.delete(message.reqId);
        pending.resolve(message.path);
        return;
      }

      case "error": {
        const pending = host.pending.get(message.reqId);
        if (!pending) return;
        clearTimeout(pending.timer);
        host.pending.delete(message.reqId);
        pending.reject(new Error(message.message));
        return;
      }

      case "fatal":
        this.failHost(pluginId, host, new Error(`Plugin "${pluginId}" crashed: ${message.message}`));
        return;
    }
  }

  /** Rejects every in-flight request/ready-waiter for a host and tears it down. */
  private failHost(pluginId: string, host: HostedPlugin, err: Error): void {
    if (host.state === "terminated") return;
    host.state = "terminated";

    host.readyWaiters.forEach((waiter) => waiter.reject(err));
    host.readyWaiters = [];

    for (const pending of host.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    host.pending.clear();

    if (this.hosts.get(pluginId) === host) this.hosts.delete(pluginId);
    host.proc.kill();
  }

  private terminate(pluginId: string, host: HostedPlugin): void {
    this.failHost(pluginId, host, new Error(`Plugin "${pluginId}" was terminated.`));
  }

  private sweepIdle(): void {
    const now = Date.now();
    for (const [pluginId, host] of this.hosts) {
      if (host.state === "ready" && host.pending.size === 0 && now - host.lastUsedAt > IDLE_RECYCLE_MS) {
        this.terminate(pluginId, host);
      }
    }
  }
}
