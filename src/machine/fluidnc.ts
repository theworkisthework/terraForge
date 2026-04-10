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
    // FluidNC 3.x and 4.x require different HTTP call conventions:
    //
    // 4.x: GET /command?plain=CMD  — executes synchronously, returns response
    //      POST /command commandText=CMD returns HTTP 500 for non-ESP/non-$/ cmds
    //
    // 3.x: POST /command commandText=CMD — works for all commands
    //      GET /command?plain=CMD returns HTTP 500 for jog / G-code commands
    //
    // We branch on fwMajor which is set during connectWebSocket. When unknown
    // (null, e.g. probe failed) we default to 4.x behaviour as that is the
    // current/modern firmware.
    if (this.fwMajor !== null && this.fwMajor < 4) {
      const res = await this.restClient.post(
        "/command",
        `commandText=${encodeURIComponent(cmd)}`,
      );
      return res.text();
    }
    // 4.x (or unknown — assume modern)
    const res = await this.restClient.get(
      `/command?plain=${encodeURIComponent(cmd)}`,
      10_000,
    );
    return res.text();
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
  ): Promise<void> {
    const stats = await stat(localPath);
    const total = stats.size;
    let uploaded = 0;

    const form = new FormData();
    const stream = createReadStream(localPath);
    stream.on("data", (chunk) => {
      uploaded += Buffer.isBuffer(chunk)
        ? chunk.length
        : Buffer.byteLength(chunk);
      if (onProgress && total > 0) {
        onProgress(Math.round((uploaded / total) * 100));
      }
    });

    form.append("path", remotePath);
    form.append("file", stream, {
      filename: remoteFilename ?? localPath.split(/[\\/]/).pop(),
      knownLength: total,
    });

    await new Promise<void>((resolve, reject) => {
      const url = `${this.baseUrl}/upload`;
      form.submit(url, (err, res) => {
        if (err) return reject(err);
        res.resume();
        res.on("end", () => {
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`Upload failed: HTTP ${res.statusCode}`));
          } else {
            onProgress?.(100);
            resolve();
          }
        });
      });
    });
  }

  async downloadFile(
    remotePath: string,
    localPath: string,
    filesystem: "internal" | "sdcard" = "sdcard",
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const prefix = filesystem === "sdcard" ? "/sd" : "/localfs";
    const filePath = remotePath.startsWith("/") ? remotePath : `/${remotePath}`;
    const res = await this.restClient.get(`${prefix}${filePath}`);
    const total = Number(res.headers.get("content-length") ?? 0);
    let received = 0;

    const writer = createWriteStream(localPath);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body for download");

    await new Promise<void>((resolve, reject) => {
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            writer.write(value);
            received += value.length;
            if (onProgress && total > 0) {
              onProgress(Math.round((received / total) * 100));
            }
          }
          writer.end();
          onProgress?.(100);
          resolve();
        } catch (e) {
          writer.destroy();
          reject(e);
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
