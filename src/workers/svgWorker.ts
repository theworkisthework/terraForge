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
import {
  joinSubpathsCooperative,
  nearestNeighbourSortCooperative,
  OperationCancelledError,
} from "./gcodeEngine/stages/pathOptimization";
import { applyVinylCompensation } from "./gcodeEngine/stages/vinylCompensation";
import { applyVinylWeedBorder } from "./gcodeEngine/stages/vinylWeedBorder";
import type { GcodeGenerationStage, TravelSubpath } from "./generation/output";
import { collectGeometry, remapLayerMetadata } from "./generation/collect";
import { emitFooter, emitHeader, resolveGenerationSettings, type GenerationSettings } from "./generation/document";
import { JobWriter } from "./generation/jobWriter";

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
  return (percent: number, stage: GcodeGenerationStage, force: boolean = false): void => {
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
function reportCancelled(taskId: string): void {
  cancelled.delete(taskId);
  self.postMessage({ type: "cancelled", taskId });
}

/**
 * The optional passes between collecting and writing — nearest-neighbour
 * reordering, joining, vinyl weed border and blade compensation — reporting
 * progress from 40% to 95%. Returns null if cancelled.
 */
async function processSubpaths(
  taskId: string,
  subpaths: TravelSubpath[],
  options: GcodeOptions | undefined,
  settings: GenerationSettings,
  postProgress: ReturnType<typeof progressReporter>,
): Promise<TravelSubpath[] | null> {
  let ordered = subpaths;
  let progress = 40;
  let stage: GcodeGenerationStage = "optimizing";
  const report = (pct: number, force: boolean = false): void => {
    const clamped = Math.max(40, Math.min(95, pct));
    if (force || clamped - progress >= 0.1) {
      progress = clamped;
      postProgress(clamped, stage, force);
    }
  };
  const startStage = (next: GcodeGenerationStage) => {
    stage = next;
    report(progress, true);
  };
  const points = (list: TravelSubpath[]) => list.map((sp) => sp.points);
  const shouldCancel = () => cancelled.has(taskId);

  try {
    if (settings.optimise) {
      startStage("optimizing");
      const sorted = await nearestNeighbourSortCooperative(points(subpaths), {
        allowReverse: settings.allowPathReversal,
        shouldCancel,
        // Ease-out, so very large jobs show movement early rather than
        // sitting on one integer percentage.
        onProgress: (completed, total) => {
          if (total > 0) report(40 + Math.sqrt(Math.max(0, Math.min(1, completed / total))) * 50);
        },
      });
      ordered = remapLayerMetadata(subpaths, sorted);
      report(90);
    }
    // After the sort, so subpaths it placed side by side can be merged.
    if (settings.join) {
      startStage("joining");
      const joined = await joinSubpathsCooperative(points(ordered), settings.joinTolerance, {
        shouldCancel,
        onProgress: (completed, total) => {
          if (total > 0) report(90 + (completed / total) * 3);
        },
      });
      ordered = remapLayerMetadata(ordered, joined);
      report(93);
    }
  } catch (err: unknown) {
    if (err instanceof OperationCancelledError || cancelled.has(taskId)) return null;
    throw err;
  }

  if (options?.vinylCutting && options?.vinylWeedBorder) {
    startStage("postprocessing");
    ordered = remapLayerMetadata(ordered, applyVinylWeedBorder(points(ordered), options.vinylWeedBorder));
    report(94);
  }
  if (options?.vinylCutting) {
    startStage("postprocessing");
    ordered = remapLayerMetadata(ordered, applyVinylCompensation(points(ordered), options.vinylCutting));
    report(95);
  }
  return ordered;
}

async function generate(msg: GenerateMessage): Promise<void> {
  const { taskId, objects, config, options } = msg;
  const lines: string[] = [];
  const postProgress = progressReporter(taskId);
  const settings = resolveGenerationSettings(config, options);
  emitHeader(lines, config, options, settings);

  // ── Collect: flatten, clip and multi-pass every visible object (0–40%)
  const yieldCollect = makeYielder();
  let lastCollectPct = -1;
  const collected = await collectGeometry(objects, config, options, lines, {
    isCancelled: () => cancelled.has(taskId),
    afterEach: async (done, total) => {
      const pct = Math.round((done / total) * 40);
      if (pct !== lastCollectPct) {
        lastCollectPct = pct;
        postProgress(pct, "preparing");
      }
      await yieldCollect();
    },
  });
  if (!collected) return reportCancelled(taskId);

  // ── Process: reorder, join, vinyl passes (40–95%)
  const ordered = await processSubpaths(taskId, collected.subpaths, options, settings, postProgress);
  if (!ordered) return reportCancelled(taskId);

  // ── Write: strokes, then point taps (to 100%)
  const { points, skippedObjects } = collected;
  lines.push(`; -- ${settings.optimise ? "Optimised" : "Sequential"} path (${ordered.length} subpaths) -----------`);
  if (points.length > 0) lines.push(`; -- Point taps (${points.length} points) ---------------------`);
  if (skippedObjects > 0) lines.push(`; NOTE: skipped ${skippedObjects} invalid path object(s)`);

  const writer = new JobWriter(lines, config, settings);
  const totalOperations = ordered.length + points.length;
  const hasPreEmitProcessing =
    settings.optimise || settings.join || !!options?.vinylCutting || !!options?.vinylWeedBorder;
  const startPct = hasPreEmitProcessing ? 95 : 40;
  const yieldWrite = makeYielder();
  let lastWritePct = -1;
  const afterWrite = async (done: number) => {
    const pct = totalOperations > 0 ? startPct + Math.round((done / totalOperations) * (100 - startPct)) : 100;
    if (pct !== lastWritePct) {
      lastWritePct = pct;
      postProgress(pct, "emitting");
    }
    await yieldWrite();
  };

  writer.primeBeforeFirst(ordered, points);
  for (let i = 0; i < ordered.length; i++) {
    if (cancelled.has(taskId)) return reportCancelled(taskId);
    writer.writeSubpath(ordered[i]);
    await afterWrite(i + 1);
  }
  for (let i = 0; i < points.length; i++) {
    if (cancelled.has(taskId)) return reportCancelled(taskId);
    writer.writePointTap(points[i]);
    await afterWrite(ordered.length + i + 1);
  }
  writer.writeFinalWash(totalOperations);

  emitFooter(lines, config, settings);
  self.postMessage({ type: "complete", taskId, gcode: lines.join("\n") });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
