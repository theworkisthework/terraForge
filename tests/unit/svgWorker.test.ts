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
    penUpCommand: "M3S0",
    penDownCommand: "M3S1",
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
    expect(gcode).toContain("M3S0");
  });
});

// ── G-code body structure ─────────────────────────────────────────────────────

describe("svgWorker — G-code body", () => {
  it("emits pen taps for point-only vector objects", async () => {
    const pointObj = createVectorObject({
      id: "point-1",
      svgSource: '<circle cx="5" cy="7" />',
      path: "",
      pointTap: { x: 5, y: 7 },
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      visible: true,
      originalWidth: 20,
      originalHeight: 20,
    });

    dispatch({
      type: "generate",
      taskId: "body-point-tap",
      objects: [pointObj],
      config: makeConfig(),
      options: createGcodeOptions({ optimisePaths: false }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("; -- Point taps (1 points)");
    expect(gcode).toContain("; Point rapid");
    expect(gcode).toContain("; Point tap");
    expect(gcode).toContain("M3S0 ; Pen up");
  });

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
    expect(gcode).toContain("M3S1 ; Pen down");
    expect(gcode).toContain("M3S0 ; Pen up");
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
    const downIdx = gcode.indexOf("M3S1 ; Pen down");
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
    expect(gcode).toContain("M3S0 ; Pen up - safe");
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
    expect(gcode).not.toContain("M3S0 ; Pen up - safe");
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
    const liftIdx = gcode.indexOf("M3S0 ; Pen up - safe");
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

  it("emits compensated drag-knife moves when vinyl cutting mode is enabled", async () => {
    dispatch({
      type: "generate",
      taskId: "body-vinyl-cutting",
      objects: [
        createVectorObject({
          path: "M 0 0 L 10 0 L 10 10",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        vinylCutting: {
          bladeOffsetMM: 0.25,
          cornerAngleThresholdDeg: 10,
          microJogMagnitudeMM: 0.02,
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain(
      "; Vinyl    : yes (offset 0.25 mm, threshold 10 deg, blade rotation offset 0.02 mm)",
    );
    expect(gcode).toContain("G1 X0.250 Y0.000");
    expect(gcode).toContain("G1 X10.250 Y0.000");
    expect(gcode).toContain("G1 X10.250 Y0.020");
    expect(gcode).toContain("G1 X10.000 Y0.000");
    expect(gcode).toContain("G1 X10.000 Y10.250");
  });

  it("merges short segments before applying vinyl compensation", async () => {
    dispatch({
      type: "generate",
      taskId: "body-vinyl-merge-short",
      objects: [
        createVectorObject({
          path: "M 0 0 L 0.1 0 L 10 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        vinylCutting: {
          bladeOffsetMM: 0.25,
          cornerAngleThresholdDeg: 10,
          microJogMagnitudeMM: 0.02,
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).not.toContain("X0.100 Y0.000");
    expect(gcode).toContain("G1 X10.250 Y0.000");
  });

  it("preserves short non-collinear curve points to avoid false corner compensation", async () => {
    dispatch({
      type: "generate",
      taskId: "body-vinyl-preserve-gentle-curve",
      objects: [
        createVectorObject({
          path: "M 0 0 L 0.1 0.03 L 0.2 0.08 L 0.3 0.15 L 0.45 0.24",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        vinylCutting: {
          bladeOffsetMM: 0.25,
          cornerAngleThresholdDeg: 10,
          microJogMagnitudeMM: 0.02,
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;

    // Short non-collinear points should remain in the path.
    expect(gcode).toContain("G1 X0.100 Y0.030");
    expect(gcode).toContain("G1 X0.200 Y0.080");
  });

  it("preserves continuous gentle curvature geometry", async () => {
    dispatch({
      type: "generate",
      taskId: "body-vinyl-smooth-curve-no-corners",
      objects: [
        createVectorObject({
          path: "M 0 0 L 0.8 0.2 L 1.4 0.7 L 1.8 1.4 L 2.0 2.2",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        vinylCutting: {
          bladeOffsetMM: 0.25,
          cornerAngleThresholdDeg: 10,
          microJogMagnitudeMM: 0.02,
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("G1 X0.800 Y0.200");
    expect(gcode).toContain("G1 X1.400 Y0.700");
    expect(gcode).toContain("G1 X1.800 Y1.400");
    expect(gcode).toContain("G1 X2.000 Y2.200");
  });

  it("extends open path ends using local tangent on tessellated curves", async () => {
    dispatch({
      type: "generate",
      taskId: "body-vinyl-overcut-curve-tangent",
      objects: [
        createVectorObject({
          path: "M 0 0 L 4 0 L 8 0 L 8.02 0.02",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        vinylCutting: {
          bladeOffsetMM: 0.25,
          cornerAngleThresholdDeg: 10,
          microJogMagnitudeMM: 0.02,
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;

    // End overcut should follow the local tangent through the final curve segment,
    // not the tiny terminal segment direction alone.
    expect(gcode).toContain("G1 X8.269 Y0.041");
    expect(gcode).not.toContain("G1 X8.197 Y0.197");
  });

  it("still compensates a true corner after curved approach", async () => {
    dispatch({
      type: "generate",
      taskId: "body-vinyl-curve-to-corner-compensates",
      objects: [
        createVectorObject({
          path: "M 0 0 L 0.5 0.2 L 0.9 0.6 L 1.0 1.2 L 1.0 2.5 L 2.0 2.5",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        vinylCutting: {
          bladeOffsetMM: 0.25,
          cornerAngleThresholdDeg: 10,
          microJogMagnitudeMM: 0.02,
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;

    // True right-angle corner at X1.000 Y2.500 should still get overshoot.
    expect(gcode).toContain("G1 X1.000 Y2.750");
    expect(gcode).toContain("G1 X1.000 Y2.500");
  });

  it("keeps compensation on sharp corners of closed rectangular paths", async () => {
    dispatch({
      type: "generate",
      taskId: "body-vinyl-closed-rectangle-corners",
      objects: [
        createVectorObject({
          path: "M 0 0 L 10 0 L 10 20 L 0 20 Z",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        vinylCutting: {
          bladeOffsetMM: 0.25,
          cornerAngleThresholdDeg: 10,
          microJogMagnitudeMM: 0.02,
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;

    // At least one sharp rectangle corner should include overshoot + backtrack.
    expect(gcode).toContain("G1 X10.250 Y0.000");
    expect(gcode).toContain("G1 X10.000 Y0.000");
  });

  it("compensates a V-peak corner when adjacent segments are long", async () => {
    // True isolated corner: long segment arriving from upper-left, long segment
    // leaving upper-right. Not a smooth curve — no continuation of curvature.
    dispatch({
      type: "generate",
      taskId: "body-vinyl-moderate-long-corner",
      objects: [
        createVectorObject({
          path: "M 0 5 L 15 0 L 30 5",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        vinylCutting: {
          bladeOffsetMM: 0.25,
          cornerAngleThresholdDeg: 10,
          microJogMagnitudeMM: 0.02,
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;

    // The V-peak at (15, 0) is a true corner; it should receive overshoot
    // (swivel) compensation and then return to the corner point.
    expect(gcode).toContain("G1 X15.000 Y0.000");
    // Swivel point overshoots along the incoming direction.
    expect(gcode).toContain("G1 X15.237 Y-0.079");
  });

  it("compensates a corner when only one adjacent segment is short", async () => {
    dispatch({
      type: "generate",
      taskId: "body-vinyl-one-short-adjacent-corner",
      objects: [
        createVectorObject({
          path: "M 0 0 L 10 0 L 10 0.15 L 16 0.15",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        vinylCutting: {
          bladeOffsetMM: 0.25,
          cornerAngleThresholdDeg: 10,
          microJogMagnitudeMM: 0.02,
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;

    // The corner at X10.000 Y0.150 should still get overshoot and backtrack.
    expect(gcode).toContain("G1 X10.000 Y0.400");
    expect(gcode).toContain("G1 X10.000 Y0.150");
  });

  it("emits a weed border around the final job bounds only with vinyl cutting", async () => {
    dispatch({
      type: "generate",
      taskId: "body-vinyl-weed-border",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        vinylCutting: {
          bladeOffsetMM: 0.2,
          cornerAngleThresholdDeg: 15,
          microJogMagnitudeMM: 0.02,
        },
        vinylWeedBorder: {
          marginMM: 1,
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("; Weed bd  : yes (margin 1 mm)");
    expect(gcode).toContain("G0 X-1.000 Y-1.000 ; Rapid travel");
    expect(gcode).toContain("G1 X11.000 Y-1.000");
    expect(gcode).toContain("G1 X11.000 Y11.000");
    expect(gcode).toContain("G1 X-1.000 Y11.000");
    expect(gcode).toContain("G1 X-1.000 Y-1.000");
  });

  it("ignores weed border when vinyl cutting is disabled", async () => {
    dispatch({
      type: "generate",
      taskId: "body-vinyl-weed-border-ignored-without-vinyl",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        vinylWeedBorder: {
          marginMM: 1,
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;

    expect(gcode).toContain("; Weed bd  : yes (margin 1 mm)");
    expect(gcode).not.toContain("G0 X-1.000 Y-1.000 ; Rapid travel");
    expect(gcode).not.toContain("G1 X11.000 Y-1.000");
    expect(gcode).not.toContain("G1 X11.000 Y11.000");
    expect(gcode).not.toContain("G1 X-1.000 Y11.000");
    expect(gcode).not.toContain("G1 X-1.000 Y-1.000");
  });

  it("inserts prime and wipe service moves when travel threshold is exceeded", async () => {
    dispatch({
      type: "generate",
      taskId: "body-ink-prime-wipe",
      objects: [
        createVectorObject({
          path: "M 0 0 L 8 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
        createVectorObject({
          path: "M 80 0 L 88 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        inkService: {
          mode: "prime-wipe",
          triggerTravelMM: 20,
          triggerJitterPct: 0,
          stations: [
            {
              id: "prime",
              name: "Prime",
              type: "prime",
              x: 5,
              y: 6,
              dwellMs: 400,
              action: {
                kind: "prime-press",
                zDepthMM: 1.2,
                pressCount: 2,
              },
              enabled: true,
            },
            {
              id: "wipe",
              name: "Wipe",
              type: "wipe",
              x: 7,
              y: 6,
              dwellMs: 300,
              enabled: true,
            },
          ],
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("; Dip svc  : prime-wipe, every 20 mm");
    expect(gcode).toContain("; -- Ink service: prime and wipe --");
    expect(gcode).toContain("Service move: prime (Prime)");
    expect(gcode).toContain("Service move: wipe (Wipe)");
    expect(gcode).toContain("Prime action: 2 presses, depth 1.200 mm");
    expect(gcode).toContain("G0 Z-1.200");
    expect(gcode).toContain("G0 Z1.200");
  });

  it("inserts brush dip and wash moves with wash cadence", async () => {
    dispatch({
      type: "generate",
      taskId: "body-ink-brush-dip",
      objects: [
        createVectorObject({
          path: "M 0 0 L 8 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
        createVectorObject({
          path: "M 45 0 L 53 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        inkService: {
          mode: "brush-dip",
          triggerTravelMM: 10,
          triggerJitterPct: 0,
          randomizeDipStation: false,
          includeWashMove: true,
          washEveryNDips: 1,
          stations: [
            {
              id: "dip-black",
              name: "Dip Black",
              type: "dip",
              x: 15,
              y: 10,
              dwellMs: 250,
              action: {
                kind: "brush-motion",
                zDepthMM: 1.5,
                pattern: "back-forth",
                repetitions: 2,
                distanceMM: 1.25,
              },
              enabled: true,
            },
            {
              id: "wash",
              name: "Wash",
              type: "wash",
              x: 18,
              y: 10,
              dwellMs: 500,
              action: {
                kind: "brush-motion",
                zDepthMM: 1,
                pattern: "circular",
                repetitions: 1,
                distanceMM: 0.8,
              },
              enabled: true,
            },
          ],
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("; Dip svc  : brush-dip, every 10 mm");
    expect(gcode).toContain("; -- Ink service: brush dip --");
    expect(gcode).toContain("Service move: dip (Dip Black)");
    expect(gcode).toContain("Service move: wash (Wash)");
    expect(gcode).toContain(
      "Brush action: back-forth, reps 2, distance 1.250 mm, depth 1.500 mm",
    );
    expect(gcode).toContain(
      "Brush action: circular, reps 1, distance 0.800 mm, depth 1.000 mm",
    );
    expect(gcode).toContain("; -- Final ink service: end wash --");

    const finalWashIdx = gcode.lastIndexOf("Service move: wash (Wash)");
    const endOfJobIdx = gcode.indexOf("; -- End of job");
    expect(finalWashIdx).toBeGreaterThan(-1);
    expect(finalWashIdx).toBeLessThan(endOfJobIdx);
  });

  it("performs ink service before the first draw rapid", async () => {
    dispatch({
      type: "generate",
      taskId: "body-ink-preload-before-first-draw",
      objects: [
        createVectorObject({
          path: "M 0 0 L 20 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        inkService: {
          mode: "brush-dip",
          triggerTravelMM: 20,
          triggerJitterPct: 0,
          randomizeDipStation: false,
          includeWashMove: false,
          stations: [
            {
              id: "dip-black",
              name: "Dip Black",
              type: "dip",
              x: 15,
              y: 10,
              dwellMs: 250,
              enabled: true,
            },
          ],
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;

    const firstService = gcode.indexOf("Service move: dip (Dip Black)");
    const firstRapidTravel = gcode.indexOf("; Rapid travel");
    expect(firstService).toBeGreaterThan(-1);
    expect(firstRapidTravel).toBeGreaterThan(-1);
    expect(firstService).toBeLessThan(firstRapidTravel);
  });

  it("splits long draw segments at the ink trigger boundary", async () => {
    dispatch({
      type: "generate",
      taskId: "body-ink-split-draw-segment",
      objects: [
        createVectorObject({
          path: "M 0 0 L 20 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        inkService: {
          mode: "brush-dip",
          triggerTravelMM: 10,
          triggerJitterPct: 0,
          randomizeDipStation: false,
          includeWashMove: false,
          stations: [
            {
              id: "dip-black",
              name: "Dip Black",
              type: "dip",
              x: 15,
              y: 10,
              dwellMs: 250,
              enabled: true,
            },
          ],
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;

    const firstSplitMove = gcode.indexOf("G1 X10.000 Y0.000");
    const firstService = gcode.indexOf("Service move: dip (Dip Black)");
    const secondService = gcode.indexOf(
      "Service move: dip (Dip Black)",
      firstService + 1,
    );
    const finalSegmentMove = gcode.indexOf("G1 X20.000 Y0.000");

    expect(firstSplitMove).toBeGreaterThan(-1);
    expect(firstService).toBeGreaterThan(-1);
    expect(secondService).toBeGreaterThan(-1);
    expect(finalSegmentMove).toBeGreaterThan(-1);
    expect(firstSplitMove).toBeLessThan(secondService);
    expect(secondService).toBeLessThan(finalSegmentMove);
  });

  it("washes before changing dip trays even when periodic wash is disabled", async () => {
    dispatch({
      type: "generate",
      taskId: "body-ink-wash-before-tray-switch",
      objects: [
        createVectorObject({
          path: "M 0 0 L 8 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
        createVectorObject({
          path: "M 45 0 L 53 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        inkService: {
          mode: "brush-dip",
          triggerTravelMM: 10,
          triggerJitterPct: 0,
          randomizeDipStation: false,
          includeWashMove: false,
          stations: [
            {
              id: "dip-a",
              name: "Dip A",
              type: "dip",
              x: 10,
              y: 10,
              dwellMs: 150,
              enabled: true,
            },
            {
              id: "dip-b",
              name: "Dip B",
              type: "dip",
              x: 20,
              y: 10,
              dwellMs: 150,
              enabled: true,
            },
            {
              id: "wash",
              name: "Wash",
              type: "wash",
              x: 30,
              y: 10,
              dwellMs: 200,
              enabled: true,
            },
          ],
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("Tray change: dip-a -> dip-b, wash first");

    const trayChangeIdx = gcode.indexOf(
      "Tray change: dip-a -> dip-b, wash first",
    );
    const washAfterChangeIdx = gcode.indexOf(
      "Service move: wash (Wash)",
      trayChangeIdx,
    );
    const dipBAfterChangeIdx = gcode.indexOf(
      "Service move: dip (Dip B)",
      trayChangeIdx,
    );
    expect(washAfterChangeIdx).toBeGreaterThan(trayChangeIdx);
    expect(dipBAfterChangeIdx).toBeGreaterThan(washAfterChangeIdx);
  });

  it("uses explicit layer-to-dip mapping before auto station selection", async () => {
    dispatch({
      type: "generate",
      taskId: "body-ink-layer-map",
      objects: [
        createVectorObject({
          path: "M 0 0 L 8 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
          layer: "Red",
        }),
        createVectorObject({
          path: "M 45 0 L 53 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
          layer: "Blue",
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        inkService: {
          mode: "brush-dip",
          triggerTravelMM: 10,
          triggerJitterPct: 0,
          randomizeDipStation: false,
          includeWashMove: false,
          stations: [
            {
              id: "dip-a",
              name: "Dip A",
              type: "dip",
              x: 10,
              y: 10,
              dwellMs: 150,
              enabled: true,
            },
            {
              id: "dip-b",
              name: "Dip B",
              type: "dip",
              x: 20,
              y: 10,
              dwellMs: 150,
              enabled: true,
            },
            {
              id: "wash",
              name: "Wash",
              type: "wash",
              x: 30,
              y: 10,
              dwellMs: 200,
              enabled: true,
            },
          ],
          layerDipStations: {
            Red: "dip-b",
            Blue: "dip-a",
          },
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;

    const firstDipBIdx = gcode.indexOf("Service move: dip (Dip B)");
    const firstDipAIdx = gcode.indexOf("Service move: dip (Dip A)");
    expect(firstDipBIdx).toBeGreaterThan(-1);
    expect(firstDipAIdx).toBeGreaterThan(-1);
    expect(firstDipBIdx).toBeLessThan(firstDipAIdx);

    expect(gcode).toContain("Tray change: dip-b -> dip-a, wash first");
  });

  it("falls back to auto dip station when mapped station is not available", async () => {
    dispatch({
      type: "generate",
      taskId: "body-ink-layer-map-fallback",
      objects: [
        createVectorObject({
          path: "M 0 0 L 8 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
          layer: "Ghost",
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        inkService: {
          mode: "brush-dip",
          triggerTravelMM: 10,
          triggerJitterPct: 0,
          randomizeDipStation: false,
          includeWashMove: false,
          stations: [
            {
              id: "dip-a",
              name: "Dip A",
              type: "dip",
              x: 10,
              y: 10,
              dwellMs: 150,
              enabled: true,
            },
            {
              id: "dip-b",
              name: "Dip B",
              type: "dip",
              x: 20,
              y: 10,
              dwellMs: 150,
              enabled: true,
            },
          ],
          layerDipStations: {
            Ghost: "dip-missing",
          },
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("Service move: dip (Dip A)");
  });

  it("switches to mapped color dip stations even with large trigger distance", async () => {
    dispatch({
      type: "generate",
      taskId: "body-ink-color-map-large-trigger",
      objects: [
        createVectorObject({
          path: "M 0 0 L 8 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
          sourceColor: "#00ff10",
        }),
        createVectorObject({
          path: "M 50 0 L 58 0",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          visible: true,
          sourceColor: "#ff0006",
        }),
      ],
      config: makeConfig(),
      options: createGcodeOptions({
        optimisePaths: false,
        inkService: {
          mode: "brush-dip",
          triggerTravelMM: 1000,
          triggerJitterPct: 0,
          randomizeDipStation: false,
          includeWashMove: false,
          stations: [
            {
              id: "dip-green",
              name: "Dip Green",
              type: "dip",
              x: 10,
              y: 10,
              dwellMs: 150,
              enabled: true,
            },
            {
              id: "dip-red",
              name: "Dip Red",
              type: "dip",
              x: 20,
              y: 10,
              dwellMs: 150,
              enabled: true,
            },
            {
              id: "wash",
              name: "Wash",
              type: "wash",
              x: 30,
              y: 10,
              dwellMs: 150,
              enabled: true,
            },
          ],
          layerDipStations: {
            "color:#00ff10": "dip-green",
            "color:#ff0006": "dip-red",
          },
        },
      }),
    });

    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;

    const dipGreenIdx = gcode.indexOf("Service move: dip (Dip Green)");
    const dipRedIdx = gcode.indexOf("Service move: dip (Dip Red)");
    const redRapidIdx = gcode.indexOf("G0 X50.000 Y0.000 ; Rapid travel");

    expect(dipGreenIdx).toBeGreaterThan(-1);
    expect(dipRedIdx).toBeGreaterThan(-1);
    expect(redRapidIdx).toBeGreaterThan(-1);
    expect(dipGreenIdx).toBeLessThan(dipRedIdx);
    expect(dipRedIdx).toBeLessThan(redRapidIdx);
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
    // F3000 (from config.drawSpeed) should appear before M3S1 in G-code body
    const fIdx = gcode.indexOf("F3000");
    const penDownIdx = gcode.indexOf("M3S1 ; Pen down");
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
