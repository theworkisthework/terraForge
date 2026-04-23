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
  type Pt,
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

type Side = "left" | "right";

interface SubpathRecord {
  points: Subpath;
  objectId: string;
  hasFill: boolean;
}

interface SegmentRecord {
  a: Pt;
  b: Pt;
  ownerIndex: number;
}

const KNIFE_MIN_RADIUS_MM = 0.1;
const KNIFE_CLOSED_EPS = 1e-4;
const KNIFE_SEGMENT_INTERSECT_EPS = 1e-6;
const KNIFE_MAX_FILL_INTRUSIONS = 2;

function sqDist(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function isClosedSubpath(sp: Subpath): boolean {
  return (
    sp.length >= 3 && sqDist(sp[0], sp[sp.length - 1]) <= KNIFE_CLOSED_EPS ** 2
  );
}

function signedArea(sp: Subpath): number {
  if (sp.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < sp.length - 1; i++) {
    const p = sp[i];
    const q = sp[i + 1];
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

function normalizeVec(x: number, y: number): Pt | null {
  const m = Math.hypot(x, y);
  if (m <= 1e-9) return null;
  return { x: x / m, y: y / m };
}

function firstTangent(sp: Subpath): Pt | null {
  if (sp.length < 2) return null;
  for (let i = 1; i < sp.length; i++) {
    const t = normalizeVec(sp[i].x - sp[i - 1].x, sp[i].y - sp[i - 1].y);
    if (t) return t;
  }
  return null;
}

function tangentNormals(t: Pt): { left: Pt; right: Pt } {
  return {
    left: { x: -t.y, y: t.x },
    right: { x: t.y, y: -t.x },
  };
}

function contourCrossings(pt: Pt, contour: Subpath): number {
  let crossings = 0;
  for (let i = 0; i < contour.length - 1; i++) {
    const a = contour[i];
    const b = contour[i + 1];
    const intersectsY = a.y > pt.y !== b.y > pt.y;
    if (!intersectsY) continue;
    const xAtY = a.x + ((pt.y - a.y) * (b.x - a.x)) / (b.y - a.y);
    if (xAtY > pt.x) crossings++;
  }
  return crossings;
}

function pointInsideFilledRegion(pt: Pt, contours: Subpath[]): boolean {
  let crossings = 0;
  for (const contour of contours) {
    crossings += contourCrossings(pt, contour);
  }
  return (crossings & 1) === 1;
}

function overcutFromStart(
  sp: Subpath,
  overcutMM: number,
): { points: Pt[]; endPoint: Pt; endTangent: Pt } {
  const start = sp[0];
  const defaultTangent = firstTangent(sp) ?? { x: 1, y: 0 };
  if (overcutMM <= 0) {
    return { points: [], endPoint: start, endTangent: defaultTangent };
  }

  let remaining = overcutMM;
  const emitted: Pt[] = [];
  let endPoint = start;
  let endTangent = defaultTangent;

  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1];
    const b = sp[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-9) continue;
    const tx = dx / len;
    const ty = dy / len;
    endTangent = { x: tx, y: ty };

    if (remaining >= len) {
      emitted.push({ x: b.x, y: b.y });
      endPoint = b;
      remaining -= len;
      continue;
    }

    const p = { x: a.x + tx * remaining, y: a.y + ty * remaining };
    emitted.push(p);
    endPoint = p;
    remaining = 0;
    break;
  }

  return { points: emitted, endPoint, endTangent };
}

function segmentIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  const orient = (p: Pt, q: Pt, r: Pt) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

  const onSeg = (p: Pt, q: Pt, r: Pt) =>
    Math.min(p.x, r.x) - KNIFE_SEGMENT_INTERSECT_EPS <= q.x &&
    q.x <= Math.max(p.x, r.x) + KNIFE_SEGMENT_INTERSECT_EPS &&
    Math.min(p.y, r.y) - KNIFE_SEGMENT_INTERSECT_EPS <= q.y &&
    q.y <= Math.max(p.y, r.y) + KNIFE_SEGMENT_INTERSECT_EPS;

  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);

  if (Math.abs(o1) <= KNIFE_SEGMENT_INTERSECT_EPS && onSeg(a1, b1, a2))
    return true;
  if (Math.abs(o2) <= KNIFE_SEGMENT_INTERSECT_EPS && onSeg(a1, b2, a2))
    return true;
  if (Math.abs(o3) <= KNIFE_SEGMENT_INTERSECT_EPS && onSeg(b1, a1, b2))
    return true;
  if (Math.abs(o4) <= KNIFE_SEGMENT_INTERSECT_EPS && onSeg(b1, a2, b2))
    return true;

  return o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0;
}

