import { EventEmitter } from "events";
import { WebSocket } from "ws";
import { createWriteStream, createReadStream } from "fs";
import { rename, rm, stat } from "fs/promises";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";
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
import {
  FluidNCHttpError,
  FluidNCRestClient,
  isTimeoutError,
} from "./fluidnc/transport/restClient";
import {
  disconnectFluidNCWebSocket,
  killFluidNCWebSocket,
  openFluidNCWebSocket,
  scheduleFluidNCReconnect,
} from "./fluidnc/transport/wsLifecycle";

// FluidNC HTTP REST + WebSocket client.
// All methods use the endpoints documented at:
// http://wiki.fluidnc.com/en/support/interface/http-rest-api

/**
 * Percent-encodes a remote path for use in a URL, one segment at a time so
 * the slashes survive: FluidNC 3.x (ESP3D HTTP stack) resets the connection
 * if it sees %2F. Left unencoded, a "#" or "?" in a filename ends the path
 * early and the request reaches a different file, or none.
 */
export function encodeRemotePath(remotePath: string): string {
  return remotePath.split("/").map(encodeURIComponent).join("/");
}

/**
 * Thrown by `connectWebSocket` when a disconnect, or a newer connect, arrived
 * while it was still resolving and probing the controller.
 */
export class ConnectSupersededError extends Error {
  constructor() {
    super("Connection attempt cancelled");
    this.name = "ConnectSupersededError";
  }
}

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
  /**
   * Bumped by every connect and disconnect, so a connect that was awaiting
   * the firmware probe can tell it has been overtaken and must not open a
   * socket the user has since asked to close.
   */
  private connectAttempt = 0;
  private static readonly uploadVerifyMaxAttempts = 6;
  private static readonly uploadVerifyDelayMs = 300;
  /**
   * How long an upload or download may go without a byte moving before it
   * is given up as stalled. Generous: the controller can pause for seconds
   * at a time while it writes to the SD card.
   */
  private static transferIdleTimeoutMs = 60_000;

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
    // try commandText first (matching WebUI) and fall back to plain -- but only
    // when the controller rejected the request. A timeout means it may already
    // be executing the command, and resending it would run it twice.
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
      if (!(error instanceof FluidNCHttpError)) throw error;
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
    if (this.fwMajor !== null && this.fwMajor < 4) {
      await this.sendCommand(cmd);
      return;
    }
    // FluidNC 4.1 holds the HTTP response to a Run command open until the
    // file finishes ("Job output channel webclient closed; the job continues"
    // once the request is dropped), so on 4.x the command goes over the live
    // WebSocket. Its "ok" or error arrives there like any other output.
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.emitDebugConsole(`[terraForge] CMD WS ${cmd}`);
      this.ws.send(`${cmd}\n`);
      return;
    }
    try {
      await this.sendCommand(cmd);
    } catch (error) {
      if (!isTimeoutError(error)) throw error;
      // The controller accepted the request and is still running the job.
      this.emit(
        "console",
        "[terraForge] No reply to the Run command yet; assuming the job is running",
      );
    }
  }

  async pauseJob(): Promise<void> {
    // '!' is the Grbl/FluidNC realtime Feed Hold character — must be sent raw
    await this.sendRealtime("!");
  }

  async resumeJob(): Promise<void> {
    // '~' is the Grbl/FluidNC realtime Cycle Start / Resume character — must be sent raw
    await this.sendRealtime("~");
  }

  async abortJob(): Promise<void> {
    // 0x18 is the Grbl/FluidNC realtime Soft Reset character — must be sent raw
    await this.sendRealtime("\x18");
  }

  /**
   * Sends a realtime command byte: raw over the WebSocket when it is open,
   * otherwise through the HTTP command endpoint (which may work, depending on
   * the firmware version). Rejects when neither delivers it, so a Pause or an
   * Abort that never left this machine is not reported as sent.
   */
  private async sendRealtime(char: string): Promise<void> {
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve, reject) => {
        ws.send(char, (err) => (err ? reject(err) : resolve()));
      });
      return;
    }
    await this.sendCommand(char);
  }

  // ─── File Management ─────────────────────────────────────────────────────

  async listFiles(remotePath = "/"): Promise<RemoteFile[]> {
    const res = await this.restClient.get(
      `/files?path=${encodeRemotePath(remotePath)}`,
    );
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
    // Only the path's segments are encoded, never its slashes: 3.x resets the
    // connection on %2F in this parameter, and 4.x accepts both forms.
    const res = await this.restClient.get(
      `/upload?path=${encodeRemotePath(remotePath)}`,
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
    const res = await this.restClient.get(
      `${prefix}${encodeRemotePath(filePath)}`,
      0,
    );
    return res.text();
  }

  async deleteFile(
    remotePath: string,
    source: "sd" | "fs" = "fs",
  ): Promise<void> {
    const filePath = remotePath.startsWith("/") ? remotePath : `/${remotePath}`;
    if (this.fwMajor === null || this.fwMajor >= 4) {
      // FluidNC 4.x: WebDAV DELETE — same pattern for both volumes
      const prefix = source === "sd" ? "/sd" : "/localfs";
      await this.restClient.get(
        `${prefix}${encodeRemotePath(filePath)}`,
        10_000,
        "DELETE",
      );
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
      let request: ReturnType<FormData["submit"]> | null = null;
      /** Ends the upload once: successfully, or with what went wrong. */
      const settle = (err?: unknown) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        if (err === undefined) return resolve();
        // Nothing more is to be read or sent.
        stream.destroy();
        request?.destroy();
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      const onAbort = () => settle(new Error("Upload cancelled"));
      signal?.addEventListener("abort", onAbort, { once: true });

      // The local file could not be read; form-data reports that on the form.
      stream.on("error", settle);
      form.on("error", settle);

      request = form.submit(url, (err, res) => {
        if (err) return settle(err);
        res.on("error", settle);
        res.on("end", () => {
          if ((res.statusCode ?? 0) >= 400) settle(new Error(`Upload failed: HTTP ${res.statusCode}`));
          else settle();
        });
        // Closed without having ended: the connection dropped mid-reply.
        res.on("close", () => {
          if (!res.complete) settle(new Error("Upload failed: the connection closed before the machine replied"));
        });
        res.resume();
      });
      // form-data stops listening for request errors once the response has
      // begun; one after that would otherwise be thrown, unhandled.
      request.on("error", settle);
      // Fires when the socket has been idle this long, in either direction.
      request.setTimeout(FluidNCClient.transferIdleTimeoutMs, () =>
        settle(
          new Error(
            `Upload stalled: no data moved for ${Math.round(FluidNCClient.transferIdleTimeoutMs / 1000)} s`,
          ),
        ),
      );
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

  /**
   * Downloads a file from the controller to `localPath`.
   *
   * The data is written to `<localPath>.part` and moved into place once it
   * is all there, so a download that fails, stalls or is cancelled leaves
   * neither half a file nor a damaged copy of one it was to replace.
   */
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
    const partPath = `${localPath}.part`;

    // Stops the request and the write: on the caller's cancel, or on a stall.
    const stop = new AbortController();
    const onCancel = () => stop.abort(new Error("Download cancelled"));
    signal?.addEventListener("abort", onCancel, { once: true });
    const idleMs = FluidNCClient.transferIdleTimeoutMs;
    let idleTimer: NodeJS.Timeout | undefined;
    const stillMoving = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => stop.abort(new Error(`Download stalled: no data received for ${Math.round(idleMs / 1000)} s`)),
        idleMs,
      );
    };

    let wrotePart = false;
    try {
      stillMoving();
      // No overall timeout: a large file can legitimately take minutes.
      const res = await this.restClient.get(`${prefix}${encodeRemotePath(filePath)}`, 0, "GET", stop.signal);
      if (!res.body) throw new Error("No response body for download");
      const total = Number(res.headers.get("content-length") ?? 0);
      let received = 0;

      wrotePart = true;
      await pipeline(
        Readable.fromWeb(res.body as unknown as NodeReadableStream<Uint8Array>),
        async function* (source: AsyncIterable<Uint8Array>) {
          for await (const chunk of source) {
            stillMoving();
            received += chunk.length;
            // 100 is for the finished file, in place.
            if (onProgress && total > 0) onProgress(Math.min(99, Math.round((received / total) * 100)));
            yield chunk;
          }
        },
        createWriteStream(partPath),
        { signal: stop.signal },
      );
      await rename(partPath, localPath);
      onProgress?.(100);
    } catch (err) {
      if (wrotePart) await rm(partPath, { force: true }).catch(() => {});
      // Why it was stopped, rather than the "aborted" that stopping caused.
      throw stop.signal.aborted ? stop.signal.reason : err;
    } finally {
      clearTimeout(idleTimer);
      signal?.removeEventListener("abort", onCancel);
    }
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

  /**
   * Resolves the host, probes the controller's firmware, then opens the
   * WebSocket. `wsPort` overrides only the port the socket uses: the probe
   * still runs, because the firmware version decides which command and file
   * API the controller speaks, and the override is what a 3.x machine needs.
   *
   * Rejects with `ConnectSupersededError` if a disconnect or another connect
   * arrives while it is still probing; nothing is opened in that case.
   */
  async connectWebSocket(
    host: string,
    port: number,
    wsPort?: number,
  ): Promise<void> {
    const attempt = ++this.connectAttempt;
    const assertCurrent = () => {
      if (attempt !== this.connectAttempt) throw new ConnectSupersededError();
    };

    this.wsHost = host;
    this.setHost(host, port);

    // Resolve the hostname to an IP first so that Node's fetch (undici) can
    // reach it. undici has its own DNS resolver that does not use the system
    // stub resolver and therefore cannot resolve mDNS .local names on Windows.
    // Node's dns.lookup() goes through the OS resolver (Bonjour/mDNS aware).
    const resolvedIp = await this.resolveHost(host);
    assertCurrent();
    const probeBaseUrl = `http://${resolvedIp}:${port}`;
    if (resolvedIp !== host) {
      this.emit("console", `[terraForge] Resolved ${host} → ${resolvedIp}`);
      // Use the resolved IP for all subsequent HTTP calls — Node's fetch
      // (undici) cannot resolve mDNS .local names on Windows.
      this.baseUrl = probeBaseUrl;
      this.restClient.setBaseUrl(probeBaseUrl);
    }

    // Auto-detect via [ESP800] using the resolved IP. The response carries
    // the firmware version and "webcommunication: Sync: <port>", which is the
    // authoritative WS port.
    const probe = await this.probeFirmwareVersion(probeBaseUrl);
    assertCurrent();
    // A failed probe must not leave the previous machine's version behind.
    this.fwMajor = probe ? probe.major : null;
    this.fwInfo = probe ? `FluidNC v${probe.version}` : null;
    this.emit("firmware", this.fwInfo);

    if (wsPort !== undefined) {
      // Explicit override from machine config — use as-is.
      this.wsPort = wsPort;
      this.emit(
        "console",
        probe
          ? `[terraForge] Detected ${this.fwInfo} — WS port override: ${wsPort}`
          : `[terraForge] Firmware probe failed — WS port override: ${wsPort}`,
      );
    } else if (probe) {
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
      this.emit(
        "console",
        `[terraForge] Firmware probe failed — assuming WS on port ${port} (set WS port override to 81 for FluidNC 3.x)`,
      );
    }

    // Tear down any existing connection & pending reconnect first
    this.killWs();
    this.wsEnabled = true;
    this.wsRetryDelay = 3000;
    this.openWs();
  }

  disconnectWebSocket(): void {
    // Overtakes a connect still waiting on its probe.
    this.connectAttempt++;
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
