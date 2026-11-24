import { describe, it, expect } from "vitest";
import {
  countReversed,
  formatStatsComments,
  travelDistanceMm,
} from "../../src/workers/generation/pathStats";
import { nearestNeighbourSort, type Subpath } from "../../src/workers/gcodeEngine/stages/pathOptimization";

const line = (x1: number, y1: number, x2: number, y2: number): Subpath => [
  { x: x1, y: y1 },
  { x: x2, y: y2 },
];

describe("travelDistanceMm", () => {
  it("is zero for no subpaths", () => {
    expect(travelDistanceMm([])).toBe(0);
  });

  it("measures from the origin and between each end and the next start", () => {
    // origin -> (3,4) = 5; (3,10) -> (3,20) = 10
    expect(travelDistanceMm([line(3, 4, 3, 10), line(3, 20, 0, 0)])).toBe(15);
  });

  it("skips empty subpaths", () => {
    expect(travelDistanceMm([[], line(3, 4, 3, 4)])).toBe(5);
  });
});

describe("countReversed", () => {
  it("counts the subpaths the sort drew end-to-start", () => {
    // From the origin, b's end (1,0) is nearest, so b is reversed.
    const a = line(50, 0, 60, 0);
    const b = line(10, 0, 1, 0);
    const input = [a, b];
    const sorted = nearestNeighbourSort(input, { allowReverse: true });
    expect(countReversed(input, sorted)).toBe(1);
  });

  it("is zero when reversal is not allowed", () => {
    const input = [line(50, 0, 60, 0), line(10, 0, 1, 0)];
    expect(countReversed(input, nearestNeighbourSort(input, { allowReverse: false }))).toBe(0);
  });
});

describe("formatStatsComments", () => {
  it("reports travel saved and each pass that ran", () => {
    const lines = formatStatsComments({
      subpathsIn: 10,
      subpathsOut: 8,
      travelBeforeMm: 200,
      travelAfterMm: 50,
      sort: { ms: 12.4, reversed: 3 },
      join: { ms: 1.6, merged: 2 },
    });
    expect(lines).toEqual([
      "; Subpaths : 10 in, 8 out",
      "; Travel   : 200.0 mm -> 50.0 mm (75.0% less)",
      "; Sort     : 12 ms, 3 reversed",
      "; Join     : 2 ms, 2 merged",
    ]);
  });

  it("reports only total travel when nothing reordered", () => {
    const lines = formatStatsComments({ subpathsIn: 2, subpathsOut: 2, travelBeforeMm: 30, travelAfterMm: 30 });
    expect(lines).toEqual(["; Subpaths : 2 in, 2 out", "; Travel   : 30.0 mm"]);
  });

  it("does not divide by zero when there was no travel", () => {
    const lines = formatStatsComments({
      subpathsIn: 0,
      subpathsOut: 0,
      travelBeforeMm: 0,
      travelAfterMm: 0,
      sort: { ms: 0, reversed: 0 },
    });
    expect(lines[1]).toBe("; Travel   : 0.0 mm -> 0.0 mm");
  });
});
