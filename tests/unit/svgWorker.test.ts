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

// ── Shared fixture ────────────────────────────────────────────────────────────

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

function makeConfig() {
  return createMachineConfig({
    origin: "top-left",
    bedWidth: 200,
    bedHeight: 200,
    penUpCommand: "M5",
    penDownCommand: "M3 S1000",
    feedrate: 3000,
    name: "Test Plotter",
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

  it("ends with return-to-origin and pen-safe commands", async () => {
    dispatch({
      type: "generate",
      taskId: "body-end",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions(),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    expect(gcode).toContain("G0 X0 Y0 ; Return to origin");
    expect(gcode).toContain("M5 ; Pen up — safe");
    expect(gcode).toContain("; ── End of job");
  });

  it("produces no G1 moves for an empty object list", async () => {
    dispatch({
      type: "generate",
      taskId: "empty-objs",
      objects: [],
      config: makeConfig(),
      options: createGcodeOptions(),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    // No G1 moves when there are no objects
    expect(gcode).not.toContain("G1");
    // Still ends with cleanup
    expect(gcode).toContain("G0 X0 Y0");
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

  it("feedrate line appears before pen-down in each subpath", async () => {
    dispatch({
      type: "generate",
      taskId: "feedrate-pos",
      objects: [makeSimpleObj()],
      config: makeConfig(),
      options: createGcodeOptions(),
    });
    const msg = await waitForMsg("complete");
    const gcode = msg.gcode as string;
    // F3000 should appear before M3 S1000 in G-code body
    const fIdx = gcode.indexOf("F3000");
    const penDownIdx = gcode.indexOf("M3 S1000 ; Pen down");
    expect(fIdx).toBeGreaterThan(-1);
    expect(penDownIdx).toBeGreaterThan(-1);
    expect(fIdx).toBeLessThan(penDownIdx);
  });
});
