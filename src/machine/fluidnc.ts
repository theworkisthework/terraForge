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

  async runFile(remotePath: string): Promise<void> {
    await this.get(`/run?file=${encodeURIComponent(remotePath)}`);
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
    this.openWs();
  }

  disconnectWebSocket(): void {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private openWs(): void {
    const url = `ws://${this.wsHost}:${this.wsPort}/ws`;
    console.log(`[FluidNC] Connecting WebSocket: ${url}`);

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[FluidNC] WebSocket connected");
    });

    this.ws.on("message", (raw) => {
      const text = raw.toString();
      if (text.startsWith("<")) {
        this.emit("status", this.parseStatus(text));
      } else {
        this.emit("console", text);
      }
    });

    this.ws.on("close", () => {
      console.log("[FluidNC] WebSocket closed — reconnecting in 3s");
      this.wsReconnectTimer = setTimeout(() => this.openWs(), 3000);
    });

    this.ws.on("error", (err) => {
      console.error("[FluidNC] WebSocket error:", err.message);
    });
  }
}
