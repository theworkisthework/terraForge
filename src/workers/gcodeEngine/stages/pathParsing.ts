export interface PathToken {
  type: string;
  args: number[];
}

export function tokenizePath(d: string): PathToken[] {
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

export function toAbsolute(tokens: PathToken[]): PathToken[] {
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
          const ex = rel ? cx + a[i + 5] : a[i + 5];
          const ey = rel ? cy + a[i + 6] : a[i + 6];
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
