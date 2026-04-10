import type { VectorObject, MachineConfig } from "../../../types";

export interface Pt {
  x: number;
  y: number;
}

/**
 * Maps a single SVG user-unit point to machine mm coordinates.
 *
 * The canvas (ImportLayer) rotates around the centre of the bounding box
 * — (originalWidth/2, originalHeight/2) in SVG user units — so we must
 * centre the coordinates on that point before applying rotation, then
 * translate back to the object's machine-space position afterwards.
 *
 * obj.x / obj.y always refer to the LEFT and BOTTOM (or TOP, for top-*
 * origins) edge of the unrotated bounding box in machine mm.
 *
 * scaleX / scaleY are optional per-axis overrides (ratio lock off).
 * When absent both axes use obj.scale.
 */
export function transformPt(
  obj: VectorObject,
  config: MachineConfig,
  svgX: number,
  svgY: number,
): Pt {
  const sX = obj.scaleX ?? obj.scale;
  const sY = obj.scaleY ?? obj.scale;
  const halfW = (obj.originalWidth / 2) * sX;
  const halfH = (obj.originalHeight / 2) * sY;

  // Express the point as an offset from the object's centre in scaled SVG
  // space (SVG Y increases downward).
  let x = svgX * sX - halfW;
  let y = svgY * sY - halfH;

  if (obj.rotation !== 0) {
    const rad = (obj.rotation * Math.PI) / 180;
    const cos = Math.cos(rad),
      sin = Math.sin(rad);
    // Clockwise rotation in Y-down SVG space (matches canvas rotate(deg)).
    [x, y] = [x * cos - y * sin, x * sin + y * cos];
  }

  // Re-anchor from object-centre offset to machine-space absolute position.
  // obj.x is the left edge, so the object centre X = obj.x + halfW.
  x += obj.x + halfW;

  if (config.origin === "bottom-left" || config.origin === "bottom-right") {
    // SVG Y increases downward; machine Y increases upward → negate y offset.
    // Object centre machine-Y = obj.y + halfH  (obj.y is the bottom edge).
    y = obj.y + halfH - y;
  } else {
    // top-* and center: SVG Y and machine Y share the same direction.
    y += obj.y + halfH;
  }

  if (config.origin === "bottom-right" || config.origin === "top-right")
    x = config.bedWidth - x;
  if (config.origin === "center") {
    x = x - config.bedWidth / 2;
    y = config.bedHeight / 2 - y;
  }
  return { x, y };
}

const FLATNESS_SQ = 0.01;

export function cubicBezier(
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

export function quadBezier(
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

export function arcToBeziers(
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

  const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
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
