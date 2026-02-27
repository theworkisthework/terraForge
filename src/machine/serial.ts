import { EventEmitter } from "events";
import { SerialPort, ReadlineParser } from "serialport";
import type { MachineStatus, RemoteFile } from "../types";

// ─── Status parser ────────────────────────────────────────────────────────────
// Shared with FluidNCClient — same <...> format arrives over both WS and serial.
export function parseFluidNCStatus(raw: string): MachineStatus {
  const stateMatch = raw.match(/<([^|>]+)/);
  const mposMatch = raw.match(/MPos:([-\d.]+),([-\d.]+),([-\d.]+)/);
  const wposMatch = raw.match(/WPos:([-\d.]+),([-\d.]+),([-\d.]+)/);
  const lnMatch = raw.match(/Ln:(\d+),(\d+)/);

  const stateStr = stateMatch?.[1] ?? "Unknown";
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

  return {
    raw,
    state,
    mpos,
    wpos,
    lineNum: lnMatch ? parseInt(lnMatch[1], 10) : undefined,
    lineTotal: lnMatch ? parseInt(lnMatch[2], 10) : undefined,
  };
}

// ─── Pending command slot ─────────────────────────────────────────────────────

interface PendingCommand {
  lines: string[];
  resolve: (lines: string[]) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

// ─── SerialClient ─────────────────────────────────────────────────────────────

/**
 * USB serial client for FluidNC.
 *
 * Supports:
 *  - Raw send (`send`) and realtime single-char send (`sendRealtime`)
 *  - Request/response (`sendAndReceive`) with a FIFO command queue
 *  - High-level file ops matching the FluidNCClient HTTP surface
 *    ($SD/List, $FS/List, $SD/Run, $SD/Delete, $SD/Show, …)
 *  - Status polling via `?` at a configurable interval
 *
 * Emits:
 *  - "data"   — every non-status line (console output)
 *  - "status" — parsed MachineStatus from <…> lines
 */
export class SerialClient extends EventEmitter {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;

  private pending: PendingCommand | null = null;
  private queue: Array<() => void> = [];

  private statusInterval: NodeJS.Timeout | null = null;

  // ─── Port management ───────────────────────────────────────────────────────

  async listPorts(): Promise<string[]> {
    const list = await SerialPort.list();
    return list.map((p) => p.path);
  }

