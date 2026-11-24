import { describe, it, expect } from "vitest";
import {
  nearestNeighbourSort,
  nearestNeighbourSortCooperative,
  joinSubpaths,
  joinSubpathsCooperative,
  OperationCancelledError,
  type Subpath,
} from "../../src/workers/gcodeEngine/stages/pathOptimization";

describe("gcode path optimization stage", () => {
  it("orders by nearest startpoint chaining from previous endpoint", () => {
    const a: Subpath = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const b: Subpath = [
      { x: 11, y: 0 },
      { x: 20, y: 0 },
    ];
    const c: Subpath = [
      { x: 60, y: 60 },
      { x: 70, y: 70 },
    ];
    const result = nearestNeighbourSort([c, b, a]);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(b);
    expect(result[2]).toBe(c);
  });

  it("retains completion via fallback when comparison distances are non-finite", () => {
    const a: Subpath = [
      { x: 0, y: 0 },
      { x: Number.NaN, y: 0 },
    ];
    const b: Subpath = [
      { x: 20, y: 20 },
      { x: 25, y: 25 },
    ];
    const c: Subpath = [
      { x: 30, y: 30 },
      { x: 35, y: 35 },
    ];
    const result = nearestNeighbourSort([a, b, c]);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(a);
    expect(result.includes(b)).toBe(true);
    expect(result.includes(c)).toBe(true);
  });

  it("reverses next subpath when its end is closer than its start", () => {
    const first: Subpath = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const hatchLikeNext: Subpath = [
      { x: 30, y: 0 },
      { x: 11, y: 0 },
    ];

    const result = nearestNeighbourSort([first, hatchLikeNext]);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(first);
    expect(result[1]).toEqual([
      { x: 11, y: 0 },
      { x: 30, y: 0 },
    ]);
  });

  it("respects original direction when reversal is disabled", () => {
    const first: Subpath = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const hatchLikeNext: Subpath = [
      { x: 30, y: 0 },
      { x: 11, y: 0 },
    ];

    const result = nearestNeighbourSort([first, hatchLikeNext], {
      allowReverse: false,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(first);
    expect(result[1]).toBe(hatchLikeNext);
  });

  it("joins only when endpoint gap is within tolerance", () => {
    const result = joinSubpaths(
      [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        [
          { x: 10.1, y: 0 },
          { x: 20, y: 0 },
        ],
        [
          { x: 40, y: 0 },
          { x: 50, y: 0 },
        ],
      ],
      0.2,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(4);
    expect(result[1]).toHaveLength(2);
  });
});

/** A scattered set of short subpaths, the same each run. */
function scattered(n: number): Subpath[] {
  let seed = 5;
  const rnd = () =>
    (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: n }, () =>
    Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => ({
      x: Math.round(rnd() * 80),
      y: Math.round(rnd() * 80),
    })),
  );
}

// The cooperative versions are what G-code generation runs; they must give
// exactly the sync result while staying cancellable.
describe("cooperative path optimisation", () => {
  it("sorts exactly as the sync sort does, either way round", async () => {
    const input = scattered(40);
    for (const allowReverse of [true, false]) {
      expect(
        await nearestNeighbourSortCooperative(input, { allowReverse }),
      ).toEqual(nearestNeighbourSort(input, { allowReverse }));
    }
  });

  it("reports progress once per subpath placed", async () => {
    const progress: number[] = [];
    await nearestNeighbourSortCooperative(scattered(12), {
      onProgress: (done, total) => progress.push(done / total),
    });
    expect(progress).toHaveLength(12);
    expect(progress.at(-1)).toBe(1);
  });

  it("yields to the event loop on a long sort and still finishes", async () => {
    const input = scattered(300);
    // The shortest yield interval (4 ms), so a slow run yields part-way; the
    // result must match the sync sort either way.
    expect(
      await nearestNeighbourSortCooperative(input, { yieldIntervalMs: 0 }),
    ).toEqual(nearestNeighbourSort(input));
  });

  it("stops with OperationCancelledError when cancelled part-way", async () => {
    let calls = 0;
    await expect(
      nearestNeighbourSortCooperative(scattered(30), {
        shouldCancel: () => ++calls > 40,
      }),
    ).rejects.toBeInstanceOf(OperationCancelledError);
  });

  it("joins exactly as the sync join does, and can be cancelled", async () => {
    const input = scattered(50);
    expect(
      await joinSubpathsCooperative(input, 15, { yieldIntervalMs: 0 }),
    ).toEqual(joinSubpaths(input, 15));
    await expect(
      joinSubpathsCooperative(input, 15, { shouldCancel: () => true }),
    ).rejects.toThrow("Operation cancelled");
  });
});

/** A seeded random number generator (mulberry32). Simple LCGs give badly
 * correlated x/y pairs: one put every start on just 64 points. */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Short strokes on a coarse integer grid, so many are equally near. */
function tied(n: number, size: number): Subpath[] {
  const rnd = seededRandom(9);
  return Array.from({ length: n }, () =>
    Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => ({
      x: Math.floor(rnd() * size),
      y: Math.floor(rnd() * size),
    })),
  );
}

