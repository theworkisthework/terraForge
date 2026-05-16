import { EventEmitter } from "events";
import { WebSocket } from "ws";
import { createWriteStream, createReadStream } from "fs";
import { stat } from "fs/promises";
import { lookup } from "dns/promises";
import FormData from "form-data";
import type { MachineStatus, RemoteFile } from "../types";
import {
  parseSdRemoteFiles,
  parseRemoteFiles,
} from "./fluidnc/parsers/fileParsers";
import {
  parseFirmwareProbeResponse,
  type FirmwareProbeInfo,
} from "./fluidnc/parsers/firmwareParser";
import { parseMachineStatus } from "./fluidnc/parsers/statusParser";
import { FluidNCRestClient } from "./fluidnc/transport/restClient";
import {
  disconnectFluidNCWebSocket,
  killFluidNCWebSocket,
  openFluidNCWebSocket,
  scheduleFluidNCReconnect,
} from "./fluidnc/transport/wsLifecycle";

// FluidNC HTTP REST + WebSocket client.
// All methods use the endpoints documented at:
// http://wiki.fluidnc.com/en/support/interface/http-rest-api

export class FluidNCClient extends EventEmitter {
  private baseUrl = "";
  private restClient = new FluidNCRestClient();
  private ws: WebSocket | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private wsHost = "";
  private wsPort = 80;
  private wsRetryDelay = 3000; // ms — doubles on each 503, resets on success
  private wsEnabled = false; // set false on disconnect to stop retry loop
  private debugLoggingEnabled = false;
  /**
   * Firmware major version detected during connectWebSocket.
   * null = unknown (probe failed or not yet connected).
   * Used to select the correct API surface (4.x REST vs 3.x command interface).
   */
  private fwMajor: number | null = null;
  /**
   * Full firmware version string, e.g. "FluidNC v4.0.1".
   * Emitted as a "firmware" event when first detected and cleared on disconnect.
   */
  private fwInfo: string | null = null;
  private static readonly uploadVerifyMaxAttempts = 6;
  private static readonly uploadVerifyDelayMs = 300;

  private getWsState() {
    return this as unknown as {
      ws: WebSocket | null;
      wsReconnectTimer: NodeJS.Timeout | null;
      wsHost: string;
      wsPort: number;
      wsRetryDelay: number;
      wsEnabled: boolean;
      wsGeneration: number;
    };
  }

  // ─── Configuration ────────────────────────────────────────────────────────

  setHost(host: string, port = 80): void {
    this.baseUrl = `http://${host}:${port}`;
    this.restClient.setBaseUrl(this.baseUrl);
    this.wsHost = host;
    this.wsPort = port;
  }

  setDebugLoggingEnabled(enabled: boolean): void {
    this.debugLoggingEnabled = enabled;
  }

  private emitDebugConsole(message: string): void {
    if (!this.debugLoggingEnabled) return;
    this.emit("console", message);
  }

