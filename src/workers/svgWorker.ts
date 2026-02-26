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
  const { taskId, objects, config } = msg;
  const lines: string[] = [];

  lines.push("; ── terraForge G-code ──────────────────────────────────────");
  lines.push(`; Machine  : ${config.name}`);
  lines.push(`; Bed      : ${config.bedWidth} x ${config.bedHeight} mm`);
  lines.push(`; Origin   : ${config.origin}`);
  lines.push(`; Generated: ${new Date().toISOString()}`);
  lines.push("; ────────────────────────────────────────────────────────────");
  lines.push("G90      ; Absolute coordinates");
  lines.push("G21      ; Units: mm");
  lines.push(config.penUpCommand + " ; Pen up");
  lines.push("");

  const visibleObjects = objects.filter((o) => o.visible);
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

  lines.push("; ── End of job ──────────────────────────────────────────────");
  lines.push("G0 X0 Y0 ; Return to origin");
  lines.push(config.penUpCommand + " ; Pen up — safe");
  self.postMessage({ type: "complete", taskId, gcode: lines.join("\n") });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Pt {
  x: number;
  y: number;
}
type Subpath = Pt[];
// ── Nearest-neighbour path optimiser ─────────────────────────────────────────────
// Greedily reorders subpaths so each successive path starts as close as
// possible to where the pen currently is, minimising total rapid travel.
function nearestNeighbourSort(subpaths: Subpath[]): Subpath[] {
  if (subpaths.length === 0) return [];
  const remaining = subpaths.slice();
  const sorted: Subpath[] = [];
  let curX = 0,
    curY = 0;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i][0];
      const d = (s.x - curX) ** 2 + (s.y - curY) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const chosen = remaining.splice(bestIdx, 1)[0];
    sorted.push(chosen);
    const last = chosen[chosen.length - 1];
    curX = last.x;
    curY = last.y;
  }
  return sorted;
}
interface PathToken {
  type: string;
  args: number[];
}

// ── Coordinate transform ──────────────────────────────────────────────────────

function transformPt(
  obj: VectorObject,
  config: MachineConfig,
  svgX: number,
  svgY: number,
): Pt {
  // Scale from SVG user units. During import, path coordinates are normalised
  // so (0, 0) is the top-left of the content bounding box and the full extent
  // is (svgWidth × svgHeight) in user units.
  let x = svgX * obj.scale;
  let y = svgY * obj.scale;
  if (obj.rotation !== 0) {
    const rad = (obj.rotation * Math.PI) / 180;
    const cos = Math.cos(rad),
      sin = Math.sin(rad);
    [x, y] = [x * cos - y * sin, x * sin + y * cos];
  }
  x += obj.x;

  // obj.y is the machine Y coordinate of the BOTTOM edge of the content
  // (matching how the canvas uses imp.y via getBedY(imp.y + svgHeight * scale)).
  // SVG Y increases downward; machine Y (for bottom-origin machines) increases
  // upward.  Correct mapping:
  //   machine Y = obj.y + (originalHeight - svgY) * scale
  // i.e. svgY=originalHeight → machine Y = obj.y  (bottom edge at obj.y) ✓
  //      svgY=0             → machine Y = obj.y + height  (top edge above) ✓
  if (config.origin === "bottom-left" || config.origin === "bottom-right") {
    y = obj.y + obj.originalHeight * obj.scale - y;
  } else {
    // top-left / top-right: machine Y increases downward, same as SVG Y.
    y += obj.y;
  }

  if (config.origin === "bottom-right" || config.origin === "top-right")
    x = config.bedWidth - x;
  if (config.origin === "center") {
    x = x - config.bedWidth / 2;
    y = config.bedHeight / 2 - y;
  }
  return { x, y };
}

// ── Main flattener ────────────────────────────────────────────────────────────