function interpolateArc(
  start: Pt,
  end: Pt,
  center: Pt,
  ccw: boolean,
  steps = 12,
): Pt[] {
  const a0 = Math.atan2(start.y - center.y, start.x - center.x);
  let a1 = Math.atan2(end.y - center.y, end.x - center.x);
  if (ccw && a1 <= a0) a1 += Math.PI * 2;
  if (!ccw && a1 >= a0) a1 -= Math.PI * 2;
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + (a1 - a0) * t;
    const r = Math.hypot(start.x - center.x, start.y - center.y);
    out.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });
  }
  return out;
}

function countIntersections(
  polyline: Pt[],
  allSegments: SegmentRecord[],
  ownerIndex: number,
): number {
  let count = 0;
  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1];
    const b = polyline[i];
    for (const seg of allSegments) {
      if (seg.ownerIndex === ownerIndex) continue;
      if (segmentIntersect(a, b, seg.a, seg.b)) {
        count++;
      }
    }
  }
  return count;
}

function countPointsInsideFill(polyline: Pt[], contours: Subpath[]): number {
  let count = 0;
  for (const p of polyline) {
    if (pointInsideFilledRegion(p, contours)) count++;
  }
  return count;
}

function preferredWasteSide(
  sp: Subpath,
  objectContours: Subpath[],
  hasFill: boolean,
): Side {
  const t = firstTangent(sp);
  if (!t) return "left";
  if (!hasFill || objectContours.length === 0) return "left";

  const leftKeepScore = sideKeepScore(sp, t, "left", objectContours);
  const rightKeepScore = sideKeepScore(sp, t, "right", objectContours);

  if (Math.abs(leftKeepScore - rightKeepScore) > 1e-3) {
    return leftKeepScore < rightKeepScore ? "left" : "right";
  }

  const n = tangentNormals(t);

  const sample = Math.max(
    0.1,
    Math.min(0.5, Math.hypot(sp[1].x - sp[0].x, sp[1].y - sp[0].y) * 0.25),
  );
  const leftPt = {
    x: sp[0].x + n.left.x * sample,
    y: sp[0].y + n.left.y * sample,
  };
  const rightPt = {
    x: sp[0].x + n.right.x * sample,
    y: sp[0].y + n.right.y * sample,
  };
  const leftKeep = pointInsideFilledRegion(leftPt, objectContours);
  const rightKeep = pointInsideFilledRegion(rightPt, objectContours);

  if (leftKeep !== rightKeep) {
    return leftKeep ? "right" : "left";
  }

  const area = signedArea(sp);
  return area >= 0 ? "right" : "left";
}

function sideKeepScore(
  sp: Subpath,
  t: Pt,
  side: Side,
  objectContours: Subpath[],
): number {
  const normals = tangentNormals(t);
  const n = side === "left" ? normals.left : normals.right;
  const segLen =
    sp.length >= 2 ? Math.hypot(sp[1].x - sp[0].x, sp[1].y - sp[0].y) : 1;
  const lateral = Math.max(0.08, Math.min(1, segLen * 0.2));
  const along = Math.max(0.05, Math.min(1.5, segLen * 0.35));

  let keepVotes = 0;
  let totalVotes = 0;

  for (const a of [0, along * 0.5, along]) {
    for (const d of [lateral * 0.5, lateral, lateral * 1.5]) {
      const p = {
        x: sp[0].x + t.x * a + n.x * d,
        y: sp[0].y + t.y * a + n.y * d,
      };
      if (pointInsideFilledRegion(p, objectContours)) keepVotes++;
      totalVotes++;
    }
  }

  return totalVotes > 0 ? keepVotes / totalVotes : 0.5;
}

