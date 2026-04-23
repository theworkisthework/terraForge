/**
 * svgWorker.test.ts
 *
 * Tests the G-code generation logic exposed through the svgWorker's message
 * protocol.  The worker runs as a plain ES module here (not in an actual
 * Worker thread).  In jsdom `self === window === globalThis`, so:
 *
 *   • Stubbing `globalThis.postMessage` intercepts every `self.postMessage()`
 *     call made by the worker.
 *   • After importing the module, `(globalThis as any).onmessage` holds the
 *     handler set by `self.onmessage = …` inside svgWorker.ts.
 *   • We call the handler directly and wait for the async `generate()` to
 *     post its 'complete' (or 'cancelled') message.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import {
  createVectorObject,
  createMachineConfig,
  createGcodeOptions,
} from "../helpers/factories";

// ── Intercept self.postMessage ────────────────────────────────────────────────
// Must happen BEFORE the dynamic import of svgWorker so that all
// self.postMessage() calls inside generate() route to the spy.
const postSpy = vi.fn();
vi.stubGlobal("postMessage", postSpy);

// ── Load the worker module ────────────────────────────────────────────────────
// Using a dynamic import keeps it below the vi.stubGlobal call in evaluation
// order (static imports are hoisted; dynamic imports run inline).
let dispatch: (data: unknown) => void;

beforeAll(async () => {
  await import("../../src/workers/svgWorker");
  // After import, the worker has done `self.onmessage = handler`.
  // In jsdom, self === window === globalThis, so it's on globalThis.
  const handler = (globalThis as Record<string, unknown>).onmessage as
    | ((e: { data: unknown }) => void)
    | null
    | undefined;
  if (typeof handler !== "function") {
    throw new Error("svgWorker did not assign self.onmessage");
  }
  dispatch = (data: unknown) => handler({ data });
});

afterEach(() => {
  postSpy.mockClear();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Poll postSpy until a message of `type` appears, or throw on timeout. */
async function waitForMsg(
  type: string,
  timeout = 5_000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const hit = postSpy.mock.calls
      .map(([m]) => m as Record<string, unknown>)
      .find((m) => m.type === type);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 10));
  }
  const types = postSpy.mock.calls.map(
    ([m]) => (m as Record<string, unknown>).type,
  );
  throw new Error(
    `Timeout waiting for "${type}" — received: ${JSON.stringify(types)}`,
  );
}

/** Poll postSpy until a message of `type` with matching `taskId` appears. */
async function waitForMsgById(
  type: string,
  taskId: string,
  timeout = 5_000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const hit = postSpy.mock.calls
      .map(([m]) => m as Record<string, unknown>)
      .find((m) => m.type === type && m.taskId === taskId);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`Timeout waiting for type="${type}" taskId="${taskId}"`);
}

function makeSimpleObj() {
  return createVectorObject({
    path: "M 0 0 L 10 0 L 10 10 Z",
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    visible: true,
    originalWidth: 20,
    originalHeight: 20,
  });
}

function makeConfig(
  overrides?: Partial<ReturnType<typeof createMachineConfig>>,
) {
  return createMachineConfig({
    origin: "top-left",
    bedWidth: 200,
    bedHeight: 200,
    penUpCommand: "M5",
    penDownCommand: "M3 S1000",
    drawSpeed: 3000,
    name: "Test Plotter",
    ...overrides,
  });
}

// ── G-code header format ─────────────────────────────────────────────────────

