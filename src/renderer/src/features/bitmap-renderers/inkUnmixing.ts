/**
 * Ink unmixing: how much of each pen to put down so that, together on the
 * paper, they look most like a colour.
 *
 * Model. On light paper `p`, a pen with colour `c` (0–1 per channel, as it
 * looks on white) covering a fraction `d` of the paper lets through
 * `1 - d·(1 - c)` of each channel's light, and pens over one another
 * multiply:
 *
 *   colour = p · Π over inks k of (1 - d_k · a_k),   a_k = 1 - c_k  (what ink k absorbs)
 *
 * On dark paper transparent inks would vanish; what shows there is light,
 * opaque ink (gel, paint) adding light. That is the same model upside down —
 * a screen blend:
 *
 *   1 - colour = (1 - p) · Π over inks k of (1 - d_k · c_k)
 *
 * Both are `target = Π(1 - d_k · a_k)` once the colour is measured against
 * the paper, so one solver serves both. They are what the canvas preview
 * draws (multiply onto light paper, screen onto dark), so the preview shows
 * the closest match the chosen pens can make. Each colour is solved by
 * constrained least squares: the coverages `d` (each held to 0–1) that bring
 * the model nearest the colour, plus a small charge per unit of ink so that,
 * where several mixes match equally (more than three inks, or a black pen
 * alongside colours), the one using least ink wins.
 *
 * Solving every pixel would cost too much on a large photo, so the solution is
 * tabulated on a grid of colours once per palette, and pixels are read from it
 * by trilinear interpolation.
 */

/** Grid points per channel. 33 puts a point every 8 levels; interpolation
 * between them is far finer than any pen can reproduce. */
const GRID = 33;
/** Charge per unit of ink, against squared colour error (0–1 per channel). */
const INK_COST = 0.002;
/** Most coordinate-descent sweeps per start; it stops sooner once no ink moves
 * by more than a fraction of one 8-bit step (1/255). */
const SWEEPS = 25;
/** Tables kept, by palette: a few hundred milliseconds each to build. */
const TABLE_CACHE_SIZE = 4;
const tableCache = new Map<string, Float32Array>();

export type InkColour = readonly [number, number, number];

const WHITE: InkColour = [1, 1, 1];

/** Light paper: inks multiply. Dark paper: inks screen. Same rule as the
 * preview's `isLightPaper` (Rec. 709 luminance at least a half). */
function isLight(paper: InkColour): boolean {
  return 0.2126 * paper[0] + 0.7152 * paper[1] + 0.0722 * paper[2] >= 0.5;
}

/**
 * The model in the solver's terms: what each ink takes away (flat, three per
 * ink), and how to measure a colour against the paper — the fraction the
 * inks must leave (1 = no ink needed). A paper channel with nothing to give
 * (black in it, on light paper) cannot be changed by ink, so asks for none.
 */
function modelFor(inks: InkColour[], paper: InkColour) {
  const light = isLight(paper);
  const absorb = new Float64Array(inks.flatMap((ink) => (light ? [1 - ink[0], 1 - ink[1], 1 - ink[2]] : [...ink])));
  const measure = (colour: number, c: number): number => {
    const room = light ? paper[c] : 1 - paper[c];
    if (room < 1e-3) return 1;
    return Math.min(1, Math.max(0, (light ? colour : 1 - colour) / room));
  };
  return { absorb, measure };
}

/**
 * Coverages for one target colour, by coordinate descent: with the other
 * inks fixed, the model is linear in one ink's coverage, so each step solves
 * that ink exactly and clamps it to 0–1. `d` is the starting guess, updated
 * in place. `absorb` is flat, three values per ink.
 *
 * The light let through by all inks is kept up to date as inks change, so
 * the light through all but one is a division rather than a product over
 * every other ink — except where that ink blocks a channel completely.
 */
function solveInto(target: Float64Array, absorb: Float64Array, d: Float64Array, light: Float64Array): void {
  const n = d.length;
  const recompute = () => {
    light[0] = light[1] = light[2] = 1;
    for (let j = 0; j < n; j++) for (let c = 0; c < 3; c++) light[c] *= 1 - d[j] * absorb[j * 3 + c];
  };
  recompute();
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    let moved = 0;
    for (let k = 0; k < n; k++) {
      // colour_c = others_c - d·others_c·a_kc, where others_c is the light
      // let through by every ink but k: minimise Σ(u_c - d·v_c)² + cost·d.
      let uv = 0;
      let vv = 0;
      for (let c = 0; c < 3; c++) {
        const a = absorb[k * 3 + c];
        const own = 1 - d[k] * a;
        let others: number;
        if (own > 1e-9) others = light[c] / own;
        else {
          others = 1;
          for (let j = 0; j < n; j++) if (j !== k) others *= 1 - d[j] * absorb[j * 3 + c];
        }
        const u = others - target[c];
        const v = others * a;
        uv += u * v;
        vv += v * v;
      }
      const next = vv > 1e-12 ? Math.min(1, Math.max(0, (uv - INK_COST / 2) / vv)) : 0;
      if (next !== d[k]) {
        moved = Math.max(moved, Math.abs(next - d[k]));
        d[k] = next;
        recompute();
      }
    }
    if (moved < 1e-3) break;
  }
}

/** Squared colour error of a mix, plus its ink charge — what `solveInto` minimises. */
function costOf(target: Float64Array, absorb: Float64Array, d: Float64Array): number {
  let cost = 0;
  for (let c = 0; c < 3; c++) {
    let light = 1;
    for (let k = 0; k < d.length; k++) light *= 1 - d[k] * absorb[k * 3 + c];
    cost += (light - target[c]) ** 2;
  }
  for (let k = 0; k < d.length; k++) cost += INK_COST * d[k];
  return cost;
}

