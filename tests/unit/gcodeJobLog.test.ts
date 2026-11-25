import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createJobLog,
  formatDuration,
  formatProgress,
  type JobLog,
} from "../../src/workers/generation/jobLog";
import {
  checkConserved,
  checkSortedOnce,
} from "../../src/workers/generation/process";
import type { Subpath } from "../../src/workers/gcodeEngine/stages/pathOptimization";

afterEach(() => vi.restoreAllMocks());

describe("formatDuration", () => {
  it.each([
    [250, "250 ms"],
    [12_400, "12s"],
    [367_000, "6m 7s"],
    [2 * 3_600_000 + 5 * 60_000, "2h 5m"],
  ])("%d ms -> %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("formatProgress", () => {
  it("shows count, percentage, rate and time left", () => {
    expect(formatProgress(120_000, 1_000_000, 50_000)).toBe(
      "120,000/1,000,000 (12.0%) · 2,400/s · ETA 6m 7s",
    );
  });

  it("leaves out the ETA when finished or not yet moving", () => {
    expect(formatProgress(10, 10, 1_000)).toBe("10/10 (100.0%) · 10/s");
    expect(formatProgress(0, 10, 0)).toBe("0/10 (0.0%) · 0/s");
  });
});

describe("createJobLog", () => {
  it("prefixes messages with the task and throttles stage progress", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    let t = 0;
    const log = createJobLog("abcdef1234567890", () => t);
    const stage = log.stage("sort", 100);
    t = 1_000;
    stage.tick(10); // too soon
    t = 6_000;
    stage.tick(50);
    t = 7_000;
    stage.tick(60); // too soon again
    stage.end({ reversed: 3 });

    expect(info.mock.calls.map((c) => c[0])).toEqual([
      "[gcode abcdef12] sort: started (100 items)",
      "[gcode abcdef12] sort: 50/100 (50.0%) · 8/s · ETA 6s",
      "[gcode abcdef12] sort: done in 7s",
    ]);
    expect(info.mock.calls[2][1]).toEqual({ reversed: 3 });
    expect(log.elapsed()).toBe("7s");
  });
});

describe("pass checks", () => {
  const sp = (...xs: number[]): Subpath => xs.map((x) => ({ x, y: 0 }));
  const fakeLog = () => {
    const error = vi.fn();
    return {
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error,
        stage: vi.fn(),
        elapsed: vi.fn(),
      } as JobLog,
      error,
    };
  };

  it("accepts a reorder that keeps every subpath and point", () => {
    const { log, error } = fakeLog();
    const a = sp(0, 1);
    const b = sp(2, 3, 4);
    expect(
      checkConserved("sort", [a, b], [b, [...a].reverse()], log, true),
    ).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });

  it("logs an error when a pass drops a subpath", () => {
    const { log, error } = fakeLog();
    expect(
      checkConserved("sort", [sp(0, 1), sp(2, 3)], [sp(0, 1)], log, true),
    ).toBe(false);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("paths may have been lost"),
      expect.objectContaining({
        subpathsBefore: 2,
        subpathsAfter: 1,
        pointsBefore: 4,
        pointsAfter: 2,
      }),
    );
  });

  it("lets a join merge subpaths as long as no points go missing", () => {
    const { log, error } = fakeLog();
    expect(
      checkConserved(
        "join",
        [sp(0, 1), sp(1, 2)],
        [sp(0, 1, 1, 2)],
        log,
        false,
      ),
    ).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });

  it("logs a subpath the sort placed twice", () => {
    const { log, error } = fakeLog();
    const a = sp(0, 1);
    const b = sp(2, 3);
    checkSortedOnce([a, b], [a, a], log);
    expect(error).toHaveBeenCalledWith(
      "sort: 1 subpath(s) placed more than once",
    );
  });
});
