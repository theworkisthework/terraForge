export interface PathToken {
  type: string;
  args: number[];
}

const PATH_NUMBER_RE = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

function parsePathArgs(argText: string): number[] {
  const matches = argText.match(PATH_NUMBER_RE) ?? [];
  return matches.map(Number).filter(Number.isFinite);
}

export function tokenizePath(d: string): PathToken[] {
  const tokens: PathToken[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])([\s\S]*?)(?=[MmLlHhVvCcSsQqTtAaZz]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const args = m[2].trim() ? parsePathArgs(m[2]) : [];
    tokens.push({ type: m[1], args });
  }
  return tokens;
}

/**
 * What each value of a command's argument group is: an x or y coordinate
 * (offset by the current point when the command is relative), or a plain
 * number passed through as it is (an arc's radii, rotation and flags). A
 * group's last x and y are where the pen ends up.
 */
type ArgRole = "x" | "y" | "n";
const ARG_ROLES: Record<string, ArgRole[]> = {
  M: ["x", "y"],
  L: ["x", "y"],
  T: ["x", "y"],
  H: ["x"],
  V: ["y"],
  C: ["x", "y", "x", "y", "x", "y"],
  S: ["x", "y", "x", "y"],
  Q: ["x", "y", "x", "y"],
  A: ["n", "n", "n", "n", "n", "x", "y"],
};

/**
 * Converts every command to absolute coordinates. With `expandHV`, H and V
 * become L (they need the current point, which a later transform may not
 * keep axis-aligned); otherwise they stay H and V.
 *
 * Each group of a repeated command (`L 1 2 3 4`) is resolved against the
 * point the previous group ended at, as SVG specifies. An incomplete final
 * group is passed through as it is.
 */
export function toAbsolute(tokens: PathToken[], options: { expandHV?: boolean } = {}): PathToken[] {
  const abs: PathToken[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  for (const tok of tokens) {
    const T = tok.type.toUpperCase();
    if (T === "Z") {
      abs.push({ type: "Z", args: [] });
      cx = startX;
      cy = startY;
      continue;
    }
    const roles = ARG_ROLES[T];
    if (!roles) continue;
    const rel = tok.type !== T;
    const a = tok.args;
    const expand = options.expandHV && (T === "H" || T === "V");
    const out: number[] = [];

    for (let i = 0; i < a.length; i += roles.length) {
      let endX = cx;
      let endY = cy;
      const group = roles.map((role, j) => {
        const value = a[i + j];
        if (role === "x") return (endX = rel ? cx + value : value);
        if (role === "y") return (endY = rel ? cy + value : value);
        return value;
      });
      if (expand) out.push(endX, endY);
      else out.push(...group);
      cx = endX;
      cy = endY;
      if (T === "M" && i === 0) {
        startX = cx;
        startY = cy;
      }
    }
    abs.push({ type: expand ? "L" : T, args: out });
  }
  return abs;
}
