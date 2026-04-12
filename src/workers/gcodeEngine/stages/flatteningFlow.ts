import type { VectorObject, MachineConfig } from "../../../types";
import { tokenizePath, toAbsolute } from "./pathParsing";
import {
  transformPt,
  cubicBezier,
  quadBezier,
  arcToBeziers,
  type Pt,
} from "./geometryFlattening";

export type Subpath = Pt[];

export function flattenToSubpaths(
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
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    cur.push(transformPt(obj, config, x, y));
    cx = x;
    cy = y;
  };

  const pushFlattenedOrEndpoint = (
    points: Pt[],
    endX: number,
    endY: number,
  ) => {
    if (points.length > 0) {
      for (const p of points) push(p.x, p.y);
      return;
    }
    // Approximation fallback: preserve path continuity with endpoint segment.
    push(endX, endY);
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
          const endX = a[i + 4];
          const endY = a[i + 5];
          const points = cubicBezier(
            cx,
            cy,
            a[i],
            a[i + 1],
            a[i + 2],
            a[i + 3],
            endX,
            endY,
          );
          pushFlattenedOrEndpoint(points, endX, endY);
          lastCpX = a[i + 2];
          lastCpY = a[i + 3];
        }
        break;
      case "S":
        for (let i = 0; i < a.length; i += 4) {
          const c1x = 2 * cx - lastCpX,
            c1y = 2 * cy - lastCpY;
          const endX = a[i + 2];
          const endY = a[i + 3];
          const points = cubicBezier(
            cx,
            cy,
            c1x,
            c1y,
            a[i],
            a[i + 1],
            endX,
            endY,
          );
          pushFlattenedOrEndpoint(points, endX, endY);
          lastCpX = a[i];
          lastCpY = a[i + 1];
        }
        break;
      case "Q":
        for (let i = 0; i < a.length; i += 4) {
          const endX = a[i + 2];
          const endY = a[i + 3];
          const points = quadBezier(cx, cy, a[i], a[i + 1], endX, endY);
          pushFlattenedOrEndpoint(points, endX, endY);
          lastCpX = a[i];
          lastCpY = a[i + 1];
        }
        break;
      case "T":
        for (let i = 0; i < a.length; i += 2) {
          const cpx = 2 * cx - lastCpX,
            cpy = 2 * cy - lastCpY;
          const endX = a[i];
          const endY = a[i + 1];
          const points = quadBezier(cx, cy, cpx, cpy, endX, endY);
          pushFlattenedOrEndpoint(points, endX, endY);
          lastCpX = cpx;
          lastCpY = cpy;
        }
        break;
      case "A":
        for (let i = 0; i < a.length; i += 7) {
          const endX = a[i + 5];
          const endY = a[i + 6];
          const points = arcToBeziers(
            cx,
            cy,
            a[i],
            a[i + 1],
            a[i + 2],
            a[i + 3],
            a[i + 4],
            endX,
            endY,
          );
          pushFlattenedOrEndpoint(points, endX, endY);
          lastCpX = cx;
          lastCpY = cy;
        }
        break;
    }
  }
  if (cur.length > 1) subpaths.push(cur);
  return subpaths;
}
