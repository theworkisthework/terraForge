import { describe, expect, it } from "vitest";
import { buildGcodeOptions, type GcodeOptionsContext } from "./buildGcodeOptions";
import { DEFAULT_GCODE_PREFS, type GcodePrefs } from "../../gcode-options/gcodePrefs";

const ctx: GcodeOptionsContext = {
  terraForgeVersion: "1.2",
  firmwareVersion: "3.9",
  pageTemplate: { sizeId: "a4", landscape: false, marginMM: 15 },
  pageSizes: [{ id: "a4", name: "A4", widthMM: 210, heightMM: 297 }],
  vinyl: { bladeOffsetMM: 0.25, cornerAngleThresholdDeg: 30, microJogMagnitudeMM: 0.2 },
  inkServiceStations: [],
};
const build = (prefs: Partial<GcodePrefs>, context: Partial<GcodeOptionsContext> = {}) =>
  buildGcodeOptions({ ...DEFAULT_GCODE_PREFS, ...prefs }, { ...ctx, ...context });

describe("buildGcodeOptions", () => {
  it("clips to the page less its margin, or less a safety inset at the page edge", () => {
    expect(build({ clipMode: "margin" }).pageClip).toEqual({ widthMM: 210, heightMM: 297, marginMM: 15 });
    expect(build({ clipMode: "page", clipOffsetMM: 2 }).pageClip).toEqual({ widthMM: 210, heightMM: 297, marginMM: 2 });
    expect(
      build({ clipMode: "page" }, { pageTemplate: { sizeId: "a4", landscape: true, marginMM: 15 } }).pageClip,
    ).toMatchObject({ widthMM: 297, heightMM: 210 });
  });

  it("does not clip without a page, an unknown page size, or clipping turned off", () => {
    expect(build({ clipMode: "margin" }, { pageTemplate: null }).pageClip).toBeUndefined();
    expect(build({ clipMode: "margin" }, { pageSizes: [] }).pageClip).toBeUndefined();
    expect(build({ clipMode: "none" }).pageClip).toBeUndefined();
  });

  it("passes overrides only when they are turned on", () => {
    const on = build({
      penDownDelayOverrideEnabled: true,
      penDownDelayMs: 80,
      penUpDelayOverrideEnabled: true,
      penUpDelayMs: 40,
      drawSpeedOverrideEnabled: true,
      drawSpeedOverride: 1500,
    });
    expect(on).toMatchObject({ penDownDelayMsOverride: 80, penUpDelayMsOverride: 40, drawSpeedOverride: 1500 });
    const off = build({ penDownDelayOverrideEnabled: false, penUpDelayOverrideEnabled: false, drawSpeedOverrideEnabled: false });
    expect([off.penDownDelayMsOverride, off.penUpDelayMsOverride, off.drawSpeedOverride]).toEqual([undefined, undefined, undefined]);
  });

  it("cuts vinyl only when the app allows it and the job asks", () => {
    expect(build({ generateVinylCuttingGcode: true }).vinylCutting).toEqual(ctx.vinyl);
    expect(build({ generateVinylCuttingGcode: true }, { vinyl: null }).vinylCutting).toBeUndefined();
    expect(build({ generateVinylCuttingGcode: false }).vinylCutting).toBeUndefined();
    expect(build({ generateVinylWeedBorderGcode: true, vinylWeedBorderMarginMM: 3 }).vinylWeedBorder).toEqual({ marginMM: 3 });
  });

  it("carries ink service settings and the app's stations when enabled", () => {
    const stations = [{ id: "dip", name: "Dip", type: "dip" as const, x: 1, y: 2, dwellMs: 10 }];
    const ink = build(
      { inkServiceEnabled: true, inkServiceMode: "brush-dip", inkServiceLayerDipMap: { L1: "dip" } },
      { inkServiceStations: stations },
    ).inkService;
    expect(ink).toMatchObject({ mode: "brush-dip", stations, layerDipStations: { L1: "dip" } });
    expect(build({ inkServiceEnabled: false }).inkService).toBeUndefined();
  });
});