function buildLeadIn(
  p0: Pt,
  t: Pt,
  side: Side,
  radius: number,
): {
  start: Pt;
  end: Pt;
  i: number;
  j: number;
  g: "G2" | "G3";
  polyline: Pt[];
} {
  const normals = tangentNormals(t);
  const n = side === "left" ? normals.left : normals.right;
  const center = { x: p0.x + n.x * radius, y: p0.y + n.y * radius };
  const start = {
    x: p0.x + (n.x - t.x) * radius,
    y: p0.y + (n.y - t.y) * radius,
  };
  const g = side === "left" ? "G3" : "G2";
  return {
    start,
    end: p0,
    i: t.x * radius,
    j: t.y * radius,
    g,
    polyline: interpolateArc(start, p0, center, g === "G3"),
  };
}

function buildLeadOut(
  p: Pt,
  t: Pt,
  side: Side,
  radius: number,
): { end: Pt; i: number; j: number; g: "G2" | "G3"; polyline: Pt[] } {
  const normals = tangentNormals(t);
  const n = side === "left" ? normals.left : normals.right;
  const center = { x: p.x + n.x * radius, y: p.y + n.y * radius };
  const end = { x: p.x + (n.x + t.x) * radius, y: p.y + (n.y + t.y) * radius };
  const g = side === "left" ? "G3" : "G2";
  return {
    end,
    i: n.x * radius,
    j: n.y * radius,
    g,
    polyline: interpolateArc(p, end, center, g === "G3"),
  };
}

function wasteSideMarginViolations(
  point: Pt,
  tangent: Pt,
  side: Side,
  contours: Subpath[],
  hasFill: boolean,
  marginMM: number,
): number {
  if (!hasFill || contours.length === 0 || marginMM <= 0) return 0;
  const normals = tangentNormals(tangent);
  const n = side === "left" ? normals.left : normals.right;

  // All samples should remain on waste side (outside filled region)
  // as we move slightly further along the chosen side normal.
  const samples: Pt[] = [
    point,
    {
      x: point.x + n.x * (marginMM * 0.5),
      y: point.y + n.y * (marginMM * 0.5),
    },
    { x: point.x + n.x * marginMM, y: point.y + n.y * marginMM },
  ];

  let violations = 0;
  for (const p of samples) {
    if (pointInsideFilledRegion(p, contours)) violations++;
  }
  return violations;
}

function buildSegments(subpaths: Subpath[]): SegmentRecord[] {
  const segs: SegmentRecord[] = [];
  for (let i = 0; i < subpaths.length; i++) {
    const sp = subpaths[i];
    for (let s = 1; s < sp.length; s++) {
      const a = sp[s - 1];
      const b = sp[s];
      if (sqDist(a, b) <= 1e-12) continue;
      segs.push({ a, b, ownerIndex: i });
    }
  }
  return segs;
}

function rotateClosedSubpath(sp: Subpath, startIdx: number): Subpath {
  if (!isClosedSubpath(sp) || sp.length < 4) return sp;
  const ring = sp.slice(0, -1);
  const n = ring.length;
  if (n <= 1) return sp;

  const idx = ((Math.trunc(startIdx) % n) + n) % n;
  if (idx === 0) return sp;

  const rotated = ring.slice(idx).concat(ring.slice(0, idx));
  rotated.push(rotated[0]);
  return rotated;
}

function seamStartIndices(sp: Subpath, maxCandidates = 24): number[] {
  if (!isClosedSubpath(sp) || sp.length < 4) return [0];
  const n = sp.length - 1;
  if (n <= maxCandidates) return Array.from({ length: n }, (_, i) => i);

  const step = Math.ceil(n / maxCandidates);
  const out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(i);
  if (out[0] !== 0) out.unshift(0);
  return out;
}

/**
 * Insert the midpoint of every edge so that seam candidates include
 * non-corner positions.  For a closed triangle with only 3 corner
 * vertices this is critical: at a corner the arc-start vector
 * (n – t)*r always points partially outward, but a midpoint seam on
 * a flat edge lets the arc tip land cleanly inside the hole.
 */
