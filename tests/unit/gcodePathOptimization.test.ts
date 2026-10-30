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
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: n }, () =>
    Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => ({ x: Math.round(rnd() * 80), y: Math.round(rnd() * 80) })),
  );
}

// The cooperative versions are what G-code generation runs; they must give
// exactly the sync result while staying cancellable.
describe("cooperative path optimisation", () => {
  it("sorts exactly as the sync sort does, either way round", async () => {
    const input = scattered(40);
    for (const allowReverse of [true, false]) {
      expect(await nearestNeighbourSortCooperative(input, { allowReverse })).toEqual(
        nearestNeighbourSort(input, { allowReverse }),
      );
    }
  });

  it("reports progress once per subpath placed", async () => {
    const progress: number[] = [];
    await nearestNeighbourSortCooperative(scattered(12), { onProgress: (done, total) => progress.push(done / total) });
    expect(progress).toHaveLength(12);
    expect(progress.at(-1)).toBe(1);
  });

  it("yields to the event loop on a long sort and still finishes", async () => {
    const input = scattered(300);
    // The shortest yield interval (4 ms), so a slow run yields part-way; the
    // result must match the sync sort either way.
    expect(await nearestNeighbourSortCooperative(input, { yieldIntervalMs: 0 })).toEqual(nearestNeighbourSort(input));
  });

  it("stops with OperationCancelledError when cancelled part-way", async () => {
    let calls = 0;
    await expect(
      nearestNeighbourSortCooperative(scattered(30), { shouldCancel: () => ++calls > 40 }),
    ).rejects.toBeInstanceOf(OperationCancelledError);
  });

  it("joins exactly as the sync join does, and can be cancelled", async () => {
    const input = scattered(50);
    expect(await joinSubpathsCooperative(input, 15, { yieldIntervalMs: 0 })).toEqual(joinSubpaths(input, 15));
    await expect(joinSubpathsCooperative(input, 15, { shouldCancel: () => true })).rejects.toThrow("Operation cancelled");
  });
});
