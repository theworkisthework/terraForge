/**
 * SVG → G-code Web Worker
 *
 * Full SVG path command support including cubic/quadratic bezier curves,
 * smooth variants, elliptical arcs, and all basic shapes.
 * Flattens everything to polylines for G-code output.
 *
 * Message protocol:
 *   IN  → { type: 'generate', taskId, objects, config, options }
 *   IN  → { type: 'cancel', taskId }
 *   OUT ← { type: 'progress', taskId, percent, stage }
 *   OUT ← { type: 'complete', taskId, gcode }
 *   OUT ← { type: 'error', taskId, error }
 */

import type { VectorObject, MachineConfig, GcodeOptions } from "../types";
import type {
  GcodeGenerationStage,
  TravelPoint,
  TravelSubpath,
} from "./generation/output";
import {
  collectGeometry,
  type CollectedGeometry,
  type SkipReason,
} from "./generation/collect";
import {
  emitFooter,
  emitHeader,
  resolveGenerationSettings,
  type GenerationSettings,
} from "./generation/document";
import { JobWriter } from "./generation/jobWriter";
import {
  createJobLog,
  MAX_ITEM_WARNINGS,
  type JobLog,
} from "./generation/jobLog";
import { formatStatsComments } from "./generation/pathStats";
import { processSubpaths, type Processed } from "./generation/process";

interface GenerateMessage {
  type: "generate";
  taskId: string;
  objects: VectorObject[];
  config: MachineConfig;
  options: GcodeOptions;
}
interface CancelMessage {
  type: "cancel";
  taskId: string;
}
type InMessage = GenerateMessage | CancelMessage;

const cancelled = new Set<string>();

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === "cancel") {
    cancelled.add(msg.taskId);
  } else if (msg.type === "generate") {
    generate(msg).catch((err: unknown) => {
      console.error(`[gcode ${msg.taskId.slice(0, 8)}] failed:`, err);
      self.postMessage({
        type: "error",
        taskId: msg.taskId,
        error: String(err),
      });
    });
  }
};

// ── G-code generation ─────────────────────────────────────────────────────────

/** Posts progress, skipping repeats of the same percentage within a stage. */
function progressReporter(taskId: string) {
  let lastPercent = -1;
  let lastStage: GcodeGenerationStage | null = null;
  return (
    percent: number,
    stage: GcodeGenerationStage,
    force: boolean = false,
  ): void => {
    const normalized = Number(Math.max(0, Math.min(100, percent)).toFixed(1));
    if (!force && lastStage === stage && normalized === lastPercent) return;
    lastPercent = normalized;
    lastStage = stage;
    self.postMessage({ type: "progress", taskId, percent: normalized, stage });
  };
}

/** Surrenders to the event loop only after a frame's worth of work (~16 ms),
 * so cancel messages get through without a setTimeout per iteration. */
function makeYielder() {
  let last = Date.now();
  return async () => {
    const now = Date.now();
    if (now - last >= 16) {
      last = now;
      await sleep(0);
    }
  };
}

/** Clears a cancellation and tells the caller the job stopped. */
function reportCancelled(taskId: string, log?: JobLog): void {
  log?.info(`cancelled after ${log.elapsed()}`);
  cancelled.delete(taskId);
  self.postMessage({ type: "cancelled", taskId });
}

/** UI progress for the processing passes (40–95%), only ever moving forward
 * within a stage, in steps of at least 0.1%. */
function passProgress(postProgress: ReturnType<typeof progressReporter>) {
  let progress = 40;
  let current: GcodeGenerationStage = "optimizing";
  return (
    pct: number,
    stage: GcodeGenerationStage,
    force: boolean = false,
  ): void => {
    const clamped = Math.max(progress, Math.max(40, Math.min(95, pct)));
    if (force || stage !== current || clamped - progress >= 0.1) {
      progress = clamped;
      current = stage;
      postProgress(clamped, stage, force);
    }
  };
}

/** Logs what the job was given, so a slow or odd run can be sized up. */
function logJobStart(
  log: JobLog,
  objects: VectorObject[],
  settings: GenerationSettings,
  options?: GcodeOptions,
) {
  const visible = objects.filter((o) => o.visible);
  log.info("job started", {
    objects: objects.length,
    visible: visible.length,
    hidden: objects.length - visible.length,
    layers: new Set(visible.map((o) => o.layer ?? "")).size,
    colours: new Set(visible.map((o) => o.sourceColor ?? "")).size,
    optimise: settings.optimise,
    allowReversal: settings.allowPathReversal,
    join: settings.join ? settings.joinTolerance : false,
    vinyl: !!options?.vinylCutting,
    pageClip: !!options?.pageClip,
  });
}

/** Warns about each object that adds nothing to the job (the first few
 * individually), then summarises the rest. */
function skipLogger(log: JobLog) {
  const counts = new Map<SkipReason, number>();
  let logged = 0;
  return {
    onSkip(reason: SkipReason, obj: VectorObject) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
      if (logged++ < MAX_ITEM_WARNINGS) {
        log.warn(`skipped object: ${reason}`, {
          id: obj.id,
          layer: obj.layer,
          colour: obj.sourceColor,
        });
      }
    },
    summarise() {
      if (counts.size === 0) return;
      log.warn(`skipped ${logged} object(s)`, Object.fromEntries(counts));
    },
  };
}

