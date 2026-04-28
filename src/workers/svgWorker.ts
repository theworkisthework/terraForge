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
  fmtCoord as fmt,
  tokenizePath,
  toAbsolute,
  transformPt,
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

function fmtSeconds(n: number): string {
  return n
    .toFixed(3)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

function approximateObjectSubpaths(
  obj: VectorObject,
  config: MachineConfig,
): Subpath[] {
  const subpaths: Subpath[] = [];
  const abs = toAbsolute(tokenizePath(obj.path));
  let cur: Subpath = [];
  let cx = 0,
    cy = 0,
    startX = 0,
    startY = 0;

  const push = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    cur.push(transformPt(obj, config, x, y));
    cx = x;
    cy = y;
  };

  for (const cmd of abs) {
    const a = cmd.args;
    switch (cmd.type) {
      case "M": {
        if (cur.length > 1) subpaths.push(cur);
        cur = [];
        if (a.length < 2) break;
        cx = a[0];
        cy = a[1];
        startX = cx;
        startY = cy;
        push(cx, cy);
        for (let i = 2; i + 1 < a.length; i += 2) push(a[i], a[i + 1]);
        break;
      }
      case "L":
        for (let i = 0; i + 1 < a.length; i += 2) push(a[i], a[i + 1]);
        break;
      case "H":
        for (let i = 0; i < a.length; i++) push(a[i], cy);
        break;
      case "V":
        for (let i = 0; i < a.length; i++) push(cx, a[i]);
        break;
      case "C":
        for (let i = 0; i + 5 < a.length; i += 6) push(a[i + 4], a[i + 5]);
        break;
      case "S":
        for (let i = 0; i + 3 < a.length; i += 4) push(a[i + 2], a[i + 3]);
        break;
      case "Q":
        for (let i = 0; i + 3 < a.length; i += 4) push(a[i + 2], a[i + 3]);
        break;
      case "T":
        for (let i = 0; i + 1 < a.length; i += 2) push(a[i], a[i + 1]);
        break;
      case "A":
        for (let i = 0; i + 6 < a.length; i += 7) push(a[i + 5], a[i + 6]);
        break;
      case "Z":
        push(startX, startY);
        if (cur.length > 1) subpaths.push(cur);
        cur = [];
        break;
    }
  }

  if (cur.length > 1) subpaths.push(cur);
  return subpaths;
}

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
  const hasDelayOverride = typeof options?.penDownDelayMsOverride === "number";
  const rawDelayMs = hasDelayOverride
    ? options.penDownDelayMsOverride
    : config.penType === "servo" || config.penType === "solenoid"
      ? (config.penDownDelayMs ?? 0)
      : 0;
  const penDownDelayMs = Number.isFinite(rawDelayMs)
    ? Math.max(0, rawDelayMs ?? 0)
    : 0;

  const hasUpDelayOverride = typeof options?.penUpDelayMsOverride === "number";
  const rawUpDelayMs = hasUpDelayOverride
    ? options.penUpDelayMsOverride
    : config.penType === "servo" || config.penType === "solenoid"
      ? (config.penUpDelayMs ?? 0)
      : 0;
  const penUpDelayMs = Number.isFinite(rawUpDelayMs)
    ? Math.max(0, rawUpDelayMs ?? 0)
    : 0;

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
  lines.push(`; Lift end : ${liftPenAtEnd ? "yes" : "no"}`);
  lines.push(`; Ret home : ${returnToHome ? "yes" : "no"}`);
  lines.push(`; Pen delay: ${penDownDelayMs} ms`);
  lines.push(`; Pen up delay: ${penUpDelayMs} ms`);
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

  // Sort objects by sourceColor to batch by color for pen-swapping workflow
  const colorSortedObjects = visibleObjects.sort((a, b) => {
    const aColor = a.sourceColor ?? "";
    const bColor = b.sourceColor ?? "";
    return aColor.localeCompare(bColor);
  });

  let skippedObjects = 0;

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
  let lastColor: string | undefined = undefined;
  let colorObjectCount = 0;

  for (let i = 0; i < colorSortedObjects.length; i++) {
    if (cancelled.has(taskId)) {
      cancelled.delete(taskId);
      self.postMessage({ type: "cancelled", taskId });
      return;
    }
    const obj = colorSortedObjects[i];

    // Emit color batch comment when color changes
    if (obj.sourceColor !== lastColor && i > 0) {
      lines.push(
        `; -- Color: ${lastColor ?? "(no color)"} (${colorObjectCount} object${colorObjectCount === 1 ? "" : "s"}) --`,
      );
      colorObjectCount = 0;
    }
    lastColor = obj.sourceColor;
    colorObjectCount++;

    let raw: Subpath[];
    try {
      raw = flattenToSubpaths(obj, config);
    } catch {
      // Fallback to coarse endpoint-only approximation for malformed paths.
      raw = approximateObjectSubpaths(obj, config);
      if (raw.length === 0) {
        skippedObjects++;
      }
    }
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
      if (sp.length >= 2) {
        allSubpaths.push(sp);
      }
    }
    const pct = Math.round(((i + 1) / colorSortedObjects.length) * 40);
    if (pct !== lastPct1) {
      lastPct1 = pct;
      self.postMessage({ type: "progress", taskId, percent: pct });
    }
    await yieldPh1();
  }

  // Emit final color batch comment
  if (colorSortedObjects.length > 0 && lastColor !== undefined) {
    lines.push(
      `; -- Color: ${lastColor ?? "(no color)"} (${colorObjectCount} object${colorObjectCount === 1 ? "" : "s"}) --`,
    );
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
  if (skippedObjects > 0) {
    lines.push(`; NOTE: skipped ${skippedObjects} invalid path object(s)`);
  }

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
    const drawSpeed =
      typeof options?.drawSpeedOverride === "number"
        ? options.drawSpeedOverride
        : config.drawSpeed;
    lines.push(`F${drawSpeed}`);
    lines.push(config.penDownCommand + " ; Pen down");
    if (penDownDelayMs > 0) {
      lines.push(`G4 P${fmtSeconds(penDownDelayMs / 1000)} ; Pen settle delay`);
    }
    for (let s = 1; s < subpath.length; s++) {
      lines.push(`G1 X${fmt(subpath[s].x)} Y${fmt(subpath[s].y)}`);
    }
    if (penUpDelayMs > 0) {
      lines.push(`G4 P${fmtSeconds(penUpDelayMs / 1000)} ; Pen lift delay`);
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

  lines.push("; -- End of job -----------------------------------------------");
  if (liftPenAtEnd) {
    lines.push(config.penUpCommand + " ; Pen up - safe");
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
