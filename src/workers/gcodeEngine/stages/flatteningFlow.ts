import type { VectorObject, MachineConfig } from "../../../types";
import { tokenizePath, toAbsolute } from "./pathParsing";
import { transformPt, type Pt } from "./geometryFlattening";
import { CURVE_GROUP_SIZE, flattenCurveGroup } from "./curveFlattening";

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
      default: {
        const size = CURVE_GROUP_SIZE[t];
        if (!size) break;
        for (let i = 0; i < a.length; i += size) {
          const curve = flattenCurveGroup(t, a, i, { x: cx, y: cy, cpX: lastCpX, cpY: lastCpY });
          pushFlattenedOrEndpoint(curve.points, curve.endX, curve.endY);
          lastCpX = curve.cpX ?? cx;
          lastCpY = curve.cpY ?? cy;
        }
        break;
      }
    }
  }
  if (cur.length > 1) subpaths.push(cur);
  return subpaths;
}