async function collect(
  msg: GenerateMessage,
  lines: string[],
  log: JobLog,
  postProgress: ReturnType<typeof progressReporter>,
) {
  const { taskId, objects, config, options } = msg;
  const visibleCount = objects.filter((o) => o.visible).length;
  const stage = log.stage("collect", visibleCount);
  const skips = skipLogger(log);
  const yieldCollect = makeYielder();
  let lastCollectPct = -1;
  const collected = await collectGeometry(objects, config, options, lines, {
    isCancelled: () => cancelled.has(taskId),
    onSkip: skips.onSkip,
    afterEach: async (done, total) => {
      stage.tick(done);
      const pct = Math.round((done / total) * 40);
      if (pct !== lastCollectPct) {
        lastCollectPct = pct;
        postProgress(pct, "preparing");
      }
      await yieldCollect();
    },
  });
  if (!collected) return null;
  stage.end({
    subpaths: collected.subpaths.length,
    points: collected.subpaths.reduce((n, sp) => n + sp.points.length, 0),
    pointTaps: collected.points.length,
  });
  skips.summarise();
  return collected;
}

/** Writes strokes, then point taps, to 100%. Returns false if cancelled. */
async function write(
  msg: GenerateMessage,
  writer: JobWriter,
  ordered: TravelSubpath[],
  points: TravelPoint[],
  startPct: number,
  ctx: { log: JobLog; postProgress: ReturnType<typeof progressReporter> },
): Promise<boolean> {
  const totalOperations = ordered.length + points.length;
  const stage = ctx.log.stage("write", totalOperations);
  const yieldWrite = makeYielder();
  let lastWritePct = -1;
  const afterWrite = async (done: number) => {
    stage.tick(done);
    const pct =
      totalOperations > 0
        ? startPct + Math.round((done / totalOperations) * (100 - startPct))
        : 100;
    if (pct !== lastWritePct) {
      lastWritePct = pct;
      ctx.postProgress(pct, "emitting");
    }
    await yieldWrite();
  };

  writer.primeBeforeFirst(ordered, points);
  for (let i = 0; i < ordered.length; i++) {
    if (cancelled.has(msg.taskId)) return false;
    writer.writeSubpath(ordered[i]);
    await afterWrite(i + 1);
  }
  for (let i = 0; i < points.length; i++) {
    if (cancelled.has(msg.taskId)) return false;
    writer.writePointTap(points[i]);
    await afterWrite(ordered.length + i + 1);
  }
  writer.writeFinalWash(totalOperations);
  stage.end();
  return true;
}

/** The comments between the header and the moves: what was drawn, and what
 * the processing passes did. */
function emitBody(
  lines: string[],
  collected: CollectedGeometry,
  processed: Processed,
  settings: GenerationSettings,
) {
  const { ordered, stats } = processed;
  lines.push(
    `; -- ${settings.optimise ? "Optimised" : "Sequential"} path (${ordered.length} subpaths) -----------`,
  );
  lines.push(...formatStatsComments(stats));
  if (collected.points.length > 0)
    lines.push(
      `; -- Point taps (${collected.points.length} points) ---------------------`,
    );
  if (collected.skippedObjects > 0)
    lines.push(
      `; NOTE: skipped ${collected.skippedObjects} invalid path object(s)`,
    );
}

async function generate(msg: GenerateMessage): Promise<void> {
  const { taskId, objects, config, options } = msg;
  const lines: string[] = [];
  const log = createJobLog(taskId);
  const postProgress = progressReporter(taskId);
  const settings = resolveGenerationSettings(config, options);
  logJobStart(log, objects, settings, options);
  emitHeader(lines, config, options, settings);

  // ── Collect: flatten, clip and multi-pass every visible object (0–40%)
  const collected = await collect(msg, lines, log, postProgress);
  if (!collected) return reportCancelled(taskId, log);

  // ── Process: reorder, join, vinyl passes (40–95%)
  const processed = await processSubpaths(collected.subpaths, {
    options,
    settings,
    log,
    shouldCancel: () => cancelled.has(taskId),
    report: passProgress(postProgress),
  });
  if (!processed) return reportCancelled(taskId, log);
  const { ordered, stats } = processed;

  emitBody(lines, collected, processed, settings);

  const hasPreEmitProcessing =
    settings.optimise ||
    settings.join ||
    !!options?.vinylCutting ||
    !!options?.vinylWeedBorder;
  const writer = new JobWriter(lines, config, settings);
  const finished = await write(
    msg,
    writer,
    ordered,
    collected.points,
    hasPreEmitProcessing ? 95 : 40,
    {
      log,
      postProgress,
    },
  );
  if (!finished) return reportCancelled(taskId, log);

  emitFooter(lines, config, settings);
  log.info(`job finished in ${log.elapsed()}`, stats);
  self.postMessage({ type: "complete", taskId, gcode: lines.join("\n") });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