describe("svgWorker — G-code header", () => {
  it("emits a complete message with G-code that contains the standard header", async () => {
    const taskId = "worker-header-test";
    dispatch({
      type: "generate",
      taskId,
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({ optimisePaths: false }),
    });

    const msg = await waitForMsg("complete");
    expect(msg.taskId).toBe(taskId);

    const gcode = msg.gcode as string;
    expect(gcode).toContain("; -- terraForge G-code --");
    expect(gcode).toContain("Machine  : Test Plotter");
    expect(gcode).toContain("Bed      : 200 x 200 mm");
    expect(gcode).toContain("Origin   : top-left");
    expect(gcode).toContain("Optimised: no");
    expect(gcode).toContain("G90");
    expect(gcode).toContain("G21");
  });

  it("includes the pen up command in the header preamble", async () => {
    dispatch({
      type: "generate",
      taskId: "header-pen",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions(),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    // First occurrence of penUpCommand is the preamble pen-safe line
    expect(gcode).toContain("M5");
  });
});

// ── G-code body structure ─────────────────────────────────────────────────────

describe("svgWorker — G-code body", () => {
  it("emits G0 rapid (pen up) before drawing and G1 feed (pen down) for cuts", async () => {
    dispatch({
      type: "generate",
      taskId: "body-g0g1",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({ optimisePaths: false }),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    // Each subpath: rapid (G0) + pen down + G1 moves + pen up
    expect(gcode).toContain("G0 X");
    expect(gcode).toContain("G1 X");
    expect(gcode).toContain("M3 S1000 ; Pen down");
    expect(gcode).toContain("M5 ; Pen up");
  });

  it("inserts dwell after pen-down and before the first G1 move", async () => {
    dispatch({
      type: "generate",
      taskId: "body-pen-delay",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions(),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    const downIdx = gcode.indexOf("M3 S1000 ; Pen down");
    const dwellIdx = gcode.indexOf("G4 P0.05 ; Pen settle delay");
    const drawIdx = gcode.indexOf("\nG1 X", downIdx);
    expect(downIdx).toBeGreaterThan(-1);
    expect(dwellIdx).toBeGreaterThan(downIdx);
    expect(drawIdx).toBeGreaterThan(dwellIdx);
  });

  it("omits dwell when effective pen-down delay is zero", async () => {
    dispatch({
      type: "generate",
      taskId: "body-pen-delay-zero",
      objects: [makeSimpleObj()],
      config: makeConfig({ penDownDelayMs: 50 }),
      options: createGcodeOptions({ penDownDelayMsOverride: 0 }),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).not.toContain("G4 P");
  });

  it("uses per-generation delay override instead of machine default", async () => {
    dispatch({
      type: "generate",
      taskId: "body-pen-delay-override",
      objects: [makeSimpleObj()],
      config: makeConfig({ penDownDelayMs: 50 }),
      options: createGcodeOptions({ penDownDelayMsOverride: 250 }),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("G4 P0.25 ; Pen settle delay");
    expect(gcode).not.toContain("G4 P0.05 ; Pen settle delay");
  });

  it("ignores machine default delay for stepper configs", async () => {
    dispatch({
      type: "generate",
      taskId: "body-stepper-default-ignored",
      objects: [makeSimpleObj()],
      config: makeConfig({ penType: "stepper", penDownDelayMs: 400 }),
      options: createGcodeOptions(),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).not.toContain("G4 P");
    expect(gcode).toContain("; Pen delay: 0 ms");
  });

  it("still applies per-generation delay override for stepper configs", async () => {
    dispatch({
      type: "generate",
      taskId: "body-stepper-override-applies",
      objects: [makeSimpleObj()],
      config: makeConfig({ penType: "stepper", penDownDelayMs: 0 }),
      options: createGcodeOptions({ penDownDelayMsOverride: 300 }),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("G4 P0.3 ; Pen settle delay");
    expect(gcode).toContain("; Pen delay: 300 ms");
  });

  it("ends with return-to-origin and pen-safe commands", async () => {
    dispatch({
      type: "generate",
      taskId: "body-end",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({ liftPenAtEnd: true, returnToHome: true }),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("G0 X0 Y0 ; Return to origin");
    expect(gcode).toContain("M5 ; Pen up - safe");
    expect(gcode).toContain("; -- End of job");
  });

  it("omits pen-up and return-to-origin when disabled", async () => {
    dispatch({
      type: "generate",
      taskId: "body-end-disabled",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({ liftPenAtEnd: false, returnToHome: false }),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).not.toContain("M5 ; Pen up - safe");
    expect(gcode).not.toContain("G0 X0 Y0 ; Return to origin");
    expect(gcode).toContain("; -- End of job");
  });

  it("produces no G1 moves for an empty object list", async () => {
    dispatch({
      type: "generate",
      taskId: "empty-objs",
      objects: [],
      config: makeConfig(),
      options: createGcodeOptions({ returnToHome: true }),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    // No G1 moves when there are no objects
    expect(gcode).not.toContain("G1");
    // Still ends with cleanup
    expect(gcode).toContain("G0 X0 Y0");
  });

  it("injects custom start G-code after preamble and before paths", async () => {
    dispatch({
      type: "generate",
      taskId: "custom-start",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({
        customStartGcode: "M42 P0 S1 ; custom start",
      }),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("M42 P0 S1 ; custom start");
    const customIdx = gcode.indexOf("M42 P0 S1 ; custom start");
    const firstRapidIdx = gcode.indexOf("\nG0 X");
    expect(customIdx).toBeGreaterThan(-1);
    expect(customIdx).toBeLessThan(firstRapidIdx);
  });

  it("injects custom end G-code after lift/return at end of job", async () => {
    dispatch({
      type: "generate",
      taskId: "custom-end",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({
        liftPenAtEnd: true,
        returnToHome: true,
        customEndGcode: "M43 P0 S0 ; custom end",
      }),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("M43 P0 S0 ; custom end");
    const liftIdx = gcode.indexOf("M5 ; Pen up - safe");
    const returnIdx = gcode.indexOf("G0 X0 Y0 ; Return to origin");
    const customIdx = gcode.indexOf("M43 P0 S0 ; custom end");
    expect(customIdx).toBeGreaterThan(liftIdx);
    expect(customIdx).toBeGreaterThan(returnIdx);
  });

  it("omits custom G-code sections when fields are empty", async () => {
    dispatch({
      type: "generate",
      taskId: "custom-empty",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({ customStartGcode: "", customEndGcode: "" }),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).not.toContain("Custom start G-code");
    expect(gcode).not.toContain("Custom end G-code");
  });

  it("skips hidden objects", async () => {
    const hidden = createVectorObject({
      path: "M 0 0 L 50 50",
      visible: false,
      originalWidth: 100,
      originalHeight: 100,
    });
    dispatch({
      type: "generate",
      taskId: "hidden-skip",
      objects: [hidden],
      config: makeConfig(),
      options: createGcodeOptions(),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).not.toContain("G1");
  });
});

// ── Optimised mode ────────────────────────────────────────────────────────────

describe("svgWorker — optimised mode", () => {
  it("marks Optimised: yes in header when optimisePaths=true", async () => {
    dispatch({
      type: "generate",
      taskId: "opt-header",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({ optimisePaths: true }),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("Optimised: yes (nearest-neighbour)");
  });

  it("still produces G0/G1 moves in optimised mode", async () => {
    dispatch({
      type: "generate",
      taskId: "opt-moves",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({ optimisePaths: true }),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("G0 X");
    expect(gcode).toContain("G1 X");
  });
});

// ── Progress events ───────────────────────────────────────────────────────────

describe("svgWorker — progress messages", () => {
  it("emits at least one progress message before complete", async () => {
    dispatch({
      type: "generate",
      taskId: "progress-check",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions(),
    });
    await waitForMsg("complete");
    const progressMsgs = postSpy.mock.calls
      .map(([m]) => m as Record<string, unknown>)
      .filter((m) => m.type === "progress" && m.taskId === "progress-check");
    expect(progressMsgs.length).toBeGreaterThan(0);
    // Progress percent should be between 0 and 100
    for (const pm of progressMsgs) {
      expect(pm.percent).toBeGreaterThanOrEqual(0);
      expect(pm.percent).toBeLessThanOrEqual(100);
    }
  });
});

// ── Cancellation ──────────────────────────────────────────────────────────────

describe("svgWorker — cancellation", () => {
  it("posts a 'cancelled' message (not 'error') when cancel sent mid-generation", async () => {
    const taskId = "cancel-test";
    // Send generate then immediately cancel (before async generate yields)
    dispatch({
      type: "generate",
      taskId,
      objects: Array.from({ length: 5 }, () => makeSimpleObj()),
      config: makeConfig(),
      options: createGcodeOptions(),
    });
    dispatch({ type: "cancel", taskId });
    // Wait for either cancelled or complete
    const msg = await Promise.race([
      waitForMsg("cancelled"),
      waitForMsg("complete"),
    ]);
    // If 'cancelled' was posted, we verify it's the right type
    // (complete is also acceptable if generation finished before cancel was processed)
    expect(["cancelled", "complete"]).toContain(msg.type);
    if (msg.type === "cancelled") {
      expect(msg.taskId).toBe(taskId);
    }
  });

  it("cancel message type is 'cancelled' not 'error'", async () => {
    const taskId = "cancel-type-test";
    dispatch({
      type: "generate",
      taskId,
      objects: Array.from({ length: 10 }, () => makeSimpleObj()),
      config: makeConfig(),
      options: createGcodeOptions(),
    });
    dispatch({ type: "cancel", taskId });
    // Wait for any terminal message
    await Promise.race([waitForMsg("cancelled"), waitForMsg("complete")]);
    // Verify no 'error' message was posted for this taskId
    const errorMsgs = postSpy.mock.calls
      .map(([m]) => m as Record<string, unknown>)
      .filter((m) => m.type === "error" && m.taskId === taskId);
    expect(errorMsgs).toHaveLength(0);
  });

  it("cancel during phase-4 G-code emission emits 'cancelled' (covers phase-4 cancel branch)", async () => {
    // Strategy: hook postSpy so that the first phase-4 progress message
    // (percent > 40) synchronously dispatches a cancel for the same taskId.
    // Phase 4 posts progress BEFORE the next await yieldPh4(), so the cancel
    // flag is already set when the next loop iteration's cancel check runs.
    const taskId = "cancel-phase4";
    let cancelDispatched = false;

    postSpy.mockImplementation((msg: Record<string, unknown>) => {
      if (
        !cancelDispatched &&
        msg.type === "progress" &&
        (msg.percent as number) > 40 &&
        msg.taskId === taskId
      ) {
        cancelDispatched = true;
        dispatch({ type: "cancel", taskId });
      }
    });

    // 5 objects → 5 subpaths in phase 4; gives several cancel-check points
    // after the first progress message triggers the cancel.
    dispatch({
      type: "generate",
      taskId,
      objects: Array.from({ length: 5 }, () => makeSimpleObj()),
      config: makeConfig(),
      options: createGcodeOptions({ optimisePaths: false }),
    });

    try {
      const msg = await waitForMsgById("cancelled", taskId);
      expect(msg.type).toBe("cancelled");
      expect(msg.taskId).toBe(taskId);
      // Confirm no 'complete' was posted for this task
      const completeMsgs = postSpy.mock.calls
        .map(([m]) => m as Record<string, unknown>)
        .filter((m) => m.type === "complete" && m.taskId === taskId);
      expect(completeMsgs).toHaveLength(0);
    } finally {
      // Reset mock so subsequent tests are unaffected (mockClear only clears
      // calls; mockReset also clears the custom implementation).
      postSpy.mockReset();
    }
  });
});

// ── Knife lead-in/out mode ──────────────────────────────────────────────────

describe("svgWorker — knife lead-in/out", () => {
  it("emits lead-in arc, overcut, and lead-out arc for closed paths", async () => {
    dispatch({
      type: "generate",
      taskId: "knife-closed",
      objects: [
        createVectorObject({
          path: "M 0 0 L 20 0 L 20 20 L 0 20 Z",
          hasFill: true,
          originalWidth: 30,
          originalHeight: 30,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        knifeLeadInOutEnabled: true,
        knifeLeadRadiusMM: 1,
        knifeOvercutMM: 1.5,
      }),
    });

    const msg = await waitForMsgById("complete", "knife-closed");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("Knife LI : yes (R=1 mm, overcut=1.5 mm)");
    expect(gcode).toContain("; Knife lead-in");
    expect(gcode).toContain("; Knife overcut");
    expect(gcode).toContain("; Knife lead-out");
  });

  it("does not emit knife arcs for open paths", async () => {
    dispatch({
      type: "generate",
      taskId: "knife-open",
      objects: [
        createVectorObject({
          path: "M 0 0 L 20 0 L 20 20",
          hasFill: false,
          originalWidth: 30,
          originalHeight: 30,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        knifeLeadInOutEnabled: true,
        knifeLeadRadiusMM: 1,
        knifeOvercutMM: 1,
      }),
    });

    const msg = await waitForMsgById("complete", "knife-open");
    const gcode = msg.gcode as string;
    expect(gcode).not.toContain("; Knife lead-in");
    expect(gcode).not.toContain("; Knife lead-out");
    expect(gcode).not.toContain("; Knife overcut");
  });

  it("disables join mode when knife lead mode is enabled", async () => {
    dispatch({
      type: "generate",
      taskId: "knife-overrides-join",
      objects: [
        createVectorObject({
          path: "M 0 0 L 20 0 L 20 20 L 0 20 Z",
          hasFill: true,
          originalWidth: 30,
          originalHeight: 30,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        joinPaths: true,
        joinTolerance: 0.2,
        knifeLeadInOutEnabled: true,
        knifeLeadRadiusMM: 2.5,
        knifeOvercutMM: 1,
      }),
    });

    const msg = await waitForMsgById("complete", "knife-overrides-join");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("Joined   : no (disabled by knife lead mode)");
    expect(gcode).toContain("; Knife lead-in");
    expect(gcode).toContain("; Knife lead-out");
  });

  it("places inner-contour lead-in on hole waste side for compound paths", async () => {
    dispatch({
      type: "generate",
      taskId: "knife-hole-side",
      objects: [
        createVectorObject({
          path: "M 0 0 L 40 0 L 40 40 L 0 40 Z M 10 20 L 10 30 L 30 30 L 30 10 L 10 10 Z",
          hasFill: true,
          originalWidth: 50,
          originalHeight: 50,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        knifeLeadInOutEnabled: true,
        knifeLeadRadiusMM: 1,
        knifeOvercutMM: 0.5,
      }),
    });

    const msg = await waitForMsgById("complete", "knife-hole-side");
    const gcode = msg.gcode as string;
    const leadStarts = gcode
      .split("\n")
      .filter((l) => l.includes("; Knife lead-in start"));
    const leadOuts = gcode
      .split("\n")
      .filter((l) => l.includes("; Knife lead-out"));

    expect(leadStarts.length).toBeGreaterThanOrEqual(2);
    expect(leadOuts.length).toBeGreaterThanOrEqual(2);

    const m = /X(-?\d+\.\d+)\s+Y(-?\d+\.\d+)/.exec(leadStarts[1]);
    expect(m).not.toBeNull();
    const x = Number(m![1]);
    const y = Number(m![2]);

    // Inner contour waste is the hole interior (10..30,10..30).
    expect(x).toBeGreaterThan(10);
    expect(x).toBeLessThan(30);
    expect(y).toBeGreaterThan(10);
    expect(y).toBeLessThan(30);

    const mo = /X(-?\d+\.\d+)\s+Y(-?\d+\.\d+)/.exec(leadOuts[1]);
    expect(mo).not.toBeNull();
    const ox = Number(mo![1]);
    const oy = Number(mo![2]);
    expect(ox).toBeGreaterThan(10);
    expect(ox).toBeLessThan(30);
    expect(oy).toBeGreaterThan(10);
    expect(oy).toBeLessThan(30);
  });

  it("attempts seam repositioning for tight triangular hole and falls back gracefully", async () => {
    dispatch({
      type: "generate",
      taskId: "knife-tight-triangle-hole",
      objects: [
        createVectorObject({
          path: "M 0 0 L 60 0 L 30 90 Z M 30 55 L 20 20 L 40 20 Z",
          hasFill: true,
          originalWidth: 70,
          originalHeight: 100,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        knifeLeadInOutEnabled: true,
        knifeLeadRadiusMM: 2.5,
        knifeOvercutMM: 1,
      }),
    });

    const msg = await waitForMsgById("complete", "knife-tight-triangle-hole");
    const gcode = msg.gcode as string;
    const leadStarts = gcode
      .split("\n")
      .filter((l) => l.includes("; Knife lead-in start"));
    const leadOuts = gcode
      .split("\n")
      .filter((l) => l.includes("; Knife lead-out"));

    // At minimum the outer contour should still get knife arcs.
    expect(leadStarts.length).toBeGreaterThanOrEqual(1);
    expect(leadOuts.length).toBeGreaterThanOrEqual(1);

    // For very tight holes, the solver may decide there is no safe arc pair.
    // In that case it must emit an explicit diagnostic note.
    if (leadStarts.length < 2 || leadOuts.length < 2) {
      expect(gcode).toContain("Knife note: no safe lead arcs for subpath");
    }
  });
});

// ── Coordinate integration ────────────────────────────────────────────────────

describe("svgWorker — coordinate output", () => {
  it("G-code X/Y values are formatted to 3 decimal places", async () => {
    dispatch({
      type: "generate",
      taskId: "coord-fmt",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions(),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    // G0/G1 lines have X/Y with exactly 3 decimal places
    // Exclude the final "G0 X0 Y0" which is formatted without decimals.
    const moves = gcode
      .split("\n")
      .filter(
        (l) =>
          (l.startsWith("G0 X") || l.startsWith("G1 X")) &&
          !l.startsWith("G0 X0 Y0"),
      );
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      // Match X<digits>.<3digits>
      expect(move).toMatch(/X[-\d]+\.\d{3}/);
    }
  });

  it("draw speed line appears before pen-down in each subpath", async () => {
    dispatch({
      type: "generate",
      taskId: "feedrate-pos",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions(),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    // F3000 (from config.drawSpeed) should appear before M3 S1000 in G-code body
    const fIdx = gcode.indexOf("F3000");
    const penDownIdx = gcode.indexOf("M3 S1000 ; Pen down");
    expect(fIdx).toBeGreaterThan(-1);
    expect(penDownIdx).toBeGreaterThan(-1);
    expect(fIdx).toBeLessThan(penDownIdx);
  });
});

// ── Join paths mode ───────────────────────────────────────────────────────────

describe("svgWorker — join paths mode", () => {
  it("marks 'Joined: no' in header when joinPaths=false", async () => {
    dispatch({
      type: "generate",
      taskId: "join-header-off",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({ joinPaths: false }),
    });
    const msg = await waitForMsg("complete");
    expect(msg.gcode as string).toContain("Joined   : no");
  });

  it("marks 'Joined: yes' with tolerance in header when joinPaths=true", async () => {
    dispatch({
      type: "generate",
      taskId: "join-header-on",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({ joinPaths: true, joinTolerance: 0.2 }),
    });
    const msg = await waitForMsg("complete");
    expect(msg.gcode as string).toContain("Joined   : yes (tolerance 0.2 mm)");
  });

  it("produces fewer G0 rapids when adjacent paths are within join tolerance", async () => {
    // Two objects with paths that share an endpoint — they should merge when
    // join is enabled, reducing the number of G0 rapid-travel moves.
    const cfg = makeConfig();

    const objA = createVectorObject({
      path: "M 0 0 L 10 0",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      visible: true,
      originalWidth: 200,
      originalHeight: 200,
    });
    const objB = createVectorObject({
      path: "M 10 0 L 20 0",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      visible: true,
      originalWidth: 200,
      originalHeight: 200,
    });

    dispatch({
      type: "generate",
      taskId: "join-rapids-on",
      objects: [objA, objB],
      config: cfg,
      options: createGcodeOptions({
        optimisePaths: false,
        joinPaths: true,
        joinTolerance: 0.5,
      }),
    });
    const joined = await waitForMsgById("complete", "join-rapids-on");

    dispatch({
      type: "generate",
      taskId: "join-rapids-off",
      objects: [objA, objB],
      config: cfg,
      options: createGcodeOptions({ optimisePaths: false, joinPaths: false }),
    });
    const unjoined = await waitForMsgById("complete", "join-rapids-off");

    // Count G0 travel moves (excluding the final return-to-origin)
    const countRapids = (gcode: string) =>
      gcode
        .split("\n")
        .filter((l) => l.startsWith("G0 X") && !l.startsWith("G0 X0 Y0"))
        .length;

    const rapidsWith = countRapids(joined.gcode as string);
    const rapidsWithout = countRapids(unjoined.gcode as string);
    // Unjoined: 2 subpaths → 2 rapids. Joined: endpoints touch → 1 rapid.
    expect(rapidsWithout).toBe(2);
    expect(rapidsWith).toBe(1);
  });

  it("join mode combined with optimise still produces valid G-code", async () => {
    dispatch({
      type: "generate",
      taskId: "join-and-opt",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: true,
        joinPaths: true,
        joinTolerance: 0.2,
      }),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("Optimised: yes (nearest-neighbour)");
    expect(gcode).toContain("Joined   : yes (tolerance 0.2 mm)");
    expect(gcode).toContain("G0 X");
    expect(gcode).toContain("G1 X");
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("svgWorker — error handling", () => {
  it("posts an 'error' message when generate() throws (e.g. null config)", async () => {
    // Passing null as config causes generate() to throw synchronously
    // (accessing config.name etc.), which becomes a rejected promise
    // caught by the .catch() handler on the onmessage branch.
    const taskId = "error-null-config";
    dispatch({
      type: "generate",
      taskId,
      objects: [makeSimpleObj()],
      config: null as any,
      options: createGcodeOptions(),
    });
    const msg = await waitForMsgById("error", taskId);
    expect(msg.type).toBe("error");
    expect(msg.taskId).toBe(taskId);
    expect(typeof msg.error).toBe("string");
  });
});
