import { EventEmitter } from "events";
import { WebSocket } from "ws";
import { createWriteStream, createReadStream } from "fs";
import { stat } from "fs/promises";
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
  private wsRetryDelay = 3000;   // ms — doubles on each 503, resets on success
  private wsEnabled = false;     // set false on disconnect to stop retry loop

  // ─── Configuration ────────────────────────────────────────────────────────

  setHost(host: string, port = 80): void {
    this.baseUrl = `http://${host}:${port}`;
    this.wsHost = host;
    this.wsPort = port;
  }

  // ─── REST Helpers ─────────────────────────────────────────────────────────

  private async get(path: string): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} GET ${url}`);
    return res;
  }

  private async post(path: string, body?: string): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: body
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {},
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
    const lnMatch   = raw.match(/Ln:(\d+),(\d+)/);

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

    const lineNum   = lnMatch ? parseInt(lnMatch[1], 10) : undefined;
    const lineTotal = lnMatch ? parseInt(lnMatch[2], 10) : undefined;

    return { raw, state, mpos, wpos, lineNum, lineTotal };
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  async sendCommand(cmd: string): Promise<string> {
    const res = await this.post(
      "/command",
      `commandText=${encodeURIComponent(cmd)}`,
    );
    return res.text();
  }

  // ─── Job Control ──────────────────────────────────────────────────────────

  async runFile(remotePath: string, filesystem: "sd" | "fs" = "sd"): Promise<void> {
    // FluidNC has no HTTP run endpoint — files are started via the command interface.
    const cmd = filesystem === "sd" ? `$SD/Run=${remotePath}` : `$FS/Run=${remotePath}`;
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
    const res = await this.get(`/files?path=${encodeURIComponent(remotePath)}`);
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

  // SD card file listing — FluidNC exposes the SD card via GET /upload?path=
  // Directories are identified by size === "-1" (returned as a string).
  async listSDFiles(remotePath = "/"): Promise<RemoteFile[]> {
    const res = await this.get(`/upload?path=${encodeURIComponent(remotePath)}`);
    const json = (await res.json()) as {
      files: Array<{ name: string; shortname: string; size: string; datetime: string }>;
      path: string;
      status: string;
    };
    const prefix = remotePath === "/" ? "" : remotePath.replace(/\/$/, "");
    return (json.files ?? []).map((f) => ({
      name: f.name,
      path: `${prefix}/${f.name}`,
      size: parseInt(f.size, 10),
      isDirectory: f.size === "-1",
    }));
  }

  async deleteFile(remotePath: string): Promise<void> {
    await this.get(`/delete?path=${encodeURIComponent(remotePath)}`);
  }

  async uploadFile(
    localPath: string,
    remotePath: string,
    onProgress?: (percent: number) => void,
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
      filename: localPath.split(/[\\/]/).pop(),
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
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const res = await this.get(
      `/download?file=${encodeURIComponent(remotePath)}`,
    );
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

  async connectWebSocket(host: string, port: number): Promise<void> {
    this.wsHost = host;
    this.wsPort = port;
    this.setHost(host, port);
    // Tear down any existing connection & pending reconnect first
    this.killWs();
    this.wsEnabled = true;
    this.wsRetryDelay = 3000;
    this.openWs();
  }

  disconnectWebSocket(): void {
    this.killWs();
  }

  /** Hard-stop: cancel reconnect timer, terminate socket, bump generation. */
  private killWs(): void {
    this.wsEnabled = false;
    this.wsGeneration++;                     // invalidate all in-flight handlers
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      // terminate() sends TCP RST immediately — no waiting for the close handshake.
      // This is essential so FluidNC frees the slot before we reopen.
      try { this.ws.terminate(); } catch { /* already dead */ }
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
      try { this.ws.terminate(); } catch { /* ignore */ }
      this.ws = null;
    }

    const gen = ++this.wsGeneration;
    // FluidNC's WebSocket server runs on port 81 at the root path (ESP3D convention)
    const url = `ws://${this.wsHost}:81/`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on("open", () => {
      if (gen !== this.wsGeneration) { ws.terminate(); return; }
      this.wsRetryDelay = 3000;
      this.emit("console", "[terraForge] WebSocket connected");
      // Request automatic status reports every 500ms on this WS channel.
      // $RI is per-channel, so it must be sent through the WebSocket itself.
      try { ws.send("$RI=500\n"); } catch { /* ignore */ }
    });

    ws.on("message", (raw) => {
      if (gen !== this.wsGeneration) return;
      const text = raw.toString().trim();
      if (text.startsWith("<")) {
        this.emit("status", this.parseStatus(text));
      } else if (text.startsWith("PING:")) {
        // Keep-alive heartbeat — suppress from console, emit as ping signal
        this.emit("ping");
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
      if (!is503) {
        this.emit("console", `[terraForge] WebSocket error: ${err.message}`);
      }
      // close event fires after error and will call scheduleReconnect
    });
  }
}
