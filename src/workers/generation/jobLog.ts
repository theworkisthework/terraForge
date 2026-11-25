/**
 * Console logging for a G-code job: what it was given, each stage's progress
 * (throttled, with rate and ETA, so a job that runs for hours still shows
 * movement), and anything it dropped or could not place.
 */

/** Long stages log at most this often. */
const PROGRESS_INTERVAL_MS = 5_000;
/** Per-item warnings beyond this many are only counted. */
export const MAX_ITEM_WARNINGS = 20;

export interface StageLog {
  /** Logs progress if enough time has passed since the last report. */
  tick(done: number): void;
  /** Logs how long the stage took, with anything worth adding. */
  end(detail?: Record<string, unknown>): void;
}

export interface JobLog {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  stage(name: string, total: number): StageLog;
  /** Time since the job started, as text. */
  elapsed(): string;
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  const s = Math.round(ms / 1_000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const count = (n: number) => n.toLocaleString("en-US");

/** "120,000/1,000,000 (12.0%) · 2,400/s · ETA 6m 7s" */
export function formatProgress(
  done: number,
  total: number,
  elapsedMs: number,
): string {
  const pct = total > 0 ? ((done / total) * 100).toFixed(1) : "100.0";
  const rate = elapsedMs > 0 ? done / (elapsedMs / 1_000) : 0;
  const eta =
    rate > 0 && total > done
      ? ` · ETA ${formatDuration(((total - done) / rate) * 1_000)}`
      : "";
  return `${count(done)}/${count(total)} (${pct}%) · ${count(Math.round(rate))}/s${eta}`;
}

export function createJobLog(
  taskId: string,
  now: () => number = () => performance.now(),
): JobLog {
  const prefix = `[gcode ${taskId.slice(0, 8)}]`;
  const startedAt = now();
  const out = (
    fn: (...args: unknown[]) => void,
    message: string,
    data?: unknown,
  ) =>
    data === undefined
      ? fn(`${prefix} ${message}`)
      : fn(`${prefix} ${message}`, data);

  return {
    info: (message, data) => out(console.info, message, data),
    warn: (message, data) => out(console.warn, message, data),
    error: (message, data) => out(console.error, message, data),
    elapsed: () => formatDuration(now() - startedAt),
    stage(name, total) {
      const stageStart = now();
      let lastReport = stageStart;
      out(console.info, `${name}: started (${count(total)} items)`);
      return {
        tick(done) {
          const t = now();
          if (t - lastReport < PROGRESS_INTERVAL_MS) return;
          lastReport = t;
          out(
            console.info,
            `${name}: ${formatProgress(done, total, t - stageStart)}`,
          );
        },
        end(detail) {
          out(
            console.info,
            `${name}: done in ${formatDuration(now() - stageStart)}`,
            detail,
          );
        },
      };
    },
  };
}