/**
 * Coverage of each ink at every grid colour, `[cell * inks + k]`, cells
 * ordered red-major.
 *
 * Inks multiply, so a colour can have several locally best mixes, and
 * descent finds whichever is nearest its start: black from cyan, magenta and
 * yellow when a black pen would do, say. So each cell tries several starts —
 * its neighbour's answer, no ink, and each ink alone — and keeps the best.
 * The neighbour's answer wins ties, so where mixes are equally good, nearby
 * colours pick the same one rather than jumping between them.
 */
export function buildUnmixTable(inks: InkColour[], paper: InkColour = WHITE): Float32Array {
  const n = inks.length;
  const { absorb, measure } = modelFor(inks, paper);
  const table = new Float32Array(GRID * GRID * GRID * n);
  const d = new Float64Array(n);
  const best = new Float64Array(n);
  const light = new Float64Array(3);
  const target = new Float64Array(3);
  for (let r = 0; r < GRID; r++) {
    for (let g = 0; g < GRID; g++) {
      for (let b = 0; b < GRID; b++) {
        const cell = (r * GRID + g) * GRID + b;
        const from = b > 0 ? cell - 1 : g > 0 ? cell - GRID : r > 0 ? cell - GRID * GRID : -1;
        target[0] = measure(r / (GRID - 1), 0);
        target[1] = measure(g / (GRID - 1), 1);
        target[2] = measure(b / (GRID - 1), 2);
        let bestCost = Infinity;
        // Start -1: the neighbour's answer (or no ink, for the first cell);
        // n: no ink; 0..n-1: that ink alone, at full coverage.
        for (let start = -1; start <= n; start++) {
          if (start === -1) for (let k = 0; k < n; k++) d[k] = from >= 0 ? table[from * n + k] : 0;
          else for (let k = 0; k < n; k++) d[k] = k === start ? 1 : 0;
          solveInto(target, absorb, d, light);
          const cost = costOf(target, absorb, d);
          if (cost < bestCost - 1e-6) {
            bestCost = cost;
            best.set(d);
          }
        }
        for (let k = 0; k < n; k++) table[cell * n + k] = best[k];
      }
    }
  }
  return table;
}

/**
 * Each ink's coverage over an image, 0 (none) to 255 (full), one array per
 * ink. `rgba` is 8-bit RGBA, as decoded; `paper` defaults to white.
 */
export function unmixInks(
  rgba: Uint8Array | Uint8ClampedArray,
  pixelCount: number,
  inks: InkColour[],
  paper: InkColour = WHITE,
): Uint8Array[] {
  const n = inks.length;
  const key = JSON.stringify([inks, paper]);
  let table = tableCache.get(key);
  if (!table) {
    table = buildUnmixTable(inks, paper);
    if (tableCache.size >= TABLE_CACHE_SIZE) tableCache.delete(tableCache.keys().next().value!);
    tableCache.set(key, table);
  }
  // Grid cell and position within it for each channel level, so the pixel
  // loop does no division.
  const base = new Int32Array(256);
  const frac = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    const position = (v / 255) * (GRID - 1);
    const i = Math.min(GRID - 2, Math.floor(position));
    base[v] = i;
    frac[v] = position - i;
  }
  const out = inks.map(() => new Uint8Array(pixelCount));
  const strideR = GRID * GRID * n;
  const strideG = GRID * n;
  for (let p = 0; p < pixelCount; p++) {
    const o = p * 4;
    const R = rgba[o];
    const G = rgba[o + 1];
    const B = rgba[o + 2];
    const fr = frac[R];
    const fg = frac[G];
    const fb = frac[B];
    const c000 = base[R] * strideR + base[G] * strideG + base[B] * n;
    const w000 = (1 - fr) * (1 - fg) * (1 - fb);
    const w001 = (1 - fr) * (1 - fg) * fb;
    const w010 = (1 - fr) * fg * (1 - fb);
    const w011 = (1 - fr) * fg * fb;
    const w100 = fr * (1 - fg) * (1 - fb);
    const w101 = fr * (1 - fg) * fb;
    const w110 = fr * fg * (1 - fb);
    const w111 = fr * fg * fb;
    for (let k = 0; k < n; k++) {
      const c = c000 + k;
      const coverage =
        w000 * table[c] +
        w001 * table[c + n] +
        w010 * table[c + strideG] +
        w011 * table[c + strideG + n] +
        w100 * table[c + strideR] +
        w101 * table[c + strideR + n] +
        w110 * table[c + strideR + strideG] +
        w111 * table[c + strideR + strideG + n];
      out[k][p] = Math.round(coverage * 255);
    }
  }
  return out;
}

/** The colour a set of coverages (0–1) makes on the paper (white by
 * default) — the model `unmixInks` inverts, and the canvas preview draws. */
export function mixInks(coverages: number[], inks: InkColour[], paper: InkColour = WHITE): [number, number, number] {
  const light = isLight(paper);
  const left = [1, 1, 1];
  coverages.forEach((d, k) => {
    for (let c = 0; c < 3; c++) left[c] *= 1 - d * (light ? 1 - inks[k][c] : inks[k][c]);
  });
  return [0, 1, 2].map((c) => (light ? paper[c] * left[c] : 1 - (1 - paper[c]) * left[c])) as [number, number, number];
}
