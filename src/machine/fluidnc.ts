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
    // FluidNC status: <Idle|MPos:0.000,0.000,0.000|FS:0,0>
    const stateMatch = raw.match(/<([^|>]+)/);
    const mposMatch = raw.match(/MPos:([-\d.]+),([-\d.]+),([-\d.]+)/);
    const wposMatch = raw.match(/WPos:([-\d.]+),([-\d.]+),([-\d.]+)/);

    const stateStr = stateMatch?.[1] ?? "Unknown";
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
      validStates.includes(stateStr) ? stateStr : "Unknown"
    ) as MachineStatus["state"];

    const mpos = mposMatch
      ? { x: +mposMatch[1], y: +mposMatch[2], z: +mposMatch[3] }
      : { x: 0, y: 0, z: 0 };

    const wpos = wposMatch
      ? { x: +wposMatch[1], y: +wposMatch[2], z: +wposMatch[3] }
      : { ...mpos };

    return { raw, state, mpos, wpos };
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
    await this.get("/pause");
  }

  async resumeJob(): Promise<void> {
    await this.get("/resume");
  }

  async abortJob(): Promise<void> {
    await this.get("/abort");
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

  async connectWebSocket(host: string, port: number): Promise<void> {
    this.wsHost = host;
    this.wsPort = port;
    this.setHost(host, port);
    this.wsEnabled = true;
    this.wsRetryDelay = 3000;
    this.openWs();
  }

  disconnectWebSocket(): void {
    this.wsEnabled = false;
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect(): void {
    if (!this.wsEnabled) return;
    this.wsReconnectTimer = setTimeout(() => this.openWs(), this.wsRetryDelay);
    // Exponential backoff, capped at 60s
    this.wsRetryDelay = Math.min(this.wsRetryDelay * 2, 60_000);
  }

  private openWs(): void {
    if (!this.wsEnabled) return;
    // FluidNC's WebSocket server runs on port 81 at the root path (ESP3D convention)
    const url = `ws://${this.wsHost}:81/`;

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      this.wsRetryDelay = 3000; // reset backoff on successful connect
      this.emit("console", "[terraForge] WebSocket connected");
    });

    this.ws.on("message", (raw) => {
      const text = raw.toString();
      if (text.startsWith("<")) {
        this.emit("status", this.parseStatus(text));
      } else {
        this.emit("console", text);
      }
    });

    this.ws.on("close", (_code, reason) => {
      const msg = reason?.toString();
      // 503 = FluidNC already has a client or is busy — retry quietly with backoff
      const is503 = msg?.includes("503") || this.wsRetryDelay > 3000;
      if (!is503) {
        this.emit("console", "[terraForge] WebSocket disconnected — retrying…");
      }
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      // 503 is logged at info level only — it's expected when machine is busy
      const is503 = err.message.includes("503");
      if (!is503) {
        this.emit("console", `[terraForge] WebSocket error: ${err.message}`);
      }
      // close event fires after error, which triggers scheduleReconnect
    });
  }
}
