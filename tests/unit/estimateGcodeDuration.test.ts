import { describe, it, expect } from "vitest";
import {
  estimateGcodeDuration,
  findLastEstimateIndexForLine,
  formatEtaDuration,
} from "../../src/renderer/src/utils/estimateGcodeDuration";
import type { GcodeSegment } from "../../src/renderer/src/utils/gcodeParser";

const SEG = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  type: GcodeSegment["type"],
  lineNum: number,
  feed?: number,
): GcodeSegment => ({ from, to, type, lineNum, feed });

const PARAMS = {
  travelSpeedMmMin: 3000,
  drawSpeedMmMin: 3000,
  penDownDelayMs: 50,
  penUpDelayMs: 0,
};

describe("estimateGcodeDuration", () => {
  it("estimates a single cut segment", () => {
    const estimate = estimateGcodeDuration(
      [SEG({ x: 0, y: 0 }, { x: 3000, y: 0 }, "cut", 1, 3000)],
      PARAMS,
    );
    expect(estimate.totalMs).toBeCloseTo(60_000, 0);
    expect(estimate.cumulativeMs[0]).toBeCloseTo(60_000, 0);
    expect(estimate.lineNums[0]).toBe(1);
  });

  it("adds pen-down delay when a rapid is followed by a cut", () => {
    const estimate = estimateGcodeDuration(
      [
        SEG({ x: 0, y: 0 }, { x: 10, y: 0 }, "rapid", 1),
        SEG({ x: 10, y: 0 }, { x: 20, y: 0 }, "cut", 2, 3000),
      ],
      PARAMS,
    );
    const rapidMs = (10 / 3000) * 60_000;
    const cutMs = (10 / 3000) * 60_000;
    expect(estimate.totalMs).toBeCloseTo(
      rapidMs + PARAMS.penDownDelayMs + cutMs,
      0,
    );
  });

  it("uses segment feed when present", () => {
    const estimate = estimateGcodeDuration(
      [SEG({ x: 0, y: 0 }, { x: 1500, y: 0 }, "cut", 1, 1500)],
      PARAMS,
    );
    expect(estimate.totalMs).toBeCloseTo(60_000, 0);
  });

  it("falls back to draw speed when feed is missing", () => {
    const estimate = estimateGcodeDuration(
      [SEG({ x: 0, y: 0 }, { x: 1500, y: 0 }, "cut", 1)],
      { ...PARAMS, drawSpeedMmMin: 1500 },
    );
    expect(estimate.totalMs).toBeCloseTo(60_000, 0);
  });
});

describe("findLastEstimateIndexForLine", () => {
  const estimate = estimateGcodeDuration(
    [
      SEG({ x: 0, y: 0 }, { x: 10, y: 0 }, "cut", 1),
      SEG({ x: 10, y: 0 }, { x: 20, y: 0 }, "cut", 5),
      SEG({ x: 20, y: 0 }, { x: 30, y: 0 }, "cut", 10),
    ],
    PARAMS,
  );

  it("returns -1 when target line is before first segment", () => {
    expect(findLastEstimateIndexForLine(estimate, 0)).toBe(-1);
  });

  it("finds exact line match", () => {
    expect(findLastEstimateIndexForLine(estimate, 5)).toBe(1);
  });

  it("finds last segment with lineNum ≤ target", () => {
    expect(findLastEstimateIndexForLine(estimate, 7)).toBe(1);
    expect(findLastEstimateIndexForLine(estimate, 10)).toBe(2);
  });
});

describe("formatEtaDuration", () => {
  it("shows '<1m' for sub-minute durations", () => {
    expect(formatEtaDuration(0)).toBe("<1m");
    expect(formatEtaDuration(29_999)).toBe("<1m");
  });

  it("rounds to nearest minute", () => {
    expect(formatEtaDuration(90_000)).toBe("2m");
    expect(formatEtaDuration(60_000)).toBe("1m");
  });

  it("formats hours and minutes", () => {
    expect(formatEtaDuration(23 * 60 * 60_000 + 15 * 60_000)).toBe("23h 15m");
  });

  it("formats days with zero-padded hours and minutes", () => {
    expect(formatEtaDuration(26 * 60 * 60_000 + 22 * 60_000)).toBe(
      "1d 02h 22m",
    );
  });

  it("handles exactly 24 hours", () => {
    expect(formatEtaDuration(24 * 60 * 60_000)).toBe("1d 00h 00m");
  });
});
