import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GCODE_PREFS, loadGcodePrefs, saveGcodePrefs } from "./gcodePrefs";

describe("gcodePrefs uploadSplitToFolder", () => {
  beforeEach(() => localStorage.clear());

  it("is on by default", () => {
    expect(DEFAULT_GCODE_PREFS.uploadSplitToFolder).toBe(true);
    expect(loadGcodePrefs().uploadSplitToFolder).toBe(true);
  });

  it("is on for prefs saved before the option existed", () => {
    localStorage.setItem("terraforge.gcodePrefs", JSON.stringify({ uploadToSd: false, exportPerColor: true }));
    const prefs = loadGcodePrefs();
    expect(prefs.uploadSplitToFolder).toBe(true);
    expect(prefs.uploadToSd).toBe(false);
  });

  it("keeps a saved choice of off", () => {
    saveGcodePrefs({ ...DEFAULT_GCODE_PREFS, uploadSplitToFolder: false });
    expect(loadGcodePrefs().uploadSplitToFolder).toBe(false);
  });
});