const sqDist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// The sort stops searching once nothing further out can be nearer; these
// check it never stops too soon.
describe("nearest-neighbour sort search", () => {
  for (const allowReverse of [true, false]) {
    it(`always takes a nearest remaining subpath (reverse ${allowReverse})`, () => {
      for (const [n, size] of [
        [400, 5],
        [400, 60],
        [1500, 300],
      ]) {
        const input = tied(n, size);
        const sorted = nearestNeighbourSort(input, { allowReverse });
        const remaining = new Set(input);
        let pen = { x: 0, y: 0 };
        for (const sp of sorted) {
          let nearest = Infinity;
          for (const r of remaining) {
            nearest = Math.min(
              nearest,
              sqDist(pen, r[0]),
              allowReverse ? sqDist(pen, r[r.length - 1]) : Infinity,
            );
          }
          expect(sqDist(pen, sp[0])).toBe(nearest);
          const original = remaining.has(sp)
            ? sp
            : input.find(
                (r) =>
                  remaining.has(r) &&
                  r !== sp &&
                  r.length === sp.length &&
                  r.every((p, k) => p === sp[sp.length - 1 - k]),
              );
          expect(original).toBeDefined();
          remaining.delete(original!);
          pen = sp[sp.length - 1];
        }
        expect(remaining.size).toBe(0);
      }
    });
  }

  it("finds a reversed subpath whose start is far from the pen", () => {
    const first: Subpath = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ];
    const near: Subpath = [
      { x: 500, y: 1 },
      { x: 0.5, y: 1 },
    ];
    const filler = Array.from({ length: 200 }, (_, i): Subpath => [
      { x: 100 + i, y: 300 },
      { x: 100 + i, y: 301 },
    ]);
    expect(nearestNeighbourSort([first, ...filler, near])[1]).toEqual(
      [...near].reverse(),
    );
  });

  it("sorts tens of thousands of subpaths quickly", { timeout: 60_000 }, () => {
    const input = tied(50_000, 400);
    const t0 = performance.now();
    nearestNeighbourSort(input);
    // Takes about 0.1 s locally; scanning the whole grid for every subpath
    // took minutes. The limit leaves room for slow CI runners.
    expect(performance.now() - t0).toBeLessThan(20_000);
  });
});

/** Checks `sorted` holds each of `input` exactly once, as is or reversed. */
function expectEachPlacedOnce(input: Subpath[], sorted: Subpath[]) {
  expect(sorted).toHaveLength(input.length);
  const unplaced = new Set(input);
  // A reversed copy holds the same point objects, so find it by its first one.
  const byFirstPoint = new Map<object, Subpath[]>();
  for (const sp of input) {
    const key = sp[sp.length - 1];
    byFirstPoint.set(key, [...(byFirstPoint.get(key) ?? []), sp]);
  }
  for (const sp of sorted) {
    let original: Subpath | undefined = unplaced.has(sp) ? sp : undefined;
    original ??= byFirstPoint
      .get(sp[0])
      ?.find(
        (r) =>
          unplaced.has(r) &&
          r.length === sp.length &&
          r.every((p, k) => p === sp[sp.length - 1 - k]),
      );
    expect(
      original,
      "a subpath placed twice, or not from the input",
    ).toBeDefined();
    unplaced.delete(original!);
  }
  expect(unplaced.size).toBe(0);
}

// Every subpath must come out exactly once, however awkward its layout.
describe("nearest-neighbour sort keeps every subpath", () => {
  const rnd = seededRandom(21);
  const seg = (x1: number, y1: number, x2: number, y2: number): Subpath => [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ];
  const layouts: Record<string, () => Subpath[]> = {
    "random strokes": () => tied(5_000, 200),
    "heavy ties on a tiny grid": () => tied(2_000, 4),
    "everything on one point": () =>
      Array.from({ length: 1_000 }, () => seg(5, 5, 5, 5)),
    "single-point subpaths": () =>
      Array.from({ length: 3_000 }, () => [
        { x: Math.floor(rnd() * 50), y: Math.floor(rnd() * 50) },
      ]),
    "one vertical line": () =>
      Array.from({ length: 1_500 }, (_, i) => seg(3, i, 3, i + 1)),
    "hatching, ends far from starts": () =>
      Array.from({ length: 1_500 }, (_, i) => seg(0, i * 0.1, 300, i * 0.1)),
    "negative coordinates and a far outlier": () => [
      ...Array.from({ length: 5_000 }, () =>
        seg(
          -80 + rnd() * 10,
          -60 + rnd() * 10,
          -80 + rnd() * 10,
          -60 + rnd() * 10,
        ),
      ),
      seg(1e6, 1e6, -1e6, -1e6),
    ],
    "two distant clusters": () =>
      Array.from({ length: 5_000 }, (_, i) => {
        const o = i % 2 ? 5_000 : 0;
        return seg(o + rnd(), o + rnd(), o + rnd(), o + rnd());
      }),
    "a NaN end": () => [seg(0, 0, Number.NaN, 0), ...tied(500, 50)],
  };

  for (const [name, make] of Object.entries(layouts)) {
    for (const allowReverse of [true, false]) {
      it(`${name} (reverse ${allowReverse})`, { timeout: 30_000 }, async () => {
        const input = make();
        expectEachPlacedOnce(
          input,
          nearestNeighbourSort(input, { allowReverse }),
        );
        expectEachPlacedOnce(
          input,
          await nearestNeighbourSortCooperative(input, { allowReverse }),
        );
      });
    }
  }
});
