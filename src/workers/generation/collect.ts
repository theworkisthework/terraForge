/**
 * Turning vector objects into machine-space geometry: placement, fallbacks
 * for malformed paths, multi-pass duplication, and carrying layer and colour
 * through path reordering.
 */
import type { GcodeOptions, VectorObject, MachineConfig } from "../../types";
import {
  clipSubpathsToBed,
  clipSubpathsToRect,
  flattenToSubpaths,
  resolvePageClipRect,
  tokenizePath,
  toAbsolute,
  transformPt,
  type Subpath,
} from "../gcodeEngine";
import type { TravelPoint, TravelSubpath } from "./output";
import { distanceMM } from "./inkService";

export function normalizeTopOriginAnchorObject(
  obj: VectorObject,
  config: MachineConfig,
): VectorObject | null {
  if (config.origin !== "top-left" && config.origin !== "top-right") {
    return null;
  }

  const sY = obj.scaleY ?? obj.scale;
  const objHeight = obj.originalHeight * sY;
  if (!Number.isFinite(objHeight) || objHeight === 0) {
    return null;
  }

  // Canvas top-origin placement stores import Y one object-height above the
  // visual top edge. Shift to the actual machine-space top-edge anchor before
  // flattening so generated toolpaths align with canvas placement.
  return {
    ...obj,
    y: obj.y + objHeight,
  };
}

export function isPointWithinBounds(
  point: { x: number; y: number },
  config: MachineConfig,
  pageClip?: { widthMM: number; heightMM: number; marginMM: number },
): boolean {
  const bounds = pageClip
    ? resolvePageClipRect(config, pageClip)
    : {
        xMin: config.origin === "center" ? -config.bedWidth / 2 : 0,
        xMax:
          config.origin === "center" ? config.bedWidth / 2 : config.bedWidth,
        yMin: config.origin === "center" ? -config.bedHeight / 2 : 0,
        yMax:
          config.origin === "center" ? config.bedHeight / 2 : config.bedHeight,
      };

  return (
    point.x >= bounds.xMin &&
    point.x <= bounds.xMax &&
    point.y >= bounds.yMin &&
    point.y <= bounds.yMax
  );
}

export interface RemapResult {
  subpaths: TravelSubpath[];
  /** Subpaths whose nearest match was a tie between originals of different
   * layers or colours, so the label they got may be the wrong one. */
  ambiguous: number;
}

export interface RemapHooks {
  onProgress?: (done: number, total: number) => void;
  /** Checked as it goes; when true, stops and returns null. */
  isCancelled?: () => boolean;
}

const sameLabel = (a: TravelSubpath, b: TravelSubpath) =>
  a.layer === b.layer && a.color === b.color;

/** The original nearest `first` (by its start or end), and whether an
 * original with another layer or colour was just as near. */
function nearestOriginal(
  previous: TravelSubpath[],
  first: { x: number; y: number },
) {
  let best = previous[0];
  let bestScore = Number.POSITIVE_INFINITY;
  let ambiguous = false;
  for (const candidate of previous) {
    const start = candidate.points[0];
    const end = candidate.points[candidate.points.length - 1];
    const score = Math.min(distanceMM(first, start), distanceMM(first, end));
    if (score < bestScore - 1e-9) {
      bestScore = score;
      best = candidate;
      ambiguous = false;
    } else if (score <= bestScore + 1e-9 && !sameLabel(candidate, best)) {
      ambiguous = true;
    }
  }
  return { best, ambiguous };
}

/**
 * Gives each reordered or rebuilt subpath the layer and colour of the
 * original it came from, found by matching its first point to an original's
 * start or end. Compares every subpath with every original, so it yields to
 * the event loop as it goes. Returns null if cancelled.
 */