function flattenToSubpaths(
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
  let lastCpX = 0,
    lastCpY = 0;

  const push = (x: number, y: number) => {
    cur.push(transformPt(obj, config, x, y));
    cx = x;
    cy = y;
  };

  for (const cmd of abs) {
    const t = cmd.type;
    const a = cmd.args;
    switch (t) {
      case "M": {
        if (cur.length > 1) subpaths.push(cur);
        cur = [];
        cx = a[0];
        cy = a[1];
        startX = cx;
        startY = cy;
        cur.push(transformPt(obj, config, cx, cy));
        lastCpX = cx;
        lastCpY = cy;
        for (let i = 2; i < a.length; i += 2) push(a[i], a[i + 1]);
        break;
      }
      case "L":
        for (let i = 0; i < a.length; i += 2) push(a[i], a[i + 1]);
        lastCpX = cx;
        lastCpY = cy;
        break;
      case "H":
        for (let i = 0; i < a.length; i++) push(a[i], cy);
        lastCpX = cx;
        lastCpY = cy;
        break;
      case "V":
        for (let i = 0; i < a.length; i++) push(cx, a[i]);
        lastCpX = cx;
        lastCpY = cy;
        break;
      case "Z":
        push(startX, startY);
        subpaths.push(cur);
        cur = [];
        lastCpX = cx;
        lastCpY = cy;
        break;
      case "C":
        for (let i = 0; i < a.length; i += 6) {
          for (const p of cubicBezier(
            cx,
            cy,
            a[i],
            a[i + 1],
            a[i + 2],
            a[i + 3],
            a[i + 4],
            a[i + 5],
          ))
            push(p.x, p.y);
          lastCpX = a[i + 2];
          lastCpY = a[i + 3];
        }
        break;
      case "S":
        for (let i = 0; i < a.length; i += 4) {
          const c1x = 2 * cx - lastCpX,
            c1y = 2 * cy - lastCpY;
          for (const p of cubicBezier(
            cx,
            cy,
            c1x,
            c1y,
            a[i],
            a[i + 1],
            a[i + 2],
            a[i + 3],
          ))
            push(p.x, p.y);
          lastCpX = a[i];
          lastCpY = a[i + 1];
        }
        break;
      case "Q":
        for (let i = 0; i < a.length; i += 4) {
          for (const p of quadBezier(
            cx,
            cy,
            a[i],
            a[i + 1],
            a[i + 2],
            a[i + 3],
          ))
            push(p.x, p.y);
          lastCpX = a[i];
          lastCpY = a[i + 1];
        }
        break;
      case "T":
        for (let i = 0; i < a.length; i += 2) {
          const cpx = 2 * cx - lastCpX,
            cpy = 2 * cy - lastCpY;
          for (const p of quadBezier(cx, cy, cpx, cpy, a[i], a[i + 1]))
            push(p.x, p.y);
          lastCpX = cpx;
          lastCpY = cpy;
        }
        break;
      case "A":
        for (let i = 0; i < a.length; i += 7) {
          for (const p of arcToBeziers(
            cx,
            cy,
            a[i],
            a[i + 1],
            a[i + 2],
            a[i + 3],
            a[i + 4],
            a[i + 5],
            a[i + 6],
          ))
            push(p.x, p.y);
          lastCpX = cx;
          lastCpY = cy;
        }
        break;
    }
  }
  if (cur.length > 1) subpaths.push(cur);
  return subpaths;
}

// ── Path tokenizer ────────────────────────────────────────────────────────────

function tokenizePath(d: string): PathToken[] {
  const tokens: PathToken[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])([\s\S]*?)(?=[MmLlHhVvCcSsQqTtAaZz]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const args = m[2].trim()
      ? m[2]
          .trim()
          .split(/[\s,]+|(?=-)/)
          .filter(Boolean)
          .map(Number)
          .filter(isFinite)
      : [];
    tokens.push({ type: m[1], args });
  }
  return tokens;
}

// ── Absolute coordinate converter ─────────────────────────────────────────────

