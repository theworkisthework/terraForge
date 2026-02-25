/**
 * SVG transform resolution utilities.
 *
 * Resolves nested `transform` attributes on SVG elements (and all their
 * ancestor `<g>` elements up to the SVG root) and bakes the resulting matrix
 * into an absolute path `d` string.
 *
 * This ensures that Inkscape-style files, which encode layer offsets as
 * `transform="matrix(...)"` or `transform="translate(...)"` on <g> elements,
 * are imported at their correct positions on the canvas and produce correct
 * G-code coordinates.
 *
 * Public API:
 *   getAccumulatedTransform(el)  → DOMMatrix
 *   applyMatrixToPathD(d, m)     → string
 */

// ── Path token types ──────────────────────────────────────────────────────────

interface PathToken {
  type: string; // upper-case command letter
  args: number[];
}

// ── Path tokenizer ────────────────────────────────────────────────────────────

function tokenizePath(d: string): PathToken[] {
  const tokens: PathToken[] = [];
  const re =
    /([MmLlHhVvCcSsQqTtAaZz])([\s\S]*?)(?=[MmLlHhVvCcSsQqTtAaZz]|$)/g;
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

// ── Absolute + expanded converter ─────────────────────────────────────────────
//
// Converts all commands to absolute coordinates AND expands:
//   H → L  (needs current Y)
//   V → L  (needs current X)
//
// Output commands: M, L, C, S, Q, T, A, Z  (no H or V)

function toAbsoluteExpanded(tokens: PathToken[]): PathToken[] {
  const abs: PathToken[] = [];
  let cx = 0,
    cy = 0,
    startX = 0,
    startY = 0;
  let lastCpX = 0,
    lastCpY = 0;

  for (const tok of tokens) {
    const t = tok.type;
    const rel = t === t.toLowerCase() && t !== "Z" && t !== "z";
    const T = t.toUpperCase();
    const a = tok.args;

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
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case "L": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 2) {
          const ax = rel ? cx + a[i] : a[i];
          const ay = rel ? cy + a[i + 1] : a[i + 1];
          out.push(ax, ay);
          cx = ax;
          cy = ay;
        }
        abs.push({ type: "L", args: out });
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case "H": {
        // Expand to L using current Y
        const out: number[] = [];
        for (let i = 0; i < a.length; i++) {
          const ax = rel ? cx + a[i] : a[i];
          out.push(ax, cy);
          cx = ax;
        }
        abs.push({ type: "L", args: out });
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case "V": {
        // Expand to L using current X
        const out: number[] = [];
        for (let i = 0; i < a.length; i++) {
          const ay = rel ? cy + a[i] : a[i];
          out.push(cx, ay);
          cy = ay;
        }
        abs.push({ type: "L", args: out });
        lastCpX = cx;
        lastCpY = cy;
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
          lastCpX = out[out.length - 4];
          lastCpY = out[out.length - 3];
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
          lastCpX = out[out.length - 4];
          lastCpY = out[out.length - 3];
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
          lastCpX = out[out.length - 4];
          lastCpY = out[out.length - 3];
          cx = out[out.length - 2];
          cy = out[out.length - 1];
        }
        abs.push({ type: "Q", args: out });
        break;
      }
      case "T": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 2) {
          const ax = rel ? cx + a[i] : a[i];
          const ay = rel ? cy + a[i + 1] : a[i + 1];
          out.push(ax, ay);
          lastCpX = 2 * cx - lastCpX;
          lastCpY = 2 * cy - lastCpY;
          cx = ax;
          cy = ay;
        }
        abs.push({ type: "T", args: out });
        break;
      }
      case "A": {
        const out: number[] = [];
        for (let i = 0; i < a.length; i += 7) {
          const ex = rel ? cx + a[i + 5] : a[i + 5];
          const ey = rel ? cy + a[i + 6] : a[i + 6];
          out.push(a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], ex, ey);
          cx = ex;
          cy = ey;
        }
        abs.push({ type: "A", args: out });
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
      case "Z": {
        abs.push({ type: "Z", args: [] });
        cx = startX;
        cy = startY;
        lastCpX = cx;
        lastCpY = cy;
        break;
      }
    }
  }
  return abs;
}

