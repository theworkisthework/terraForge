import type { MachineStatus, RemoteFile } from "../types";
import { parseSdRemoteFiles, parseRemoteFiles } from "../machine/fluidnc/parsers/fileParsers";
import {
  parseFirmwareProbeResponse,
  type FirmwareProbeInfo,
} from "../machine/fluidnc/parsers/firmwareParser";
import { parseMachineStatus } from "../machine/fluidnc/parsers/statusParser";
import { Emitter } from "./emitter";
import { http, httpOk, httpBinary, uploadMultipart } from "./http";

// Browser/WebView port of src/machine/fluidnc.ts. Same protocol handling
// (3.x vs 4.x conventions, WS-port probing, generation-guarded reconnect),
// but built on fetch/XHR/WebSocket instead of Node's http, fs and `ws`.

type Events = {
  status: [MachineStatus];
  console: [string];
  ping: [];
  firmware: [string | null];
};

const encodePath = (p: string) =>
  p
    .split("/")
    .map((seg) => (seg ? encodeURIComponent(seg) : seg))
    .join("/");

export class WebFluidNCClient extends Emitter<Events> {
  private baseUrl = "";
  private ws: WebSocket | null = null;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wsHost = "";
  private wsPort = 80;
  private wsRetryDelay = 3000;
  private wsEnabled = false;
  private wsGeneration = 0;
  private debugLoggingEnabled = false;
  private fwMajor: number | null = null;

  private static readonly uploadVerifyMaxAttempts = 6;
  private static readonly uploadVerifyDelayMs = 300;

  setHost(host: string, port = 80): void {
    this.baseUrl = `http://${host}:${port}`;
    this.wsHost = host;
    this.wsPort = port;
  }

  setDebugLoggingEnabled(enabled: boolean): void {
    this.debugLoggingEnabled = enabled;
  }

  private debug(message: string): void {
    if (this.debugLoggingEnabled) this.emit("console", message);
  }

  // ─── Status / commands ────────────────────────────────────────────────────

  async getStatus(): Promise<MachineStatus> {
    const res = await httpOk(`${this.baseUrl}/state`);
    return parseMachineStatus(res.text);
  }