function toAbsolute(tokens: PathToken[]): PathToken[] {
  const abs: PathToken[] = [];
  let cx = 0,
    cy = 0,
    startX = 0,
    startY = 0;

  for (const tok of tokens) {
    const t = tok.type;
    const T = t.toUpperCase();
    const rel = t !== T && T !== "Z";
    const a = tok.args.slice();

    if (T === "Z") {
      abs.push({ type: "Z", args: [] });
      cx = startX;
      cy = startY;
      continue;
    }

    switch (T) {
      case "M": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 2) {
          const ax = rel ? cx + a[i] : a[i];
          const ay = rel ? cy + a[i + 1] : a[i + 1];
          out.push(ax, ay);
          cx = ax;
          cy = ay;
          if (i === 0) {
            startX = cx;
            startY = cy;
          }
        }
        abs.push({ type: "M", args: out });
        break;
      }
      case "L": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 2) {
          cx = rel ? cx + a[i] : a[i];
          cy = rel ? cy + a[i + 1] : a[i + 1];
          out.push(cx, cy);
        }
        abs.push({ type: "L", args: out });
        break;
      }
      case "H": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i++) {
          cx = rel ? cx + a[i] : a[i];
          out.push(cx);
        }
        abs.push({ type: "H", args: out });
        break;
      }
      case "V": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i++) {
          cy = rel ? cy + a[i] : a[i];
          out.push(cy);
        }
        abs.push({ type: "V", args: out });
        break;
      }
      case "C": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 6) {
          out.push(
            rel ? cx + a[i] : a[i],
            rel ? cy + a[i + 1] : a[i + 1],
            rel ? cx + a[i + 2] : a[i + 2],
            rel ? cy + a[i + 3] : a[i + 3],
            rel ? cx + a[i + 4] : a[i + 4],
            rel ? cy + a[i + 5] : a[i + 5],
          );
          cx = out[out.length - 2];
          cy = out[out.length - 1];
        }
        abs.push({ type: "C", args: out });
        break;
      }
      case "S": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 4) {
          out.push(
            rel ? cx + a[i] : a[i],
            rel ? cy + a[i + 1] : a[i + 1],
            rel ? cx + a[i + 2] : a[i + 2],
            rel ? cy + a[i + 3] : a[i + 3],
          );
          cx = out[out.length - 2];
          cy = out[out.length - 1];
        }
        abs.push({ type: "S", args: out });
        break;
      }
      case "Q": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 4) {
          out.push(
            rel ? cx + a[i] : a[i],
            rel ? cy + a[i + 1] : a[i + 1],
            rel ? cx + a[i + 2] : a[i + 2],
            rel ? cy + a[i + 3] : a[i + 3],
          );
          cx = out[out.length - 2];
          cy = out[out.length - 1];
        }
        abs.push({ type: "Q", args: out });
        break;
      }
      case "T": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 2) {
          cx = rel ? cx + a[i] : a[i];
          cy = rel ? cy + a[i + 1] : a[i + 1];
          out.push(cx, cy);
        }
        abs.push({ type: "T", args: out });
        break;
      }
      case "A": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 7) {
          const ex = rel ? cx + a[i + 5] : a[i + 5],
            ey = rel ? cy + a[i + 6] : a[i + 6];
          out.push(a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], ex, ey);
          cx = ex;
          cy = ey;
        }
        abs.push({ type: "A", args: out });
        break;
      }
    }
  }
  return abs;
}

// ── Bezier subdivision ────────────────────────────────────────────────────────

const FLATNESS_SQ = 0.01; // 0.1 unit max deviation, squared

function cubicBezier(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): Pt[] {
  const pts: Pt[] = [];
  subdivideCubic(x0, y0, x1, y1, x2, y2, x3, y3, pts);
  pts.push({ x: x3, y: y3 });
  return pts;
}