// ── Arc parameter transform ───────────────────────────────────────────────────
//
// Transforms SVG arc ellipse parameters (rx, ry, x-axis-rotation) under the
// linear part of the given matrix.
//
// Method: decompose the ellipse into its parametric form, apply the linear
// transform to the spanning vectors, then recover the new semi-axes and
// rotation from the resulting quadratic form.
//
// This correctly handles uniform scale, non-uniform scale, rotation, and
// arbitrary 2D linear transforms.

function transformArcParams(
  rx: number,
  ry: number,
  phiDeg: number,
  m: DOMMatrix,
): { rx: number; ry: number; phiDeg: number } {
  const a = m.a,
    b = m.b,
    c = m.c,
    d = m.d;
  const phiRad = (phiDeg * Math.PI) / 180;
  const cosP = Math.cos(phiRad),
    sinP = Math.sin(phiRad);

  // Spanning vectors of the ellipse in original space:
  //   u = (rx*cosP, rx*sinP)  — along x-axis of ellipse
  //   v = (-ry*sinP, ry*cosP) — along y-axis of ellipse
  // After applying linear part of M:
  const Px = a * rx * cosP + c * rx * sinP;
  const Py = b * rx * cosP + d * rx * sinP;
  const Qx = -a * ry * sinP + c * ry * cosP;
  const Qy = -b * ry * sinP + d * ry * cosP;

  // The quadratic form of the transformed ellipse has matrix:
  //   [[A, C], [C, B]]
  // where A = Px²+Py², B = Qx²+Qy², C = Px·Qx+Py·Qy
  const A = Px * Px + Py * Py;
  const B = Qx * Qx + Qy * Qy;
  const C = Px * Qx + Py * Qy;

  // Eigenvalues λ₁ ≥ λ₂ of [[A,C],[C,B]] give the squared semi-axes.
  const avg = (A + B) / 2;
  const delta = Math.sqrt(Math.max(0, ((A - B) / 2) ** 2 + C * C));
  const lam1 = avg + delta;
  const lam2 = avg - delta;

  // New rotation from the first eigenvector.
  const newPhiRad = 0.5 * Math.atan2(2 * C, A - B);

  return {
    rx: Math.sqrt(Math.max(0, lam1)),
    ry: Math.sqrt(Math.max(0, lam2)),
    phiDeg: (newPhiRad * 180) / Math.PI,
  };
}

// ── Number formatter ──────────────────────────────────────────────────────────

const N = 6; // decimal places in serialized path

function fmt(n: number): string {
  // Trim trailing zeros for readability
  return parseFloat(n.toFixed(N)).toString();
}

// ── Main transform application ────────────────────────────────────────────────

/**
 * Applies a 2-D affine DOMMatrix to every coordinate in a path `d` string.
 * The path is first absolutized and H/V commands are expanded to L.
 * Returns the transformed path as an absolute `d` string.
 *
 * If the matrix is the identity, the input is returned unchanged (fast path).
 */
