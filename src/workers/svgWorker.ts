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
  clipSubpathsToBed,
  nearestNeighbourSort,
  joinSubpaths,
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
  const doJoin = options?.joinPaths ?? false;
  const joinTol = options?.joinTolerance ?? 0.2;
  const liftPenAtEnd = options?.liftPenAtEnd ?? true;
  const returnToHome = options?.returnToHome ?? false;
  const customStartGcode = (options?.customStartGcode ?? "").trim();
  const customEndGcode = (options?.customEndGcode ?? "").trim();

  lines.push(
    "; -- terraForge G-code ------------------------------------------",
  );
  lines.push(`; Machine  : ${config.name}`);
  lines.push(`; Bed      : ${config.bedWidth} x ${config.bedHeight} mm`);
  lines.push(`; Origin   : ${config.origin}`);
  lines.push(`; Optimised: ${optimise ? "yes (nearest-neighbour)" : "no"}`);
  lines.push(`; Joined   : ${doJoin ? `yes (tolerance ${joinTol} mm)` : "no"}`);
  lines.push(`; Lift end : ${liftPenAtEnd ? "yes" : "no"}`);
  lines.push(`; Ret home : ${returnToHome ? "yes" : "no"}`);
  lines.push(`; Generated: ${new Date().toISOString()}`);
  lines.push(
    "; ---------------------------------------------------------------",
  );
  lines.push("G90      ; Absolute coordinates");
  lines.push("G21      ; Units: mm");
  lines.push(config.penUpCommand + " ; Pen up");
  lines.push("");

  // Inject custom start G-code (if any)
  if (customStartGcode) {
    lines.push("; -- Custom start G-code ----------------------------------------");
    lines.push(customStartGcode);
    lines.push("; ---------------------------------------------------------------");
    lines.push("");
  }

  const visibleObjects = objects.filter((o) => o.visible);

  // Time-based yield helper — only surrenders to the event loop after a full
  // frame's worth of work (~16 ms), instead of yielding on every iteration.
  // This keeps the worker responsive to cancel messages while eliminating the
  // massive overhead of hundreds-of-thousands of individual setTimeout callbacks.
  const makeYielder = () => {
    let last = Date.now();
    return async () => {
      const now = Date.now();
      if (now - last >= 16) {
        last = now;
        await sleep(0);
      }
    };
  };

  // ── Phase 1: collect all subpaths from all visible objects ────────────────
  const allSubpaths: Subpath[] = [];
  const yieldPh1 = makeYielder();
  let lastPct1 = -1;
  for (let i = 0; i < visibleObjects.length; i++) {
    if (cancelled.has(taskId)) {
      cancelled.delete(taskId);
      self.postMessage({ type: "cancelled", taskId });
      return;
    }
    const raw = flattenToSubpaths(visibleObjects[i], config);
    for (const sp of clipSubpathsToBed(raw, config)) {
      if (sp.length >= 2) allSubpaths.push(sp);
    }
    const pct = Math.round(((i + 1) / visibleObjects.length) * 40);
    if (pct !== lastPct1) {
      lastPct1 = pct;
      self.postMessage({ type: "progress", taskId, percent: pct });
    }
    await yieldPh1();
  }

  // ── Phase 2: optional nearest-neighbour reorder ────────────────────────────
  let orderedSubpaths = optimise
    ? nearestNeighbourSort(allSubpaths)
    : allSubpaths;

  // ── Phase 3: optional path joining ────────────────────────────────────────
  // Joining is applied after NN sort so that already-adjacent subpaths
  // (which NN sort placed next to each other) get merged where possible.
  if (doJoin) {
    orderedSubpaths = joinSubpaths(orderedSubpaths, joinTol);
  }

  // ── Phase 4: emit G-code ─────────────────────────────────────────────────
  const modeLabel = optimise ? "Optimised" : "Sequential";
  lines.push(
    `; -- ${modeLabel} path (${orderedSubpaths.length} subpaths) -----------`,
  );

  const yieldPh4 = makeYielder();
  let lastPct4 = -1;
  for (let i = 0; i < orderedSubpaths.length; i++) {
    if (cancelled.has(taskId)) {
      cancelled.delete(taskId);
      self.postMessage({ type: "cancelled", taskId });
      return;
    }
    const subpath = orderedSubpaths[i];
    const first = subpath[0];
    lines.push(`G0 X${fmt(first.x)} Y${fmt(first.y)} ; Rapid travel`);
    lines.push(`F${config.feedrate}`);
    lines.push(config.penDownCommand + " ; Pen down");
    for (let s = 1; s < subpath.length; s++) {
      lines.push(`G1 X${fmt(subpath[s].x)} Y${fmt(subpath[s].y)}`);
    }
    lines.push(config.penUpCommand + " ; Pen up");
    lines.push("");
    const pct = 40 + Math.round(((i + 1) / orderedSubpaths.length) * 60);
    if (pct !== lastPct4) {
      lastPct4 = pct;
      self.postMessage({ type: "progress", taskId, percent: pct });
    }
    await yieldPh4();
  }

  lines.push("; ── End of job ──────────────────────────────────────────────");
  if (liftPenAtEnd) {
    lines.push(config.penUpCommand + " ; Pen up — safe");
  }
  if (returnToHome) {
    lines.push("G0 X0 Y0 ; Return to origin");
  }
  if (customEndGcode) {
    lines.push("; -- Custom end G-code ------------------------------------------");
    lines.push(customEndGcode);
    lines.push("; ---------------------------------------------------------------");
  }
  self.postMessage({ type: "complete", taskId, gcode: lines.join("\n") });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
