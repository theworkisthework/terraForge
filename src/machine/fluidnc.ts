import { EventEmitter } from "events";
import { WebSocket } from "ws";
import { createWriteStream, createReadStream } from "fs";
import { stat } from "fs/promises";
import { lookup } from "dns/promises";
import FormData from "form-data";
import type { MachineStatus, RemoteFile } from "../types";

// FluidNC HTTP REST + WebSocket client.
// All methods use the endpoints documented at:
// http://wiki.fluidnc.com/en/support/interface/http-rest-api

export class FluidNCClient extends EventEmitter {
  private baseUrl = "";
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

  // ─── Configuration ────────────────────────────────────────────────────────

  setHost(host: string, port = 80): void {
    this.baseUrl = `http://${host}:${port}`;
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

  // ─── REST Helpers ─────────────────────────────────────────────────────────

  private async get(
    path: string,
    timeoutMs = 10_000,
    method: "GET" | "DELETE" = "GET",
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${method} ${url}`);
    return res;
  }

  private async post(path: string, body: string): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} POST ${url}`);
    return res;
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  async getStatus(): Promise<MachineStatus> {
    const res = await this.get("/state");
    const text = await res.text();
    return this.parseStatus(text);
  }

  private parseStatus(raw: string): MachineStatus {
    // FluidNC status: <Idle|MPos:0.000,0.000,0.000|FS:0,0|Ln:42,1234>
    const stateMatch = raw.match(/<([^|>]+)/);
    const mposMatch = raw.match(/MPos:([-\d.]+),([-\d.]+),([-\d.]+)/);
    const wposMatch = raw.match(/WPos:([-\d.]+),([-\d.]+),([-\d.]+)/);
    // FluidNC reports Ln:N,Total during SD-card jobs.  Some firmware versions
    // omit the total, so the comma and second group are optional.
    const lnMatch = raw.match(/Ln:(\d+)(?:,(\d+))?/);

    const stateStr = stateMatch?.[1] ?? "Unknown";
    // FluidNC appends a substate number for some states: Hold:0, Hold:1, Door:0, etc.
    const stateName = stateStr.split(":")[0];
    const validStates = [
      "Idle",
      "Run",
      "Hold",
      "Jog",
      "Alarm",
      "Door",
      "Check",
      "Home",
      "Sleep",
    ];
    const state = (
      validStates.includes(stateName) ? stateName : "Unknown"
    ) as MachineStatus["state"];

    const mpos = mposMatch
      ? { x: +mposMatch[1], y: +mposMatch[2], z: +mposMatch[3] }
      : { x: 0, y: 0, z: 0 };

    const wpos = wposMatch
      ? { x: +wposMatch[1], y: +wposMatch[2], z: +wposMatch[3] }
      : { ...mpos };

    const lineNum = lnMatch ? parseInt(lnMatch[1], 10) : undefined;
    const lineTotal =
      lnMatch?.[2] !== undefined ? parseInt(lnMatch[2], 10) : undefined;

    return { raw, state, mpos, wpos, lineNum, lineTotal };
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
      const res = await this.post(
        "/command",
        `commandText=${encodeURIComponent(cmd)}`,
      );
      return res.text();
    }
    // 4.x (or unknown — assume modern)
    const res = await this.get(
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
    const res = await this.get(`/files?path=${encodedPath}`);
    const json = (await res.json()) as {
      files: Array<{ name: string; size: number; dir?: boolean }>;
      path: string;
    };
    return (json.files ?? []).map((f) => ({
      name: f.name,
      path: `${remotePath === "/" ? "" : remotePath}/${f.name}`,
      size: f.size ?? 0,
      isDirectory: !!f.dir,
    }));
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
    const res = await this.get(`/upload?path=${encodedPath}`, 30_000);

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

    // If the SD card is not mounted FluidNC still returns HTTP 200 but with
    // a non-ok status string (e.g. "SD CARD READER FAILED" / "No SD card").
    // Surface this as a thrown error so FsPane shows the message rather than
    // silently falling through to an empty list.
    if (
      json.status &&
      typeof json.status === "string" &&
      !json.status.toLowerCase().startsWith("ok") &&
      !json.files
    ) {
      throw new Error(`SD card: ${json.status}`);
    }
    const prefix = remotePath === "/" ? "" : remotePath.replace(/\/$/, "");
    return (json.files ?? []).map((f) => ({
      name: f.name,
      path: `${prefix}/${f.name}`,
      size: parseInt(f.size, 10),
      isDirectory: f.size === "-1",
    }));
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
    const res = await this.get(`${prefix}${filePath}`);
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
        await this.get(`/sd${filePath}`, 10_000, "DELETE");
      } else {
        await this.get(`/localfs${filePath}`, 10_000, "DELETE");
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
        await this.get(
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
    const res = await this.get(`${prefix}${filePath}`);
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
  async probeFirmwareVersion(probeBaseUrl?: string): Promise<{
    raw: string;
    version: string;
    major: number;
    wsPort: number | null;
  } | null> {
    const tryParse = (
      text: string,
    ): {
      raw: string;
      version: string;
      major: number;
      wsPort: number | null;
    } | null => {
      // "FW version: FluidNC v4.0.1" — space after colon, then optional "FluidNC "
      const fwMatch = text.match(
        /FW\s+version\s*:\s*(?:FluidNC\s+)?v?(\d+)\.(\d+)(?:\.(\d+))?/i,
      );
      // "[VER:3.9.7.FluidNC...]" or "[VER:FluidNC v3.9.7:]"
      const verMatch = !fwMatch
        ? text.match(/\[VER[:\s]+(?:FluidNC\s+)?v?(\d+)\.(\d+)(?:\.(\d+))?/i)
        : null;
      // Last resort: bare semver anywhere, e.g. "v3.9.7"
      const semver =
        !fwMatch && !verMatch ? text.match(/\bv?(\d+)\.(\d+)\.(\d+)/) : null;

      const m = fwMatch ?? verMatch ?? semver;
      if (!m) return null;

      const major = parseInt(m[1], 10);
      const version = `${m[1]}.${m[2]}${m[3] ? `.${m[3]}` : ""}`;

      // Parse WS port directly from "webcommunication: Sync: <port>"
      const wsPortMatch = text.match(/webcommunication[^#]*Sync:\s*(\d+)/i);
      const wsPort = wsPortMatch ? parseInt(wsPortMatch[1], 10) : null;

      return { raw: text.trim(), version, major, wsPort };
    };

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
          const parsed = tryParse(body);
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
    this.wsEnabled = false;
    this.wsGeneration++; // invalidate in-flight reconnect timers
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      // Use ws.close() (graceful WS close frame) rather than ws.terminate()
      // (TCP RST).  An abrupt RST on process exit can wedge the ESP32's WS
      // server slot so it refuses new connections until power-cycled.
      try {
        this.ws.close(1000);
      } catch {
        /* already dead */
      }
      this.ws = null;
    }
    this.emit("firmware", null);
  }

  /** Hard-stop: cancel reconnect timer, terminate socket, bump generation. */
  private killWs(): void {
    this.wsEnabled = false;
    this.wsGeneration++; // invalidate all in-flight handlers
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      // terminate() sends TCP RST immediately — no waiting for the close handshake.
      // This is essential so FluidNC frees the slot before we reopen.
      try {
        this.ws.terminate();
      } catch {
        /* already dead */
      }
      this.ws = null;
    }
  }

  private scheduleReconnect(gen: number): void {
    if (!this.wsEnabled || gen !== this.wsGeneration) return;
    this.wsReconnectTimer = setTimeout(() => this.openWs(), this.wsRetryDelay);
    // Exponential backoff, capped at 60s
    this.wsRetryDelay = Math.min(this.wsRetryDelay * 2, 60_000);
  }

  private openWs(): void {
    if (!this.wsEnabled) return;

    // Terminate any socket that might still be lingering before opening a new one
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }

    const gen = ++this.wsGeneration;
    // FluidNC WebSocket always uses root path "/".
    // FluidNC 4.x: same port as HTTP (wsPort === httpPort).
    // Old ESP3D firmware: port 81 (set wsPort explicitly in machine config).
    const url = `ws://${this.wsHost}:${this.wsPort}/`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on("open", () => {
      if (gen !== this.wsGeneration) {
        ws.terminate();
        return;
      }
      this.wsRetryDelay = 3000;
      this.emit("console", "[terraForge] WebSocket connected");
      // Request automatic status reports every 500ms on this WS channel.
      // $RI is per-channel, so it must be sent through the WebSocket itself.
      try {
        ws.send("$RI=500\n");
      } catch {
        /* ignore */
      }
    });

    ws.on("message", (raw) => {
      if (gen !== this.wsGeneration) return;
      const text = raw.toString().trim();
      if (text.startsWith("<")) {
        // Grbl/FluidNC real-time status report
        this.emit("status", this.parseStatus(text));
      } else if (text === "PING" || text.startsWith("PING:")) {
        // Server-to-client keep-alive heartbeat ("PING" no colon) or ping
        // reply ("PING:60000:60000"). Suppress from console; emit as ping signal.
        this.emit("ping");
      } else if (
        text.startsWith("currentID:") ||
        text.startsWith("CURRENT_ID:") ||
        text.startsWith("activeID:") ||
        text.startsWith("ACTIVE_ID:")
      ) {
        // FluidNC WebUI session-management messages — not user-facing output.
      } else if (text.length > 0) {
        this.emit("console", text);
      }
    });

    ws.on("close", (_code, reason) => {
      if (gen !== this.wsGeneration) return;
      const msg = reason?.toString() ?? "";
      const is503 = msg.includes("503");
      if (!is503 && this.wsRetryDelay <= 3000) {
        this.emit("console", "[terraForge] WebSocket disconnected — retrying…");
      }
      this.scheduleReconnect(gen);
    });

    ws.on("error", (err) => {
      if (gen !== this.wsGeneration) return;
      const is503 = err.message.includes("503");

      // "Unexpected server response: 200" means the HTTP server answered instead
      // of performing a WS upgrade — classic FluidNC 3.x symptom where the
      // WebSocket runs on port 81, not the HTTP port.
      const isHttp200 =
        err.message.includes("200") ||
        /unexpected server response/i.test(err.message);

      if (isHttp200 && this.wsPort !== 81) {
        this.emit(
          "console",
          `[terraForge] WS got HTTP response instead of 101 Upgrade on port ${this.wsPort} — switching to port 81 (FluidNC 3.x)`,
        );
        this.wsPort = 81;
        // Reconnect immediately on the corrected port (don't go through the
        // exponential backoff path — this is a one-shot self-correction).
        this.wsRetryDelay = 3000;
        // The close event will fire after this error and call scheduleReconnect,
        // which will openWs() with the new wsPort.
        return;
      }

      if (!is503) {
        this.emit("console", `[terraForge] WebSocket error: ${err.message}`);
      }
      // close event fires after error and will call scheduleReconnect
    });
  }
}