  /**
   * Resolve a hostname to an IP address using Node's native DNS resolver,
   * which honours the system resolver (including mDNS/.local on Windows).
   * Node's fetch (undici) has its own resolver that does NOT handle mDNS,
   * so any HTTP call to a .local hostname must use the resolved IP instead.
   * Falls back to the original hostname if resolution fails.
   */
  private async resolveHost(host: string): Promise<string> {
    try {
      const { address } = await lookup(host, { family: 4 });
      return address;
    } catch {
      return host; // fall back; fetch may still work for plain IPs / hostnames
    }
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  async getStatus(): Promise<MachineStatus> {
    const res = await this.restClient.get("/state");
    const text = await res.text();
    return parseMachineStatus(text);
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  async sendCommand(cmd: string): Promise<string> {
    // Keep raw command execution unchanged; this only makes log output readable
    // and safe by escaping control characters and capping length.
    const logCmd = cmd
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(
        /[\x00-\x1F\x7F]/g,
        (ch) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`,
      )
      .slice(0, 200);
    const encodedCmd = encodeURIComponent(cmd);
    // FluidNC 3.x and 4.x require different command conventions.
    //
    // 3.x: POST /command with x-www-form-urlencoded body:
    //      commandText=CMD
    //
    // 4.x / WebUI convention: GET /command?commandText=CMD
    //
    // Some builds still accept GET /command?plain=CMD, so for 4.x/unknown we
    // try commandText first (matching WebUI) and fall back to plain.
    if (this.fwMajor !== null && this.fwMajor < 4) {
      this.emitDebugConsole(
        `[terraForge] CMD HTTP POST /command commandText=${logCmd}`,
      );
      const res = await this.restClient.post(
        "/command",
        `commandText=${encodedCmd}`,
      );
      const body = await res.text();
      const preview = body.trim().slice(0, 160).replace(/\n/g, "↵");
      this.emitDebugConsole(
        `[terraForge] CMD OK POST /command (${preview || "(empty)"})`,
      );
      return body;
    }
    // 4.x (or unknown — assume modern)
    try {
      this.emitDebugConsole(
        `[terraForge] CMD HTTP GET /command?commandText=${encodedCmd} (decoded: ${logCmd})`,
      );
      const res = await this.restClient.get(
        `/command?commandText=${encodedCmd}`,
        10_000,
      );
      const body = await res.text();
      const preview = body.trim().slice(0, 160).replace(/\n/g, "↵");
      this.emitDebugConsole(
        `[terraForge] CMD OK GET commandText (${preview || "(empty)"})`,
      );
      return body;
    } catch (error) {
      this.emitDebugConsole(
        `[terraForge] CMD RETRY GET plain (commandText failed: ${
          error instanceof Error ? error.message : String(error)
        })`,
      );
      this.emitDebugConsole(
        `[terraForge] CMD HTTP GET /command?plain=${encodedCmd} (decoded: ${logCmd})`,
      );
      const res = await this.restClient.get(
        `/command?plain=${encodedCmd}`,
        10_000,
      );
      const body = await res.text();
      const preview = body.trim().slice(0, 160).replace(/\n/g, "↵");
      this.emitDebugConsole(
        `[terraForge] CMD OK GET plain (${preview || "(empty)"})`,
      );
      return body;
    }
  }

  // ─── Job Control ──────────────────────────────────────────────────────────

  async runFile(
    remotePath: string,
    filesystem: "sd" | "fs" = "sd",
  ): Promise<void> {
    const cmd =
      filesystem === "sd"
        ? `$SD/Run=${remotePath}`
        : `$LocalFS/Run=${remotePath}`;
    // Delegate to sendCommand which handles the 3.x / 4.x HTTP convention difference.
    await this.sendCommand(cmd);
  }

  async pauseJob(): Promise<void> {
    // '!' is the Grbl/FluidNC realtime Feed Hold character — must be sent raw
    this.sendRealtime("!");
  }

  async resumeJob(): Promise<void> {
    // '~' is the Grbl/FluidNC realtime Cycle Start / Resume character — must be sent raw
    this.sendRealtime("~");
  }

  async abortJob(): Promise<void> {
    // 0x18 is the Grbl/FluidNC realtime Soft Reset character — must be sent raw
    this.sendRealtime("\x18");
  }

  /** Send a realtime command byte directly over the WebSocket (bypasses HTTP). */
  private sendRealtime(char: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(char);
    } else {
      // Fallback: send via HTTP command endpoint (may work depending on FW version)
      this.sendCommand(char).catch(() => {});
    }
  }

  // ─── File Management ─────────────────────────────────────────────────────

  async listFiles(remotePath = "/"): Promise<RemoteFile[]> {
    const encodedPath = remotePath
      .split("/")
      .map((seg) => (seg ? encodeURIComponent(seg) : seg))
      .join("/");
    const res = await this.restClient.get(`/files?path=${encodedPath}`);
    const json = (await res.json()) as {
      files: Array<{ name: string; size: number; dir?: boolean }>;
      path: string;
    };
    return parseRemoteFiles(remotePath, json);
  }

  // SD card file listing.
  // FluidNC 4.x / most 3.x: GET /upload?path=  (returns JSON with files[])
  // FluidNC 3.9.x slow SD: same endpoint but may need up to 30 s for init.
  // Directories are identified by size === "-1" (returned as a string).
  async listSDFiles(remotePath = "/"): Promise<RemoteFile[]> {
    // Use a generous 30 s timeout — SD card initialisation can be slow on
    // first access in FluidNC 3.x.
    //
    // Important: encode only individual path segments, NOT the slash separators.
    // FluidNC 3.x (ESP3D HTTP stack) resets the connection if it sees %2F in
    // the path query parameter. FluidNC 4.x accepts both forms, so this is
    // safe for all versions.
    const encodedPath = remotePath
      .split("/")
      .map((seg) => (seg ? encodeURIComponent(seg) : seg))
      .join("/");
    const res = await this.restClient.get(
      `/upload?path=${encodedPath}`,
      30_000,
    );

    let json: {
      files?: Array<{
        name: string;
        shortname?: string;
        size: string;
        datetime?: string;
      }>;
      path?: string;
      status?: string;
    };
    try {
      json = (await res.json()) as typeof json;
    } catch {
      throw new Error("SD card: unexpected response format");
    }

    return parseSdRemoteFiles(remotePath, json);
  }

  /** Fetch the text content of a remote file (for G-code preview). */
  async fetchFileText(
    remotePath: string,
    filesystem: "internal" | "sdcard" = "sdcard",
  ): Promise<string> {
    // FluidNC serves files directly by path:
    //   SD card:  GET /sd/filename.gcode
    //   LocalFS:  GET /localfs/filename  (or just /filename)
    const prefix = filesystem === "sdcard" ? "/sd" : "/localfs";
    const filePath = remotePath.startsWith("/") ? remotePath : `/${remotePath}`;
    // Pass 0 (no timeout) — large G-code files can take arbitrarily long to transfer.
    const res = await this.restClient.get(`${prefix}${filePath}`, 0);
    return res.text();
  }

  async deleteFile(
    remotePath: string,
    source: "sd" | "fs" = "fs",
  ): Promise<void> {
    const filePath = remotePath.startsWith("/") ? remotePath : `/${remotePath}`;
    if (this.fwMajor === null || this.fwMajor >= 4) {
      // FluidNC 4.x: WebDAV DELETE — same pattern for both volumes
      if (source === "sd") {
        await this.restClient.get(`/sd${filePath}`, 10_000, "DELETE");
      } else {
        await this.restClient.get(`/localfs${filePath}`, 10_000, "DELETE");
      }
    } else {
      // FluidNC 3.x
      if (source === "sd") {
        // Same REST endpoint as 4.x listing: GET /upload?path=<dir>&action=delete&filename=<name>
        // path = the directory (encodeURIComponent encodes "/" → "%2F" which 3.x expects for the path param)
        // filename = bare filename only (no leading slash)
        const parts = filePath.split("/");
        const name = parts.pop()!;
        const dir = parts.join("/") || "/";
        await this.restClient.get(
          `/upload?path=${encodeURIComponent(dir)}&action=delete&filename=${encodeURIComponent(name)}`,
          10_000,
        );
      } else {
        await this.sendCommand(`$LocalFS/Delete=${remotePath}`);
      }
    }
  }

  async uploadFile(
    localPath: string,
    remotePath: string,
    onProgress?: (percent: number) => void,
    /** Override the filename sent in the multipart form (what FluidNC writes to SD). */
    remoteFilename?: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) throw new Error("Upload cancelled");
    const stats = await stat(localPath);
    const total = stats.size;
    const { targetDir, targetFilename } = this.resolveUploadTarget(
      remotePath,
      localPath,
      remoteFilename,
    );
    let uploaded = 0;

    const form = new FormData();
    const stream = createReadStream(localPath);
    stream.on("data", (chunk) => {
      uploaded += Buffer.isBuffer(chunk)
        ? chunk.length
        : Buffer.byteLength(chunk);
      if (onProgress && total > 0) {
        // Bytes read from disk can get ahead of what the controller has
        // actually received, especially over unstable AP links.
        onProgress(Math.min(95, Math.round((uploaded / total) * 95)));
      }
    });

    form.append("path", targetDir);
    form.append("file", stream, {
      filename: targetFilename,
      knownLength: total,
    });

    await new Promise<void>((resolve, reject) => {
      const url = `${this.baseUrl}/upload`;
      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      const onAbort = () => {
        const abortErr = new Error("Upload cancelled");
        stream.destroy(abortErr);
        request?.destroy?.(abortErr);
        fail(abortErr);
      };

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      const request = form.submit(url, (err, res) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        if (err) return reject(err);
        res.resume();
        res.on("end", () => {
          if ((res.statusCode ?? 0) >= 400) {
            fail(new Error(`Upload failed: HTTP ${res.statusCode}`));
          } else {
            if (!settled) {
              settled = true;
              resolve();
            }
          }
        });
      });
    });

    await this.verifyUploadedFileSize(targetDir, targetFilename, total, signal);
    onProgress?.(100);
  }

  private resolveUploadTarget(
    remotePath: string,
    localPath: string,
    remoteFilename?: string,
  ): { targetDir: string; targetFilename: string } {
    const fallbackName = localPath.split(/[\\/]/).pop() ?? "upload.gcode";

    if (remoteFilename) {
      const normalizedRemotePath = (remotePath || "/").replace(/\\/g, "/");
      const inferredName = normalizedRemotePath.split("/").pop() || "";
      if (inferredName === remoteFilename) {
        const parent = normalizedRemotePath.slice(
          0,
          Math.max(1, normalizedRemotePath.length - remoteFilename.length - 1),
        );
        return {
          targetDir: parent || "/",
          targetFilename: remoteFilename,
        };
      }
      return {
        targetDir: normalizedRemotePath || "/",
        targetFilename: remoteFilename,
      };
    }

    const normalizedRemotePath = (remotePath || "/").replace(/\\/g, "/");
    if (normalizedRemotePath.endsWith("/")) {
      return {
        targetDir: normalizedRemotePath || "/",
        targetFilename: fallbackName,
      };
    }

    const split = normalizedRemotePath.split("/");
    const nameFromPath = split.pop() || fallbackName;
    const dirFromPath = split.join("/") || "/";
    return {
      targetDir: dirFromPath,
      targetFilename: nameFromPath,
    };
  }

  private async verifyUploadedFileSize(
    targetDir: string,
    targetFilename: string,
    expectedSize: number,
    signal?: AbortSignal,
  ): Promise<void> {
    let lastError: Error | null = null;

    for (
      let attempt = 1;
      attempt <= FluidNCClient.uploadVerifyMaxAttempts;
      attempt += 1
    ) {
      if (signal?.aborted) throw new Error("Upload cancelled");
      try {
        const [sdFiles, internalFiles] = await Promise.all([
          this.listSDFiles(targetDir).catch(() => [] as RemoteFile[]),
          this.listFiles(targetDir).catch(() => [] as RemoteFile[]),
        ]);
        const entry = [...sdFiles, ...internalFiles].find(
          (f) => !f.isDirectory && f.name === targetFilename,
        );

        if (entry && entry.size === expectedSize) return;

        if (entry) {
          lastError = new Error(
            `Upload verification failed: expected ${expectedSize} bytes, got ${entry.size} bytes for ${targetFilename}`,
          );
        } else {
          lastError = new Error(
            `Upload verification failed: ${targetFilename} not found in ${targetDir}`,
          );
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (attempt < FluidNCClient.uploadVerifyMaxAttempts) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, FluidNCClient.uploadVerifyDelayMs * attempt);
        });
      }
    }

    throw (
      lastError ?? new Error(`Upload verification failed for ${targetFilename}`)
    );
  }

  async downloadFile(
    remotePath: string,
    localPath: string,
    filesystem: "internal" | "sdcard" = "sdcard",
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) throw new Error("Download cancelled");
    const prefix = filesystem === "sdcard" ? "/sd" : "/localfs";
    const filePath = remotePath.startsWith("/") ? remotePath : `/${remotePath}`;
    // Large files can legitimately take much longer than the default HTTP timeout.
    const res = await this.restClient.get(
      `${prefix}${filePath}`,
      0,
      "GET",
      signal,
    );
    const total = Number(res.headers.get("content-length") ?? 0);
    let received = 0;

    const writer = createWriteStream(localPath);
    const writerWithEvents = writer as unknown as {
      on?: (event: string, listener: (...args: unknown[]) => void) => void;
    };
    const reader = res.body?.getReader();
    const readerWithCancel = reader as { cancel?: () => Promise<unknown> };
    if (!reader) throw new Error("No response body for download");

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        if (typeof readerWithCancel.cancel === "function") {
          readerWithCancel.cancel().catch(() => {});
        }
        writer.destroy();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const canListen = typeof writerWithEvents.on === "function";
      if (canListen) {
        writerWithEvents.on!("error", fail);
        writerWithEvents.on!("finish", () => {
          if (settled) return;
          settled = true;
          onProgress?.(100);
          resolve();
        });
      }

      const pump = async () => {
        try {
          while (true) {
            if (signal?.aborted) {
              throw new Error("Download cancelled");
            }
            const { done, value } = await reader.read();
            if (done) break;
            await new Promise<void>((resolveWrite, rejectWrite) => {
              let writeSettled = false;
              const finishWrite = (err?: unknown) => {
                if (writeSettled) return;
                writeSettled = true;
                if (err) rejectWrite(err);
                else resolveWrite();
              };

              try {
                writer.write(value, (err) => {
                  finishWrite(err);
                });

                // Unit-test mocks may not call write callbacks at all.
                if (!canListen) {
                  queueMicrotask(() => finishWrite());
                }
              } catch (err) {
                finishWrite(err);
              }
            });
            received += value.length;
            if (onProgress && total > 0) {
              onProgress(Math.round((received / total) * 100));
            }
          }
          writer.end();
          if (!canListen) {
            if (settled) return;
            settled = true;
            onProgress?.(100);
            resolve();
          }
        } catch (e) {
          fail(e);
        }
      };
      pump();
    });
  }

  // ─── WebSocket ────────────────────────────────────────────────────────────
  //
  // FluidNC (ESP3D) supports only ~3 simultaneous WebSocket slots.
  // To avoid stacking stale connections we use a generation counter:
  // every openWs() call gets a unique generation ID and all event handlers
  // bail out if they're from a superseded generation.

  private wsGeneration = 0;

  /**
   * Probe the controller over HTTP to determine FluidNC firmware version and
   * the WebSocket port.
   *
   * The [ESP800] response body contains everything we need, e.g.:
   *   "FW version: FluidNC v4.0.1 # ... # webcommunication: Sync: 80 # ..."
   *   "FW version: FluidNC v3.9.7 # ... # webcommunication: Sync: 81 # ..."
   *
   * The `webcommunication: Sync: <port>` field is the authoritative WS port
   * and is parsed directly rather than inferred from the major version.
   *
   * Returns null if all strategies fail or the controller is unreachable.
   */
  async probeFirmwareVersion(
    probeBaseUrl?: string,
  ): Promise<FirmwareProbeInfo | null> {
    const strategies: Array<() => Promise<string | null>> = [
      // Strategy 1: GET /command?plain=[ESP800] (ESP3D-compat, all versions)
      async () => {
        const base = probeBaseUrl ?? this.baseUrl;
        const url = `${base}/command?plain=${encodeURIComponent("[ESP800]")}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
        return res.ok ? res.text() : null;
      },
      // Strategy 2: POST /command commandText=[ESP800] (canonical FluidNC HTTP API)
      async () => {
        const base = probeBaseUrl ?? this.baseUrl;
        const res = await fetch(`${base}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `commandText=${encodeURIComponent("[ESP800]")}`,
          signal: AbortSignal.timeout(5_000),
        });
        return res.ok ? res.text() : null;
      },
      // Strategy 3: POST /command commandText=$I (Grbl build-info fallback)
      async () => {
        const base = probeBaseUrl ?? this.baseUrl;
        const res = await fetch(`${base}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `commandText=${encodeURIComponent("$I")}`,
          signal: AbortSignal.timeout(5_000),
        });
        return res.ok ? res.text() : null;
      },
    ];

    for (const strategy of strategies) {
      try {
        const body = await strategy();
        if (body !== null) {
          const parsed = parseFirmwareProbeResponse(body);
          if (parsed) return parsed;
          // Body returned but contained no version — log it for diagnostics
          const preview = body.trim().slice(0, 160).replace(/\n/g, "↵");
          this.emit(
            "console",
            `[terraForge] Probe: no version in response: "${preview || "(empty)"}"`,
          );
        }
      } catch (e) {
        this.emit(
          "console",
          `[terraForge] Probe strategy failed: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    return null;
  }

  async connectWebSocket(
    host: string,
    port: number,
    wsPort?: number,
  ): Promise<void> {
    this.wsHost = host;
    this.setHost(host, port);

    if (wsPort !== undefined) {
      // Explicit override from machine config — use as-is.
      this.wsPort = wsPort;
      this.emit("console", `[terraForge] WS port override: ${wsPort}`);
    } else {
      // Resolve the hostname to an IP first so that Node's fetch (undici) can
      // reach it. undici has its own DNS resolver that does not use the system
      // stub resolver and therefore cannot resolve mDNS .local names on Windows.
      // Node's dns.lookup() goes through the OS resolver (Bonjour/mDNS aware).
      const resolvedIp = await this.resolveHost(host);
      const probeBaseUrl = `http://${resolvedIp}:${port}`;
      if (resolvedIp !== host) {
        this.emit("console", `[terraForge] Resolved ${host} → ${resolvedIp}`);
        // Use the resolved IP for all subsequent HTTP calls — Node's fetch
        // (undici) cannot resolve mDNS .local names on Windows.
        this.baseUrl = probeBaseUrl;
        this.restClient.setBaseUrl(probeBaseUrl);
      }

      // Auto-detect via [ESP800] using the resolved IP.
      // The response contains "webcommunication: Sync: <port>" which is the
      // authoritative WS port — parse and use it directly.
      const probe = await this.probeFirmwareVersion(probeBaseUrl);
      if (probe) {
        this.fwMajor = probe.major;
        this.fwInfo = `FluidNC v${probe.version}`;
        this.emit("firmware", this.fwInfo);
        const detectedWsPort = probe.wsPort ?? (probe.major >= 4 ? port : 81);
        this.wsPort = detectedWsPort;
        const src =
          probe.wsPort !== null ? "ESP800 response" : "version heuristic";
        this.emit(
          "console",
          `[terraForge] Detected ${this.fwInfo} — WS port ${detectedWsPort} (from ${src})`,
        );
      } else {
        // Probe failed — default to same-port (FluidNC 4.x / modern behaviour).
        // If on FluidNC 3.x, set a WS port override of 81 in the machine config.
        this.wsPort = port;
        this.fwInfo = null;
        this.emit("firmware", null);
        this.emit(
          "console",
          `[terraForge] Firmware probe failed — assuming WS on port ${port} (set WS port override to 81 for FluidNC 3.x)`,
        );
      }
    }

    // Tear down any existing connection & pending reconnect first
    this.killWs();
    this.wsEnabled = true;
    this.wsRetryDelay = 3000;
    this.openWs();
  }

  disconnectWebSocket(): void {
    this.fwMajor = null;
    this.fwInfo = null;
    disconnectFluidNCWebSocket(this.getWsState(), {
      onFirmwareReset: () => this.emit("firmware", null),
    });
  }

  /** Hard-stop: cancel reconnect timer, terminate socket, bump generation. */
  private killWs(): void {
    killFluidNCWebSocket(this.getWsState());
  }

  private scheduleReconnect(gen: number): void {
    scheduleFluidNCReconnect(this.getWsState(), gen, () => this.openWs());
  }

  private openWs(): void {
    openFluidNCWebSocket(this.getWsState(), {
      parseStatus: parseMachineStatus,
      emitConsole: (message) => this.emit("console", message),
      emitStatus: (status) => this.emit("status", status),
      emitPing: () => this.emit("ping"),
      scheduleReconnect: (generation) => this.scheduleReconnect(generation),
      setWsPort: (port) => {
        this.wsPort = port;
      },
    });
  }
}