  async connect(path: string, baudRate = 115200): Promise<void> {
    await this.disconnect();

    this.port = new SerialPort({ path, baudRate, autoOpen: false });
    this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\n" }));

    this.parser.on("data", (line: string) =>
      this.handleLine(line.trimEnd().replace(/\r$/, "")),
    );

    await new Promise<void>((resolve, reject) => {
      this.port!.open((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`[Serial] Connected to ${path} @ ${baudRate}`);
  }

  async disconnect(): Promise<void> {
    this.stopStatusPolling();

    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error("Serial port disconnected"));
      this.pending = null;
    }
    this.queue = [];

    if (this.port?.isOpen) {
      await new Promise<void>((resolve, reject) => {
        this.port!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    this.port = null;
    this.parser = null;
  }

  /** Send a line terminated with \n — does NOT wait for a response. */
  async send(data: string): Promise<void> {
    if (!this.port?.isOpen) throw new Error("Serial port not connected");
    await new Promise<void>((resolve, reject) => {
      this.port!.write(`${data}\n`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** Send a single realtime character (!, ~, ?, \x18) — no newline, bypasses queue. */
  sendRealtime(char: string): void {
    if (this.port?.isOpen) this.port.write(char);
  }

  // ─── Request / response ───────────────────────────────────────────────────

  /**
   * Send `cmd` and collect all response lines until FluidNC sends `ok` or `error:N`.
   * Commands are serialised: subsequent calls queue behind the current in-flight one.
   */
  sendAndReceive(cmd: string, timeoutMs = 12_000): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const run = () => {
        if (!this.port?.isOpen) {
          reject(new Error("Serial port not connected"));
          return;
        }
        const lines: string[] = [];
        const timer = setTimeout(() => {
          this.pending = null;
          this.drainQueue();
          reject(new Error(`Serial command timed out: ${cmd}`));
        }, timeoutMs);

        this.pending = { lines, resolve, reject, timer };

        this.port.write(`${cmd}\n`, (err) => {
          if (err) {
            clearTimeout(timer);
            this.pending = null;
            this.drainQueue();
            reject(err);
          }
        });
      };

      if (this.pending) {
        this.queue.push(run);
      } else {
        run();
      }
    });
  }

  private drainQueue(): void {
    const next = this.queue.shift();
    if (next) next();
  }

  // ─── Incoming data handler ────────────────────────────────────────────────

  private handleLine(line: string): void {
    const trimmed = line.trim();

    // Real-time status reports — parse and emit; never captured by command queue.
    if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
      this.emit("status", parseFluidNCStatus(trimmed));
      return;
    }

    // Everything else goes to the console.
    if (trimmed.length > 0) {
      this.emit("data", trimmed);
    }

    // Also feed into the pending command response if one is in flight.
    if (this.pending) {
      if (trimmed === "ok") {
        const { resolve, lines, timer } = this.pending;
        clearTimeout(timer);
        this.pending = null;
        this.drainQueue();
        resolve(lines);
      } else if (trimmed.startsWith("error:")) {
        const { reject, timer } = this.pending;
        clearTimeout(timer);
        this.pending = null;
        this.drainQueue();
        reject(new Error(trimmed));
      } else if (trimmed.length > 0) {
        this.pending.lines.push(trimmed);
      }
    }
  }

  // ─── Status polling ────────────────────────────────────────────────────────

  /** Start sending `?` at `intervalMs` (default 500 ms). */
  startStatusPolling(intervalMs = 500): void {
    this.stopStatusPolling();
    this.statusInterval = setInterval(() => {
      if (this.port?.isOpen) this.port.write("?");
    }, intervalMs);
  }

  stopStatusPolling(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  // ─── High-level file operations ───────────────────────────────────────────

  /**
   * Parse $SD/List and $LocalFS/List response lines into RemoteFile[].
   *
   * SD format:      [FILE: name|SIZE:1234]   (space after FILE:, no leading /)
   *                 [FILE:  name|SIZE:1234]   (two spaces = subdirectory file in recursive listing)
   *                 [DIR:dirname]
   *
   * LocalFS format: [FILE:/name|SIZE:1234]   (colon then leading slash, no space)
   *
   * @param lines     Raw response lines from sendAndReceive
   * @param pathPrefix Current directory path
   * @param topLevelOnly  When true, skip files that appear with >1 space indent
   *                      (recursive SD root listing — those are inside subdirs)
   */
  private parseListLines(
    lines: string[],
    pathPrefix: string,
    topLevelOnly = false,
  ): RemoteFile[] {
    const results: RemoteFile[] = [];
    const prefix = pathPrefix === "/" ? "" : pathPrefix.replace(/\/$/, "");

    for (const line of lines) {
      // SD format — single space = top-level, two spaces = inside a subdir.
      const sdFileMatch = line.match(/^\[FILE:( +)(.+?)\|SIZE:(\d+)\]$/);
      if (sdFileMatch) {
        const indent = sdFileMatch[1].length; // 1 = top-level, 2 = nested
        if (topLevelOnly && indent > 1) continue;
        const name = sdFileMatch[2].trim();
        results.push({
          name,
          path: `${prefix}/${name}`,
          size: parseInt(sdFileMatch[3], 10),
          isDirectory: false,
        });
        continue;
      }

      // LocalFS format: [FILE:/name|SIZE:1234]
      const lfsFileMatch = line.match(/^\[FILE:\/(.+?)\|SIZE:(\d+)\]$/);
      if (lfsFileMatch) {
        const name = lfsFileMatch[1].trim();
        results.push({
          name,
          path: `${prefix}/${name}`,
          size: parseInt(lfsFileMatch[2], 10),
          isDirectory: false,
        });
        continue;
      }

      // Directory: [DIR:name] — always top-level in the listing context.
      const dirMatch = line.match(/^\[DIR:(.+?)\]$/);
      if (dirMatch) {
        const name = dirMatch[1].trim();
        results.push({
          name,
          path: `${prefix}/${name}`,
          size: 0,
          isDirectory: true,
        });
      }
      // Footer lines ([/sd ...], [Local FS ...]) and ok — ignored.
    }

    return results;
  }

  /** List SD card contents. Mirrors FluidNCClient.listSDFiles().
   *
   * For root: uses bare `$SD/List` which is recursive — we filter to top-level
   * items only (single-indent FILE: lines and DIR: lines).
   * For subdirs: uses `$SD/List=/path` which already returns a single level.
   */
  async listSDFiles(remotePath = "/"): Promise<RemoteFile[]> {
    const isRoot = remotePath === "/";
    const cmd = isRoot ? "$SD/List" : `$SD/List=${remotePath}`;
    let lines: string[];
    try {
      lines = await this.sendAndReceive(cmd);
    } catch (err) {
      const msg = String(err);
      // error:60 = SD card not mounted / not present.
      // Translate to a user-readable error instead of a raw code.
      if (msg.includes("error:60") || msg.includes("error:7")) {
        throw new Error("No SD card");
      }
      throw err;
    }
    return this.parseListLines(lines, remotePath, isRoot);
  }

  /** List internal (LocalFS) contents. Mirrors FluidNCClient.listFiles().
   *
   * FluidNC command: $LocalFS/List (always lists the full flat FS — no path arg).
   */
  async listFiles(_remotePath = "/"): Promise<RemoteFile[]> {
    const lines = await this.sendAndReceive("$LocalFS/List");
    return this.parseListLines(lines, "/");
  }

  /** Delete a file on SD or internal FS. */
  async deleteFile(
    remotePath: string,
    source: "sd" | "fs" = "sd",
  ): Promise<void> {
    const cmd =
      source === "sd"
        ? `$SD/Delete=${remotePath}`
        : `$LocalFS/Delete=${remotePath}`;
    await this.sendAndReceive(cmd);
  }

  /** Run a file from SD or internal FS. */
  async runFile(remotePath: string, source: "sd" | "fs" = "sd"): Promise<void> {
    const cmd =
      source === "sd" ? `$SD/Run=${remotePath}` : `$LocalFS/Run=${remotePath}`;
    await this.sendAndReceive(cmd);
  }

  /**
   * Fetch the text content of a remote file.
   * Uses $SD/Show= or $LocalFS/Show= — all lines before `ok` are the file content.
   */
  async fetchFileText(
    remotePath: string,
    filesystem: "sdcard" | "internal" = "sdcard",
  ): Promise<string> {
    const cmd =
      filesystem === "sdcard"
        ? `$SD/Show=${remotePath}`
        : `$LocalFS/Show=${remotePath}`;
    const lines = await this.sendAndReceive(cmd, 30_000);
    return lines.join("\n");
  }

  /** Send a command and return the full text response. */
  async sendCommand(cmd: string): Promise<string> {
    const lines = await this.sendAndReceive(cmd);
    return lines.join("\n");
  }
}