function subdivideCubic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  out: Pt[],
): void {
  const ux = 3 * x1 - 2 * x0 - x3,
    uy = 3 * y1 - 2 * y0 - y3;
  const vx = 3 * x2 - 2 * x3 - x0,
    vy = 3 * y2 - 2 * y3 - y0;
  if (Math.max(ux * ux + uy * uy, vx * vx + vy * vy) <= FLATNESS_SQ * 16)
    return;
  const mx01x = (x0 + x1) / 2,
    mx01y = (y0 + y1) / 2;
  const mx12x = (x1 + x2) / 2,
    mx12y = (y1 + y2) / 2;
  const mx23x = (x2 + x3) / 2,
    mx23y = (y2 + y3) / 2;
  const mx012x = (mx01x + mx12x) / 2,
    mx012y = (mx01y + mx12y) / 2;
  const mx123x = (mx12x + mx23x) / 2,
    mx123y = (mx12y + mx23y) / 2;
  const midx = (mx012x + mx123x) / 2,
    midy = (mx012y + mx123y) / 2;
  subdivideCubic(x0, y0, mx01x, mx01y, mx012x, mx012y, midx, midy, out);
  out.push({ x: midx, y: midy });
  subdivideCubic(midx, midy, mx123x, mx123y, mx23x, mx23y, x3, y3, out);
}

function quadBezier(
  x0: number,
  y0: number,
  cpx: number,
  cpy: number,
  x1: number,
  y1: number,
): Pt[] {
  const c1x = x0 + (2 / 3) * (cpx - x0),
    c1y = y0 + (2 / 3) * (cpy - y0);
  const c2x = x1 + (2 / 3) * (cpx - x1),
    c2y = y1 + (2 / 3) * (cpy - y1);
  return cubicBezier(x0, y0, c1x, c1y, c2x, c2y, x1, y1);
}

// ── SVG arc to cubics (SVG spec algorithm) ────────────────────────────────────

function arcToBeziers(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  xRot: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
): Pt[] {
  if (x1 === x2 && y1 === y2) return [];
  if (rx === 0 || ry === 0) return [{ x: x2, y: y2 }];
  const phi = (xRot * Math.PI) / 180,
    cosPhi = Math.cos(phi),
    sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2,
    dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy,
    y1p = -sinPhi * dx + cosPhi * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  let rx2 = rx * rx,
    ry2 = ry * ry;
  const x1p2 = x1p * x1p,
    y1p2 = y1p * y1p;
  const lam = x1p2 / rx2 + y1p2 / ry2;
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
    rx2 = rx * rx;
    ry2 = ry * ry;
  }
  const sign = largeArc !== sweep ? 1 : -1;
  const sq = Math.max(
    0,
    (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2),
  );
  const coef = sign * Math.sqrt(sq);
  const cxp = (coef * rx * y1p) / ry,
    cyp = (-coef * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const n = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    return (
      (ux * vy - uy * vx < 0 ? -1 : 1) *
      Math.acos(Math.min(1, Math.max(-1, (ux * vx + uy * vy) / n)))
    );
  };

  let theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = ang(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry,
  );
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const segs = Math.ceil(Math.abs(dTheta) / (Math.PI / 2));
  const dt = dTheta / segs;
  const alpha = (4 / 3) * Math.tan(dt / 4);
  const pts: Pt[] = [];

  for (let i = 0; i < segs; i++) {
    const t1 = theta1 + i * dt,
      t2 = theta1 + (i + 1) * dt;
    const cos1 = Math.cos(t1),
      sin1 = Math.sin(t1),
      cos2 = Math.cos(t2),
      sin2 = Math.sin(t2);
    const bx0 = cx + cosPhi * rx * cos1 - sinPhi * ry * sin1;
    const by0 = cy + sinPhi * rx * cos1 + cosPhi * ry * sin1;
    const bx1 = bx0 - alpha * (cosPhi * rx * sin1 + sinPhi * ry * cos1);
    const by1 = by0 - alpha * (sinPhi * rx * sin1 - cosPhi * ry * cos1);
    const bx3 = cx + cosPhi * rx * cos2 - sinPhi * ry * sin2;
    const by3 = cy + sinPhi * rx * cos2 + cosPhi * ry * sin2;
    const bx2 = bx3 + alpha * (cosPhi * rx * sin2 + sinPhi * ry * cos2);
    const by2 = by3 + alpha * (sinPhi * rx * sin2 - cosPhi * ry * cos2);
    pts.push(...cubicBezier(bx0, by0, bx1, by1, bx2, by2, bx3, by3));
  }
  return pts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toFixed(3);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