function densifyClosedSubpath(sp: Subpath): Subpath {
  if (!isClosedSubpath(sp) || sp.length < 3) return sp;
  const ring = sp.slice(0, -1);
  const dense: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    dense.push(ring[i]);
    const next = ring[(i + 1) % ring.length];
    dense.push({ x: (ring[i].x + next.x) * 0.5, y: (ring[i].y + next.y) * 0.5 });
  }
  dense.push(dense[0]);
  return dense;
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
  const joinRequested = options?.joinPaths ?? false;
  const joinTol = options?.joinTolerance ?? 0.2;
  const knifeLeadEnabled = options?.knifeLeadInOutEnabled ?? false;
  const doJoin = joinRequested && !knifeLeadEnabled;
  const knifeLeadRadiusMM = Math.max(
    KNIFE_MIN_RADIUS_MM,
    options?.knifeLeadRadiusMM ?? 1,
  );
  const knifeOvercutMM = Math.max(0, options?.knifeOvercutMM ?? 1);
  const liftPenAtEnd = options?.liftPenAtEnd ?? true;
  const returnToHome = options?.returnToHome ?? false;
  const customStartGcode = (options?.customStartGcode ?? "").trim();
  const customEndGcode = (options?.customEndGcode ?? "").trim();
  const hasDelayOverride = typeof options?.penDownDelayMsOverride === "number";
  const rawDelayMs = hasDelayOverride
    ? (options.penDownDelayMsOverride ?? 0)
    : config.penType === "servo" || config.penType === "solenoid"
      ? (config.penDownDelayMs ?? 0)
      : 0;
  const penDownDelayMs = Number.isFinite(rawDelayMs)
    ? Math.max(0, rawDelayMs)
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
  lines.push(
    `; Joined   : ${doJoin ? `yes (tolerance ${joinTol} mm)` : joinRequested && knifeLeadEnabled ? "no (disabled by knife lead mode)" : "no"}`,
  );
  lines.push(
    `; Knife LI : ${knifeLeadEnabled ? `yes (R=${knifeLeadRadiusMM} mm, overcut=${knifeOvercutMM} mm)` : "no"}`,
  );
  lines.push(`; Lift end : ${liftPenAtEnd ? "yes" : "no"}`);
  lines.push(`; Ret home : ${returnToHome ? "yes" : "no"}`);
  lines.push(`; Pen delay: ${penDownDelayMs} ms`);
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
  const allRecords: SubpathRecord[] = [];
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
        allRecords.push({
          points: sp,
          objectId: obj.id,
          hasFill: obj.hasFill ?? false,
        });
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
  const orderedRecords = (() => {
    if (!optimise) return allRecords.slice();
    const sortedSubpaths = nearestNeighbourSort(
      allRecords.map((r) => r.points),
    );
    const byRef = new Map<Subpath, SubpathRecord[]>();
    for (const rec of allRecords) {
      const bucket = byRef.get(rec.points);
      if (bucket) {
        bucket.push(rec);
      } else {
        byRef.set(rec.points, [rec]);
      }
    }
    return sortedSubpaths
      .map((sp) => {
        const bucket = byRef.get(sp);
        if (!bucket || bucket.length === 0) return undefined;
        return bucket.shift();
      })
      .filter((rec): rec is SubpathRecord => !!rec);
  })();

  // ── Phase 3: optional path joining ────────────────────────────────────────
  // Joining is applied after NN sort so that already-adjacent subpaths
  // (which NN sort placed next to each other) get merged where possible.
  const finalRecords = doJoin
    ? joinSubpaths(
        orderedRecords.map((r) => r.points),
        joinTol,
      ).map(
        (sp): SubpathRecord => ({
          points: sp,
          objectId: "",
          hasFill: false,
        }),
      )
    : orderedRecords;

  const objectContours = new Map<string, Subpath[]>();
  for (const rec of finalRecords) {
    if (!rec.objectId || !isClosedSubpath(rec.points)) continue;
    const bucket = objectContours.get(rec.objectId);
    if (bucket) {
      bucket.push(rec.points);
    } else {
      objectContours.set(rec.objectId, [rec.points]);
    }
  }

  const allSegments = buildSegments(finalRecords.map((r) => r.points));

  // ── Phase 4: emit G-code ─────────────────────────────────────────────────
  const modeLabel = optimise ? "Optimised" : "Sequential";
  lines.push(
    `; -- ${modeLabel} path (${finalRecords.length} subpaths) -----------`,
  );
  if (skippedObjects > 0) {
    lines.push(`; NOTE: skipped ${skippedObjects} invalid path object(s)`);
  }

  const yieldPh4 = makeYielder();
  let lastPct4 = -1;
  for (let i = 0; i < finalRecords.length; i++) {
    if (cancelled.has(taskId)) {
      cancelled.delete(taskId);
      self.postMessage({ type: "cancelled", taskId });
      return;
    }
    const rec = finalRecords[i];
    const subpath = rec.points;
    let emitSubpath = subpath;
    let emitFirst = emitSubpath[0];
    const drawSpeed =
      typeof options?.drawSpeedOverride === "number"
        ? options.drawSpeedOverride
        : config.drawSpeed;

    const closedForKnife =
      knifeLeadEnabled && isClosedSubpath(subpath) && subpath.length >= 3;
    let emitBaseTangent = firstTangent(emitSubpath);
    let emitOvercutTrail = overcutFromStart(emitSubpath, knifeOvercutMM);

    let activeKnife = false;
    let knifeSide: Side = "left";
    let knifeRadius = knifeLeadRadiusMM;

    if (closedForKnife && emitBaseTangent) {
      const contourSet = objectContours.get(rec.objectId) ?? [];
      let best: {
        seamIdx: number;
        seamOrder: number;
        side: Side;
        radius: number;
        collisions: number;
        fillIntrusions: number;
        marginViolations: number;
        keepScore: number;
      } | null = null;

      // Use a densified subpath (midpoints inserted) so seam candidates
      // include non-corner positions.  This is essential for tight polygons
      // (e.g. a triangular hole) where every corner produces an arc tip that
      // lands outside the hole, but an edge-midpoint seam does not.
      const denseSubpath = densifyClosedSubpath(subpath);
      const seamCandidates = seamStartIndices(denseSubpath, 24);
      for (let seamOrder = 0; seamOrder < seamCandidates.length; seamOrder++) {
        const seamIdx = seamCandidates[seamOrder];
        const seamSubpath = rotateClosedSubpath(denseSubpath, seamIdx);
        const seamFirst = seamSubpath[0];
        const seamTangent = firstTangent(seamSubpath);
        if (!seamTangent) continue;
        const seamOvercutTrail = overcutFromStart(seamSubpath, knifeOvercutMM);

        const preferred = preferredWasteSide(
          seamSubpath,
          contourSet,
          rec.hasFill,
        );

        const evaluate = (
          side: Side,
          radius: number,
        ): {
          collisions: number;
          fillIntrusions: number;
          marginViolations: number;
        } => {
          const leadIn = buildLeadIn(seamFirst, seamTangent, side, radius);
          const leadOut = buildLeadOut(
            seamOvercutTrail.endPoint,
            seamOvercutTrail.endTangent,
            side,
            radius,
          );

          const collisions =
            countIntersections(leadIn.polyline, allSegments, i) +
            countIntersections(leadOut.polyline, allSegments, i);

          const fillIntrusions =
            rec.hasFill && contourSet.length > 0
              ? countPointsInsideFill(
                  leadIn.polyline.slice(0, -1),
                  contourSet,
                ) + countPointsInsideFill(leadOut.polyline.slice(1), contourSet)
              : 0;

          const safetyMargin = Math.max(0.2, radius * 0.35);
          const marginViolations =
            wasteSideMarginViolations(
              leadIn.start,
              seamTangent,
              side,
              contourSet,
              rec.hasFill,
              safetyMargin,
            ) +
            wasteSideMarginViolations(
              leadOut.end,
              seamOvercutTrail.endTangent,
              side,
              contourSet,
              rec.hasFill,
              safetyMargin,
            );

          return { collisions, fillIntrusions, marginViolations };
        };

        const sideCandidates: Side[] =
          preferred === "left" ? ["left", "right"] : ["right", "left"];

        for (const side of sideCandidates) {
          for (const scale of [1, 0.8, 0.66, 0.5, 0.33, 0.2, 0.1]) {
            const radius = Math.max(
              KNIFE_MIN_RADIUS_MM,
              knifeLeadRadiusMM * scale,
            );
            const { collisions, fillIntrusions, marginViolations } = evaluate(
              side,
              radius,
            );
            const keepScore =
              rec.hasFill && contourSet.length > 0
                ? sideKeepScore(seamSubpath, seamTangent, side, contourSet)
                : 0;

            if (
              !best ||
              marginViolations < best.marginViolations ||
              (marginViolations === best.marginViolations &&
                fillIntrusions < best.fillIntrusions) ||
              (marginViolations === best.marginViolations &&
                fillIntrusions === best.fillIntrusions &&
                collisions < best.collisions) ||
              (marginViolations === best.marginViolations &&
                fillIntrusions === best.fillIntrusions &&
                collisions === best.collisions &&
                keepScore < best.keepScore - 1e-6) ||
              (marginViolations === best.marginViolations &&
                fillIntrusions === best.fillIntrusions &&
                collisions === best.collisions &&
                Math.abs(keepScore - best.keepScore) <= 1e-6 &&
                radius > best.radius) ||
              (marginViolations === best.marginViolations &&
                fillIntrusions === best.fillIntrusions &&
                collisions === best.collisions &&
                Math.abs(keepScore - best.keepScore) <= 1e-6 &&
                Math.abs(radius - best.radius) <= 1e-6 &&
                seamOrder < best.seamOrder)
            ) {
              best = {
                seamIdx,
                seamOrder,
                side,
                radius,
                collisions,
                fillIntrusions,
                marginViolations,
                keepScore,
              };
            }
          }
        }
      }

      if (best && best.collisions === 0) {
        activeKnife = true;
        knifeSide = best.side;
        knifeRadius = best.radius;
        if (best.seamIdx !== 0) {
          emitSubpath = rotateClosedSubpath(denseSubpath, best.seamIdx);
          emitFirst = emitSubpath[0];
          emitBaseTangent = firstTangent(emitSubpath);
          emitOvercutTrail = overcutFromStart(emitSubpath, knifeOvercutMM);
        } else if (denseSubpath !== subpath) {
          // seamIdx === 0 but we still need to emit the densified path
          // so that seam position on an edge midpoint is honoured.
          emitSubpath = denseSubpath;
          emitFirst = emitSubpath[0];
          emitBaseTangent = firstTangent(emitSubpath);
          emitOvercutTrail = overcutFromStart(emitSubpath, knifeOvercutMM);
        }
      } else if (best) {
        lines.push(
          `; Knife note: no safe lead arcs for subpath ${i + 1} (collisions=${best.collisions}, fillIntrusions=${best.fillIntrusions}, marginViolations=${best.marginViolations})`,
        );
      }
    }

    if (activeKnife && emitBaseTangent) {
      const leadIn = buildLeadIn(
        emitFirst,
        emitBaseTangent,
        knifeSide,
        knifeRadius,
      );
      lines.push(
        `G0 X${fmt(leadIn.start.x)} Y${fmt(leadIn.start.y)} ; Knife lead-in start`,
      );
      lines.push(`F${drawSpeed}`);
      lines.push(config.penDownCommand + " ; Pen down");
      if (penDownDelayMs > 0) {
        lines.push(
          `G4 P${fmtSeconds(penDownDelayMs / 1000)} ; Pen settle delay`,
        );
      }
      lines.push(
        `${leadIn.g} X${fmt(leadIn.end.x)} Y${fmt(leadIn.end.y)} I${fmt(leadIn.i)} J${fmt(leadIn.j)} ; Knife lead-in`,
      );
    } else {
      lines.push(`G0 X${fmt(emitFirst.x)} Y${fmt(emitFirst.y)} ; Rapid travel`);
      lines.push(`F${drawSpeed}`);
      lines.push(config.penDownCommand + " ; Pen down");
      if (penDownDelayMs > 0) {
        lines.push(
          `G4 P${fmtSeconds(penDownDelayMs / 1000)} ; Pen settle delay`,
        );
      }
    }

    for (let s = 1; s < emitSubpath.length; s++) {
      lines.push(`G1 X${fmt(emitSubpath[s].x)} Y${fmt(emitSubpath[s].y)}`);
    }

    if (activeKnife) {
      for (const p of emitOvercutTrail.points) {
        lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)} ; Knife overcut`);
      }
      const leadOut = buildLeadOut(
        emitOvercutTrail.endPoint,
        emitOvercutTrail.endTangent,
        knifeSide,
        knifeRadius,
      );
      lines.push(
        `${leadOut.g} X${fmt(leadOut.end.x)} Y${fmt(leadOut.end.y)} I${fmt(leadOut.i)} J${fmt(leadOut.j)} ; Knife lead-out`,
      );
    }

    lines.push(config.penUpCommand + " ; Pen up");
    lines.push("");
    const pct = 40 + Math.round(((i + 1) / finalRecords.length) * 60);
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
