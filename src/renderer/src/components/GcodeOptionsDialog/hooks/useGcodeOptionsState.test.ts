import { describe, expect, it } from "vitest";
import { togglePref } from "./useGcodeOptionsState";
import { DEFAULT_GCODE_PREFS } from "../../../features/gcode-options/gcodePrefs";

describe("togglePref", () => {
  const prefs = { ...DEFAULT_GCODE_PREFS, exportPerLayer: false, exportPerGroup: false, exportPerColor: false, exportPerHatch: false };

  it("turns the other split-output modes off when one is turned on", () => {
    const perGroup = togglePref({ ...prefs, exportPerLayer: true }, "exportPerGroup");
    expect([perGroup.exportPerLayer, perGroup.exportPerGroup, perGroup.exportPerColor]).toEqual([false, true, false]);
  });

  it("turns a split mode off without touching the others", () => {
    const off = togglePref({ ...prefs, exportPerColor: true }, "exportPerColor");
    expect([off.exportPerLayer, off.exportPerGroup, off.exportPerColor]).toEqual([false, false, false]);
  });

  it("keeps per-colour hatch files only while per-colour export is on", () => {
    expect(togglePref({ ...prefs, exportPerHatch: true }, "exportPerColor").exportPerHatch).toBe(true);
    expect(togglePref({ ...prefs, exportPerColor: true, exportPerHatch: true }, "exportPerLayer").exportPerHatch).toBe(false);
  });

  it("flips any other preference on its own", () => {
    expect(togglePref({ ...prefs, optimise: false }, "optimise").optimise).toBe(true);
  });
});
