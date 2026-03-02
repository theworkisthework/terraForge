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
 *   OUT ← { type: 'progress', taskId, percent }
 *   OUT ← { type: 'complete', taskId, gcode }
 *   OUT ← { type: 'error', taskId, error }
 */

import type { VectorObject, MachineConfig, GcodeOptions } from "../types";
import {
  flattenToSubpaths,
  nearestNeighbourSort,
  fmtCoord as fmt,
  type Subpath,
} from "./gcodeEngine";

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

async function generate(msg: GenerateMessage): Promise<void> {
  const { taskId, objects, config, options } = msg;
  const lines: string[] = [];

  const optimise = options?.optimisePaths ?? false;

  lines.push(
    "; -- terraForge G-code ------------------------------------------",
  );
  lines.push(`; Machine  : ${config.name}`);
  lines.push(`; Bed      : ${config.bedWidth} x ${config.bedHeight} mm`);
  lines.push(`; Origin   : ${config.origin}`);
  lines.push(`; Optimised: ${optimise ? "yes (nearest-neighbour)" : "no"}`);
  lines.push(`; Generated: ${new Date().toISOString()}`);
  lines.push(
    "; ---------------------------------------------------------------",
  );
  lines.push("G90      ; Absolute coordinates");
  lines.push("G21      ; Units: mm");
  lines.push(config.penUpCommand + " ; Pen up");
  lines.push("");

  const visibleObjects = objects.filter((o) => o.visible);

  if (optimise) {
    // ── Optimised mode: collect all subpaths across all objects, then
    //    reorder globally with nearest-neighbour before emitting. ──────────
    const allSubpaths: Subpath[] = [];

    for (let i = 0; i < visibleObjects.length; i++) {
      if (cancelled.has(taskId)) {
        cancelled.delete(taskId);
        self.postMessage({ type: "cancelled", taskId });
        return;
      }
      const subpaths = flattenToSubpaths(visibleObjects[i], config);
      for (const sp of subpaths) {
        if (sp.length >= 2) allSubpaths.push(sp);
      }
      self.postMessage({
        type: "progress",
        taskId,
        percent: Math.round(((i + 1) / visibleObjects.length) * 50),
      });
      await sleep(0);
    }

    const sorted = nearestNeighbourSort(allSubpaths);

    lines.push(
      `; -- Optimised path (${sorted.length} subpaths) ---------------`,
    );
    for (let i = 0; i < sorted.length; i++) {
      if (cancelled.has(taskId)) {
        cancelled.delete(taskId);
        self.postMessage({ type: "cancelled", taskId });
        return;
      }
      const subpath = sorted[i];
      const first = subpath[0];
      lines.push(`G0 X${fmt(first.x)} Y${fmt(first.y)} ; Rapid travel`);
      lines.push(`F${config.feedrate}`);
      lines.push(config.penDownCommand + " ; Pen down");
      for (let s = 1; s < subpath.length; s++) {
        lines.push(`G1 X${fmt(subpath[s].x)} Y${fmt(subpath[s].y)}`);
      }
      lines.push(config.penUpCommand + " ; Pen up");
      lines.push("");
      self.postMessage({
        type: "progress",
        taskId,
        percent: 50 + Math.round(((i + 1) / sorted.length) * 50),
      });
      await sleep(0);
    }
  } else {
    // ── Unoptimised mode: emit each object's subpaths in import order. ────
    const total = visibleObjects.length;

    for (let i = 0; i < total; i++) {
      if (cancelled.has(taskId)) {
        cancelled.delete(taskId);
        self.postMessage({ type: "cancelled", taskId });
        return;
      }

      const obj = visibleObjects[i];
      lines.push(
        `; ── Object ${i + 1} (${obj.id.slice(0, 8)}) ─────────────────`,
      );

      const subpaths = flattenToSubpaths(obj, config);

      for (const subpath of subpaths) {
        if (subpath.length < 2) continue;
        const first = subpath[0];
        lines.push(`G0 X${fmt(first.x)} Y${fmt(first.y)} ; Rapid travel`);
        lines.push(`F${config.feedrate}`);
        lines.push(config.penDownCommand + " ; Pen down");
        for (let s = 1; s < subpath.length; s++) {
          if (cancelled.has(taskId)) {
            cancelled.delete(taskId);
            self.postMessage({ type: "cancelled", taskId });
            return;
          }
          lines.push(`G1 X${fmt(subpath[s].x)} Y${fmt(subpath[s].y)}`);
        }
        lines.push(config.penUpCommand + " ; Pen up");
      }

      lines.push("");
      self.postMessage({
        type: "progress",
        taskId,
        percent: Math.round(((i + 1) / total) * 100),
      });
      await sleep(0);
    }
  }

  lines.push("; ── End of job ──────────────────────────────────────────────");
  lines.push("G0 X0 Y0 ; Return to origin");
  lines.push(config.penUpCommand + " ; Pen up — safe");
  self.postMessage({ type: "complete", taskId, gcode: lines.join("\n") });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
