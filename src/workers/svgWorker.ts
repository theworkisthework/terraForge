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
  clipSubpathsToRect,
  nearestNeighbourSort,
  joinSubpaths,
  roundSubpathCorners,
  clipSegmentToPolygon,
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
  const doRoundCorners = options?.roundCorners ?? false;
  const roundCornerAngle = options?.roundCornerAngle ?? 45;
  const roundCornerRadius = options?.roundCornerRadius ?? 0.3;
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
  if (options?.pageClip) {
    const pc = options.pageClip;
    lines.push(
      `; Page clip: ${pc.widthMM} x ${pc.heightMM} mm (${pc.marginMM} mm margin)`,
    );
  }
  lines.push(`; Optimised: ${optimise ? "yes (nearest-neighbour)" : "no"}`);
  lines.push(`; Joined   : ${doJoin ? `yes (tolerance ${joinTol} mm)` : "no"}`);
  lines.push(
    `; Rounded  : ${doRoundCorners ? `yes (angle < ${roundCornerAngle} deg, radius ${roundCornerRadius} mm)` : "no"}`,
  );
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
    lines.push(
      "; -- Custom start G-code ----------------------------------------",
    );
    lines.push(customStartGcode);
    lines.push(
      "; ---------------------------------------------------------------",
    );
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
  // When roundCorners is active, hatch-line VOs (flagged with hatchParentId)
  // are deferred until all outline VOs have been processed so their segments
  // can be re-clipped against the rounded parent boundary.
  const allSubpaths: Subpath[] = [];
  // Map from outline VO id → its first closed rounded subpath (hatch clip boundary).
  const roundedBoundaries = doRoundCorners ? new Map<string, Subpath>() : null;
  const deferredHatch: (typeof visibleObjects)[number][] = [];
  const yieldPh1 = makeYielder();
  let lastPct1 = -1;
  for (let i = 0; i < visibleObjects.length; i++) {
    if (cancelled.has(taskId)) {
      cancelled.delete(taskId);
      self.postMessage({ type: "cancelled", taskId });
      return;
    }
    const obj = visibleObjects[i];

    // Defer hatch VOs when round-corners is active so boundary map is complete.
    if (roundedBoundaries && obj.hatchParentId !== undefined) {
      deferredHatch.push(obj);
      const pct = Math.round(((i + 1) / visibleObjects.length) * 40);
      if (pct !== lastPct1) {
        lastPct1 = pct;
        self.postMessage({ type: "progress", taskId, percent: pct });
      }
      await yieldPh1();
      continue;
    }

    const raw = flattenToSubpaths(obj, config);
    const clipped = options?.pageClip
      ? clipSubpathsToRect(
          raw,
          options.pageClip.marginMM,
          options.pageClip.widthMM - options.pageClip.marginMM,
          options.pageClip.marginMM,
          options.pageClip.heightMM - options.pageClip.marginMM,
        )
      : clipSubpathsToBed(raw, config);
    for (const sp of clipped) {
      const rounded = doRoundCorners
        ? roundSubpathCorners(sp, roundCornerAngle, roundCornerRadius)
        : sp;
      if (rounded.length >= 2) {
        allSubpaths.push(rounded);
        // Cache first closed rounded subpath as the hatch re-clip boundary.
        if (
          roundedBoundaries &&
          !roundedBoundaries.has(obj.id) &&
          rounded.length >= 3 &&
          Math.hypot(
            rounded[0].x - rounded[rounded.length - 1].x,
            rounded[0].y - rounded[rounded.length - 1].y,
          ) <= 1e-6
        ) {
          roundedBoundaries.set(obj.id, rounded);
        }
      }
    }
    const pct = Math.round(((i + 1) / visibleObjects.length) * 40);
    if (pct !== lastPct1) {
      lastPct1 = pct;
      self.postMessage({ type: "progress", taskId, percent: pct });
    }
    await yieldPh1();
  }

  // Phase 1b: process deferred hatch VOs, re-clipping against rounded boundaries.
  for (const obj of deferredHatch) {
    if (cancelled.has(taskId)) {
      cancelled.delete(taskId);
      self.postMessage({ type: "cancelled", taskId });
      return;
    }
    const raw = flattenToSubpaths(obj, config);
    const clipped = options?.pageClip
      ? clipSubpathsToRect(
          raw,
          options.pageClip.marginMM,
          options.pageClip.widthMM - options.pageClip.marginMM,
          options.pageClip.marginMM,
          options.pageClip.heightMM - options.pageClip.marginMM,
        )
      : clipSubpathsToBed(raw, config);
    for (const sp of clipped) {
      const boundary = roundedBoundaries?.get(obj.hatchParentId ?? "") ?? null;
      if (boundary && sp.length >= 2) {
        for (let i = 1; i < sp.length; i++) {
          for (const seg of clipSegmentToPolygon(sp[i - 1], sp[i], boundary)) {
            if (seg.length >= 2) allSubpaths.push(seg);
          }
        }
      } else {
        if (sp.length >= 2) allSubpaths.push(sp);
      }
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
    lines.push(
      "; -- Custom end G-code ------------------------------------------",
    );
    lines.push(customEndGcode);
    lines.push(
      "; ---------------------------------------------------------------",
    );
  }
  self.postMessage({ type: "complete", taskId, gcode: lines.join("\n") });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