export function applyMatrixToPathD(d: string, m: DOMMatrix): string {
  if (m.isIdentity) return d;

  const tp = (x: number, y: number): [number, number] => {
    const pt = m.transformPoint({ x, y, z: 0, w: 1 });
    return [pt.x, pt.y];
  };

  const tokens = tokenizePath(d);
  const abs = toAbsoluteExpanded(tokens);
  const parts: string[] = [];

  for (const cmd of abs) {
    const a = cmd.args;
    switch (cmd.type) {
      case "M": {
        const pts: string[] = [];
        for (let i = 0; i < a.length; i += 2) {
          const [x, y] = tp(a[i], a[i + 1]);
          pts.push(`${fmt(x)},${fmt(y)}`);
        }
        parts.push(`M ${pts.join(" ")}`);
        break;
      }
      case "L": {
        const pts: string[] = [];
        for (let i = 0; i < a.length; i += 2) {
          const [x, y] = tp(a[i], a[i + 1]);
          pts.push(`${fmt(x)},${fmt(y)}`);
        }
        parts.push(`L ${pts.join(" ")}`);
        break;
      }
      case "C": {
        const pts: string[] = [];
        for (let i = 0; i < a.length; i += 6) {
          for (let j = 0; j < 6; j += 2) {
            const [x, y] = tp(a[i + j], a[i + j + 1]);
            pts.push(`${fmt(x)},${fmt(y)}`);
          }
        }
        parts.push(`C ${pts.join(" ")}`);
        break;
      }
      case "S": {
        const pts: string[] = [];
        for (let i = 0; i < a.length; i += 4) {
          for (let j = 0; j < 4; j += 2) {
            const [x, y] = tp(a[i + j], a[i + j + 1]);
            pts.push(`${fmt(x)},${fmt(y)}`);
          }
        }
        parts.push(`S ${pts.join(" ")}`);
        break;
      }
      case "Q": {
        const pts: string[] = [];
        for (let i = 0; i < a.length; i += 4) {
          for (let j = 0; j < 4; j += 2) {
            const [x, y] = tp(a[i + j], a[i + j + 1]);
            pts.push(`${fmt(x)},${fmt(y)}`);
          }
        }
        parts.push(`Q ${pts.join(" ")}`);
        break;
      }
      case "T": {
        const pts: string[] = [];
        for (let i = 0; i < a.length; i += 2) {
          const [x, y] = tp(a[i], a[i + 1]);
          pts.push(`${fmt(x)},${fmt(y)}`);
        }
        parts.push(`T ${pts.join(" ")}`);
        break;
      }
      case "A": {
        // a[i+0] = rx, a[i+1] = ry, a[i+2] = x-axis-rotation,
        // a[i+3] = large-arc, a[i+4] = sweep, a[i+5] = x, a[i+6] = y
        const segs: string[] = [];
        for (let i = 0; i < a.length; i += 7) {
          const { rx, ry, phiDeg } = transformArcParams(
            a[i],
            a[i + 1],
            a[i + 2],
            m,
          );
          // Determine if the matrix includes a reflection — if so, flip sweep
          const det = m.a * m.d - m.b * m.c;
          const sweep = det < 0 ? 1 - a[i + 4] : a[i + 4];
          const [ex, ey] = tp(a[i + 5], a[i + 6]);
          segs.push(
            `${fmt(rx)},${fmt(ry)},${fmt(phiDeg)},${a[i + 3]},${sweep},${fmt(ex)},${fmt(ey)}`,
          );
        }
        parts.push(`A ${segs.join(" ")}`);
        break;
      }
      case "Z":
        parts.push("Z");
        break;
    }
  }

  return parts.join(" ");
}

// ── Accumulated transform walker ──────────────────────────────────────────────

/**
 * Returns the composed DOMMatrix for all `transform` attributes from the SVG
 * root down to `el` (inclusive).
 *
 * Walks from `el` toward the root, collecting each element's local transform
 * list (via SVGGraphicsElement.transform.baseVal), then multiplies them
 * outermost-first so that the result correctly maps the element's local
 * coordinate space to the SVG root coordinate space.
 *
 * Works with DOMParser-produced documents (no display attachment required).
 */
export function getAccumulatedTransform(el: Element): DOMMatrix {
  // Collect matrices from element up to (not including) the <svg> root,
  // prepending each so the resulting array is ordered outermost → innermost.
  const matrices: DOMMatrix[] = [];
  let node: Element | null = el;

  while (node && node.nodeName.toLowerCase() !== "svg") {
    const svgNode = node as SVGGraphicsElement;
    const baseVal = svgNode.transform?.baseVal;

    if (baseVal && baseVal.numberOfItems > 0) {
      const consolidated = baseVal.consolidate();
      if (consolidated) {
        const lm = consolidated.matrix;
        matrices.unshift(
          new DOMMatrix([lm.a, lm.b, lm.c, lm.d, lm.e, lm.f]),
        );
      }
    }
    node = node.parentElement;
  }

  // Multiply outermost → innermost: result * T_outer * ... * T_inner
  let result = new DOMMatrix(); // identity
  for (const m of matrices) {
    result = result.multiply(m);
  }
  return result;
}