  async sendCommand(cmd: string): Promise<string> {
    const encoded = encodeURIComponent(cmd);
    if (this.fwMajor !== null && this.fwMajor < 4) {
      this.debug(`[terraForge] CMD HTTP POST /command commandText=${cmd}`);
      const res = await httpOk(`${this.baseUrl}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `commandText=${encoded}`,
      });
      return res.text;
    }
    try {
      this.debug(`[terraForge] CMD HTTP GET /command?commandText=${encoded}`);
      return (await httpOk(`${this.baseUrl}/command?commandText=${encoded}`))
        .text;
    } catch (error) {
      this.debug(
        `[terraForge] CMD RETRY GET plain (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
      return (await httpOk(`${this.baseUrl}/command?plain=${encoded}`)).text;
    }
  }

  // ─── Job control ──────────────────────────────────────────────────────────

  async runFile(remotePath: string, filesystem: "sd" | "fs" = "sd") {
    await this.sendCommand(
      filesystem === "sd"
        ? `$SD/Run=${remotePath}`
        : `$LocalFS/Run=${remotePath}`,
    );
  }

  async pauseJob() {
    this.sendRealtime("!");
  }
  async resumeJob() {
    this.sendRealtime("~");
  }
  async abortJob() {
    this.sendRealtime("\x18");
  }

  private sendRealtime(char: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(char);
    else this.sendCommand(char).catch(() => {});
  }

  // ─── Files ────────────────────────────────────────────────────────────────

  async listFiles(remotePath = "/"): Promise<RemoteFile[]> {
    const res = await httpOk(`${this.baseUrl}/files?path=${encodePath(remotePath)}`);
    return parseRemoteFiles(remotePath, JSON.parse(res.text));
  }

  async listSDFiles(remotePath = "/"): Promise<RemoteFile[]> {
    // SD init can be slow on FluidNC 3.x; only encode segments, never "/"
    // (3.x resets the connection on %2F).
    const res = await httpOk(
      `${this.baseUrl}/upload?path=${encodePath(remotePath)}`,
      { timeoutMs: 30_000 },
    );
    let json;
    try {
      json = JSON.parse(res.text);
    } catch {
      throw new Error("SD card: unexpected response format");
    }
    return parseSdRemoteFiles(remotePath, json);
  }

  private remoteUrl(remotePath: string, filesystem: "internal" | "sdcard") {
    const prefix = filesystem === "sdcard" ? "/sd" : "/localfs";
    const filePath = remotePath.startsWith("/") ? remotePath : `/${remotePath}`;
    return `${this.baseUrl}${prefix}${filePath}`;
  }

  async fetchFileText(
    remotePath: string,
    filesystem: "internal" | "sdcard" = "sdcard",
  ): Promise<string> {
    return (await httpOk(this.remoteUrl(remotePath, filesystem), { timeoutMs: 0 }))
      .text;
  }

  async downloadBytes(
    remotePath: string,
    filesystem: "internal" | "sdcard" = "sdcard",
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return httpBinary(this.remoteUrl(remotePath, filesystem), onProgress, signal);
  }

  async deleteFile(remotePath: string, source: "sd" | "fs" = "fs") {
    const filePath = remotePath.startsWith("/") ? remotePath : `/${remotePath}`;
    if (this.fwMajor === null || this.fwMajor >= 4) {
      await httpOk(
        `${this.baseUrl}${source === "sd" ? "/sd" : "/localfs"}${filePath}`,
        { method: "DELETE" },
      );
    } else if (source === "sd") {
      const parts = filePath.split("/");
      const name = parts.pop()!;
      const dir = parts.join("/") || "/";
      await httpOk(
        `${this.baseUrl}/upload?path=${encodeURIComponent(dir)}&action=delete&filename=${encodeURIComponent(name)}`,
      );
    } else {
      await this.sendCommand(`$LocalFS/Delete=${remotePath}`);
    }
  }

  async uploadData(
    data: Uint8Array | string,
    remotePath: string,
    fallbackName: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) throw new Error("Upload cancelled");
    const total =
      typeof data === "string" ? new Blob([data]).size : data.byteLength;
    const { targetDir, targetFilename } = resolveUploadTarget(
      remotePath,
      fallbackName,
    );
    await uploadMultipart(
      `${this.baseUrl}/upload`,
      { path: targetDir },
      { name: targetFilename, data },
      onProgress,
      signal,
    );
    await this.verifyUploadedFileSize(targetDir, targetFilename, total, signal);
    onProgress?.(100);
  }

  private async verifyUploadedFileSize(
    dir: string,
    name: string,
    expected: number,
    signal?: AbortSignal,
  ): Promise<void> {
    let lastError: Error | null = null;
    const max = WebFluidNCClient.uploadVerifyMaxAttempts;
    for (let attempt = 1; attempt <= max; attempt++) {
      if (signal?.aborted) throw new Error("Upload cancelled");
      try {
        const [sd, internal] = await Promise.all([
          this.listSDFiles(dir).catch(() => [] as RemoteFile[]),
          this.listFiles(dir).catch(() => [] as RemoteFile[]),
        ]);
        const entry = [...sd, ...internal].find(
          (f) => !f.isDirectory && f.name === name,
        );
        if (entry && entry.size === expected) return;
        lastError = new Error(
          entry
            ? `Upload verification failed: expected ${expected} bytes, got ${entry.size} bytes for ${name}`
            : `Upload verification failed: ${name} not found in ${dir}`,
        );
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      if (attempt < max)
        await new Promise((r) =>
          setTimeout(r, WebFluidNCClient.uploadVerifyDelayMs * attempt),
        );
    }
    throw lastError ?? new Error(`Upload verification failed for ${name}`);
  }

  // ─── Connection ───────────────────────────────────────────────────────────

  async probeFirmwareVersion(): Promise<FirmwareProbeInfo | null> {
    const esp800 = encodeURIComponent("[ESP800]");
    const strategies: Array<() => Promise<string | null>> = [
      async () => {
        const r = await http(`${this.baseUrl}/command?plain=${esp800}`, {
          timeoutMs: 5000,
        });
        return r.ok ? r.text : null;
      },
      async () => {
        const r = await http(`${this.baseUrl}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `commandText=${esp800}`,
          timeoutMs: 5000,
        });
        return r.ok ? r.text : null;
      },
      async () => {
        const r = await http(`${this.baseUrl}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `commandText=${encodeURIComponent("$I")}`,
          timeoutMs: 5000,
        });
        return r.ok ? r.text : null;
      },
    ];
    for (const strategy of strategies) {
      try {
        const body = await strategy();
        if (body !== null) {
          const parsed = parseFirmwareProbeResponse(body);
          if (parsed) return parsed;
          this.emit(
            "console",
            `[terraForge] Probe: no version in response: "${body.trim().slice(0, 160).replace(/\n/g, "↵") || "(empty)"}"`,
          );
        }
      } catch (e) {
        this.emit(
          "console",
          `[terraForge] Probe strategy failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return null;
  }

  async connectWebSocket(host: string, port: number, wsPort?: number) {
    this.setHost(host, port);
    if (wsPort !== undefined) {
      this.wsPort = wsPort;
      this.emit("console", `[terraForge] WS port override: ${wsPort}`);
    } else {
      // Android resolves .local names natively (CapacitorHttp / WebSocket go
      // through the OS resolver), so no manual DNS step is needed here.
      const probe = await this.probeFirmwareVersion();
      if (probe) {
        this.fwMajor = probe.major;
        const info = `FluidNC v${probe.version}`;
        this.emit("firmware", info);
        this.wsPort = probe.wsPort ?? (probe.major >= 4 ? port : 81);
        this.emit(
          "console",
          `[terraForge] Detected ${info} — WS port ${this.wsPort}`,
        );
      } else {
        this.wsPort = port;
        this.emit("firmware", null);
        this.emit(
          "console",
          `[terraForge] Firmware probe failed — assuming WS on port ${port} (set WS port override to 81 for FluidNC 3.x)`,
        );
      }
    }
    this.killWs();
    this.wsEnabled = true;
    this.wsRetryDelay = 3000;
    this.openWs();
  }

  disconnectWebSocket(): void {
    this.fwMajor = null;
    this.wsEnabled = false;
    this.wsGeneration++;
    this.clearReconnect();
    if (this.ws) {
      try {
        this.ws.close(1000);
      } catch {
        // already closed
      }
      this.ws = null;
    }
    this.emit("firmware", null);
  }

  private clearReconnect() {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
  }

  private killWs(): void {
    this.wsEnabled = false;
    this.wsGeneration++;
    this.clearReconnect();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // already dead
      }
      this.ws = null;
    }
  }

  private scheduleReconnect(gen: number): void {
    if (!this.wsEnabled || gen !== this.wsGeneration) return;
    this.wsReconnectTimer = setTimeout(() => this.openWs(), this.wsRetryDelay);
    this.wsRetryDelay = Math.min(this.wsRetryDelay * 2, 60_000);
  }

  private openWs(): void {
    if (!this.wsEnabled) return;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore stale socket failures
      }
      this.ws = null;
    }
    const gen = ++this.wsGeneration;
    const ws = new WebSocket(`ws://${this.wsHost}:${this.wsPort}/`);
    this.ws = ws;
    // FluidNC sends command output (e.g. the $$ dump, error:/[MSG:] lines) as
    // binary frames. Node's `ws` stringifies those for us; a browser would
    // hand back Blobs, so ask for ArrayBuffers and decode them ourselves.
    ws.binaryType = "arraybuffer";
    const decoder = new TextDecoder();
    let opened = false;

    ws.onopen = () => {
      if (gen !== this.wsGeneration) return ws.close();
      opened = true;
      this.wsRetryDelay = 3000;
      this.emit("console", "[terraForge] WebSocket connected");
      try {
        ws.send("$RI=500\n");
      } catch {
        // ignore send errors during startup
      }
    };

    ws.onmessage = (ev) => {
      if (gen !== this.wsGeneration) return;
      const text = (
        typeof ev.data === "string"
          ? ev.data
          : ev.data instanceof ArrayBuffer
            ? decoder.decode(ev.data)
            : ""
      ).trim();
      if (text.startsWith("<")) return this.emit("status", parseMachineStatus(text));
      if (text === "PING" || text.startsWith("PING:")) return this.emit("ping");
      if (/^(currentID|CURRENT_ID|activeID|ACTIVE_ID):/.test(text)) return;
      if (text.length > 0) this.emit("console", text);
    };

    ws.onclose = () => {
      if (gen !== this.wsGeneration) return;
      // Browsers don't expose the HTTP failure reason, so a socket that never
      // opened on a non-81 port is most likely FluidNC 3.x answering with a
      // plain HTTP response instead of a 101 Upgrade — fall back to 81 once.
      if (!opened && this.wsPort !== 81 && this.fwMajor === null) {
        this.emit(
          "console",
          `[terraForge] WS failed on port ${this.wsPort} — trying port 81 (FluidNC 3.x)`,
        );
        this.wsPort = 81;
        this.wsRetryDelay = 3000;
      } else if (this.wsRetryDelay <= 3000) {
        this.emit("console", "[terraForge] WebSocket disconnected — retrying…");
      }
      this.scheduleReconnect(gen);
    };

    ws.onerror = () => {
      // onclose always follows and handles retry/logging.
    };
  }
}

function resolveUploadTarget(
  remotePath: string,
  fallbackName: string,
): { targetDir: string; targetFilename: string } {
  const normalized = (remotePath || "/").replace(/\\/g, "/");
  if (normalized.endsWith("/")) {
    return { targetDir: normalized || "/", targetFilename: fallbackName };
  }
  const parts = normalized.split("/");
  const name = parts.pop() || fallbackName;
  return { targetDir: parts.join("/") || "/", targetFilename: name };
}
