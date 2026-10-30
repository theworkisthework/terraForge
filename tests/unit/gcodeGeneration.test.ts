import { describe, expect, it } from "vitest";
import { approximateObjectSubpaths, collectGeometry, remapLayerMetadata } from "../../src/workers/generation/collect";
import { resolveGenerationSettings } from "../../src/workers/generation/document";
import { createGcodeOptions, createMachineConfig, createVectorObject } from "../helpers/factories";

const config = createMachineConfig({ origin: "bottom-left", bedWidth: 200, bedHeight: 200 });
const noHooks = { isCancelled: () => false, afterEach: async () => {} };

describe("collectGeometry", () => {
  it("skips hidden objects, batches by colour, and closes each batch with a comment", async () => {
    const lines: string[] = [];
    const result = await collectGeometry(
      [
        createVectorObject({ path: "M0 0 L10 0", sourceColor: "#ff0000" }),
        createVectorObject({ path: "M0 5 L10 5", sourceColor: "#0000ff" }),
        createVectorObject({ path: "M0 9 L10 9", sourceColor: "#ff0000" }),
        createVectorObject({ path: "M0 7 L10 7", visible: false }),
      ],
      config,
      createGcodeOptions(),
      lines,
      noHooks,
    );
    expect(result!.subpaths.map((sp) => sp.color)).toEqual(["#0000ff", "#ff0000", "#ff0000"]);
    expect(lines).toEqual(["; -- Color: #0000ff (1 object) --", "; -- Color: #ff0000 (2 objects) --"]);
  });

  it("repeats an object's strokes for each pass", async () => {
    const result = await collectGeometry([createVectorObject({ path: "M0 0 L10 0", passCount: 3 })], config, undefined, [], noHooks);
    expect(result!.subpaths).toHaveLength(3);
  });

  it("keeps a point tap only where it lands on the bed, tapping once per pass", async () => {
    const result = await collectGeometry(
      [
        createVectorObject({ path: "", pointTap: { x: 5, y: 5 }, passCount: 2 }),
        createVectorObject({ path: "", pointTap: { x: 5, y: 5 }, x: 500 }),
      ],
      config,
      undefined,
      [],
      noHooks,
    );
    expect(result!.points).toHaveLength(1);
    expect(result!.points[0].repeats).toBe(2);
  });

  it("stops between objects when cancelled", async () => {
    let checks = 0;
    const objects = [createVectorObject(), createVectorObject(), createVectorObject()];
    const result = await collectGeometry(objects, config, undefined, [], { ...noHooks, isCancelled: () => ++checks > 1 });
    expect(result).toBeNull();
  });
});

describe("remapLayerMetadata", () => {
  const sp = (points: [number, number][], layer?: string, color?: string) => ({
    points: points.map(([x, y]) => ({ x, y })),
    layer,
    color,
  });

  it("gives a reordered or reversed stroke the layer and colour of the stroke it came from", () => {
    const before = [sp([[0, 0], [10, 0]], "L1", "#ff0000"), sp([[50, 50], [60, 50]], "L2", "#0000ff")];
    const after = [[{ x: 60, y: 50 }, { x: 50, y: 50 }], [{ x: 0, y: 0 }, { x: 10, y: 0 }]];
    expect(remapLayerMetadata(before, after).map(({ layer, color }) => [layer, color])).toEqual([
      ["L2", "#0000ff"],
      ["L1", "#ff0000"],
    ]);
  });

  it("returns bare strokes when there was nothing to carry over", () => {
    expect(remapLayerMetadata([], [[{ x: 1, y: 1 }]])).toEqual([{ points: [{ x: 1, y: 1 }] }]);
  });
});

describe("approximateObjectSubpaths", () => {
  it("draws each command straight to its end point, closing on Z and splitting on M", () => {
    const obj = createVectorObject({ path: "M0 0 C1 1 2 2 10 0 Q5 5 10 10 Z M20 20 A5 5 0 0 1 30 20 H40 V30" });
    const subpaths = approximateObjectSubpaths(obj, config).map((sp) => sp.map(({ x, y }) => [Math.round(x), Math.round(y)]));
    expect(subpaths).toHaveLength(2);
    expect(subpaths[0]).toHaveLength(4); // start, curve end, quad end, back to start
    expect(subpaths[0][3]).toEqual(subpaths[0][0]);
    expect(subpaths[1]).toHaveLength(4); // start, arc end, H, V
  });

  it("ignores incomplete groups and a lone move", () => {
    const obj = createVectorObject({ path: "M0 0 L5 M9 9" });
    expect(approximateObjectSubpaths(obj, config)).toEqual([]);
  });
});

describe("resolveGenerationSettings pen delays", () => {
  it("uses the job's override, else the machine's delay for pen types that need one", () => {
    const servo = createMachineConfig({ penType: "servo", penDownDelayMs: 80, penUpDelayMs: 30 });
    const stepper = createMachineConfig({ penType: "stepper", penDownDelayMs: 80, penUpDelayMs: 30 });
    expect(resolveGenerationSettings(servo, createGcodeOptions())).toMatchObject({ penDownDelayMs: 80, penUpDelayMs: 30 });
    expect(resolveGenerationSettings(stepper, createGcodeOptions())).toMatchObject({ penDownDelayMs: 0, penUpDelayMs: 0 });
    expect(
      resolveGenerationSettings(stepper, createGcodeOptions({ penDownDelayMsOverride: 120, penUpDelayMsOverride: -5 })),
    ).toMatchObject({ penDownDelayMs: 120, penUpDelayMs: 0 });
  });

  it("draws at the job's speed override when set", () => {
    expect(resolveGenerationSettings(config, createGcodeOptions({ drawSpeedOverride: 1234 })).drawSpeed).toBe(1234);
    expect(resolveGenerationSettings(config, undefined).drawSpeed).toBe(config.drawSpeed);
  });
});