export async function remapLayerMetadata(
  previous: TravelSubpath[],
  nextPoints: Subpath[],
  hooks: RemapHooks = {},
): Promise<RemapResult | null> {
  if (previous.length === 0) {
    return { subpaths: nextPoints.map((points) => ({ points })), ambiguous: 0 };
  }
  const subpaths: TravelSubpath[] = new Array(nextPoints.length);
  let ambiguous = 0;
  let lastYield = Date.now();
  for (let i = 0; i < nextPoints.length; i++) {
    const points = nextPoints[i];
    const match = nearestOriginal(previous, points[0]);
    if (match.ambiguous) ambiguous++;
    subpaths[i] = { points, layer: match.best.layer, color: match.best.color };
    hooks.onProgress?.(i + 1, nextPoints.length);
    if (Date.now() - lastYield >= 16) {
      lastYield = Date.now();
      await new Promise((r) => setTimeout(r, 0));
      if (hooks.isCancelled?.()) return null;
    }
  }
  return { subpaths, ambiguous };
}

export function approximateObjectSubpaths(
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

/**
 * Process subpaths to implement multiple passes.
 * - 'repeat': adds identical subpaths n times
 * - 'backtrack': alternates forward and backward for each pass
 * - 'penLift': adds identical subpaths n times (pen naturally lifts between)
 */
export function applyPassesToSubpaths(
  subpaths: Subpath[],
  passCount: number = 1,
  passMode: string = "repeat",
): Subpath[] {
  if (passCount <= 1) {
    return subpaths;
  }

  const result: Subpath[] = [];

  for (const subpath of subpaths) {
    if (passMode === "backtrack") {
      // For backtrack: draw forward, then backward (without pen lift between)
      // We emit both forward and reverse, but as separate subpaths
      // (the natural pen-up/down cycle provides the backtrack behavior)
      for (let p = 0; p < passCount; p++) {
        // Forward pass
        result.push(subpath);
        // Backward pass - reverse the subpath
        const reversed = [...subpath].reverse();
        result.push(reversed);
      }
    } else {
      // 'repeat' and 'penLift' both just duplicate the subpath
      // penLift mode relies on natural pen up/down between strokes
      for (let p = 0; p < passCount; p++) {
        result.push(subpath);
      }
    }
  }

  return result;
}

/** Why an object adds nothing to the job. */
export type SkipReason =
  | "unreadable path data"
  | "no drawable geometry"
  | "entirely outside the page or bed"
  | "point tap outside the page or bed";

/** Everything a job draws, in machine space: strokes and point taps. */
export interface CollectedGeometry {
  subpaths: TravelSubpath[];
  points: TravelPoint[];
  /** Objects whose path data could not be read at all. */
  skippedObjects: number;
}

/** A point tap where it lands on the bed (or page), if it does. Tries the
 * top-origin-normalised placement first, then the stored one, for data
 * saved before that normalisation. */
function placePointTap(
  obj: VectorObject,
  normalized: VectorObject | null,
  config: MachineConfig,
  pageClip: GcodeOptions["pageClip"],
): TravelPoint | null {
  for (const candidate of normalized ? [normalized, obj] : [obj]) {
    if (!candidate.pointTap) continue;
    const point = transformPt(
      candidate,
      config,
      candidate.pointTap.x,
      candidate.pointTap.y,
    );
    if (isPointWithinBounds(point, config, pageClip)) {
      return {
        point,
        layer: candidate.layer,
        color: candidate.sourceColor,
        repeats: Math.max(1, candidate.passCount ?? 1),
      };
    }
  }
  return null;
}

type ClipRect = { xMin: number; xMax: number; yMin: number; yMax: number };

interface ObjectGeometry {
  clipped: Subpath[];
  validGeometry: boolean;
  /** Subpaths before clipping. */
  rawCount: number;
}

/** An object flattened and clipped to the page (or bed). Malformed path data
 * falls back to a coarse endpoint approximation; `validGeometry` is false
 * when even that finds nothing. */
function clippedGeometry(
  candidate: VectorObject,
  config: MachineConfig,
  pageClipBounds: ClipRect | null,
): ObjectGeometry {
  let raw: Subpath[];
  try {
    raw = flattenToSubpaths(candidate, config);
  } catch {
    raw = approximateObjectSubpaths(candidate, config);
    if (raw.length === 0)
      return { clipped: [], validGeometry: false, rawCount: 0 };
  }
  const clipped = pageClipBounds
    ? clipSubpathsToRect(
        raw,
        pageClipBounds.xMin,
        pageClipBounds.xMax,
        pageClipBounds.yMin,
        pageClipBounds.yMax,
      )
    : clipSubpathsToBed(raw, config);
  return { clipped, validGeometry: true, rawCount: raw.length };
}

/** An object's visible strokes: from its normalised placement, or — if that
 * shows nothing — its stored one, for data already in top-edge form. */
function objectGeometry(
  obj: VectorObject,
  normalized: VectorObject | null,
  config: MachineConfig,
  pageClipBounds: ClipRect | null,
): ObjectGeometry {
  const primary = clippedGeometry(normalized ?? obj, config, pageClipBounds);
  if (primary.clipped.length > 0 || !normalized) return primary;
  const fallback = clippedGeometry(obj, config, pageClipBounds);
  return {
    clipped: fallback.clipped.length > 0 ? fallback.clipped : primary.clipped,
    validGeometry: primary.validGeometry || fallback.validGeometry,
    rawCount: Math.max(primary.rawCount, fallback.rawCount),
  };
}

const colorBatchComment = (color: string | undefined, count: number) =>
  `; -- Color: ${color ?? "(no color)"} (${count} object${count === 1 ? "" : "s"}) --`;

/**
 * Flattens, clips and multi-passes every visible object, sorted by colour so
 * a pen-swap workflow can follow the batches (each closed with a comment in
 * `lines`). Returns null if `isCancelled` reports cancellation between
 * objects; `afterEach` reports progress and yields.
 */
export async function collectGeometry(
  objects: VectorObject[],
  config: MachineConfig,
  options: GcodeOptions | undefined,
  lines: string[],
  hooks: {
    isCancelled: () => boolean;
    afterEach: (done: number, total: number) => Promise<void>;
    onSkip?: (reason: SkipReason, obj: VectorObject) => void;
  },
): Promise<CollectedGeometry | null> {
  const pageClipBounds = options?.pageClip
    ? resolvePageClipRect(config, options.pageClip)
    : null;
  const sorted = objects
    .filter((o) => o.visible)
    .sort((a, b) => (a.sourceColor ?? "").localeCompare(b.sourceColor ?? ""));
  const result: CollectedGeometry = {
    subpaths: [],
    points: [],
    skippedObjects: 0,
  };
  let lastColor: string | undefined = undefined;
  let colorObjectCount = 0;

  for (let i = 0; i < sorted.length; i++) {
    if (hooks.isCancelled()) return null;
    const obj = sorted[i];
    const normalized = normalizeTopOriginAnchorObject(obj, config);

    const tap = placePointTap(obj, normalized, config, options?.pageClip);
    if (tap) result.points.push(tap);
    else if (obj.pointTap)
      hooks.onSkip?.("point tap outside the page or bed", obj);

    if (obj.sourceColor !== lastColor && i > 0) {
      lines.push(colorBatchComment(lastColor, colorObjectCount));
      colorObjectCount = 0;
    }
    lastColor = obj.sourceColor;
    colorObjectCount++;

    const { clipped, validGeometry, rawCount } = objectGeometry(
      obj,
      normalized,
      config,
      pageClipBounds,
    );
    if (!validGeometry) {
      result.skippedObjects++;
      hooks.onSkip?.("unreadable path data", obj);
    } else if (clipped.length === 0 && !obj.pointTap) {
      hooks.onSkip?.(
        rawCount === 0
          ? "no drawable geometry"
          : "entirely outside the page or bed",
        obj,
      );
    }

    for (const sp of applyPassesToSubpaths(
      clipped,
      obj.passCount ?? 1,
      obj.passMode ?? "repeat",
    )) {
      if (sp.length >= 2)
        result.subpaths.push({
          points: sp,
          layer: obj.layer,
          color: obj.sourceColor,
        });
    }
    await hooks.afterEach(i + 1, sorted.length);
  }

  if (sorted.length > 0 && lastColor !== undefined)
    lines.push(colorBatchComment(lastColor, colorObjectCount));
  return result;
}
