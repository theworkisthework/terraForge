const STORAGE_KEY = "terraforge.gcodePrefs";

export interface GcodePrefs {
  optimise: boolean;
  uploadToSd: boolean;
  saveLocally: boolean;
  /** When true, generate a separate G-code file per layer group (multi-pen plots). */
  exportPerGroup: boolean;
  /** When true, generate a separate G-code file per source fill color. */
  exportPerColor: boolean;
  joinPaths: boolean;
  joinTolerance: number; // mm
  liftPenAtEnd: boolean;
  returnToHome: boolean;
  penDownDelayOverrideEnabled: boolean;
  penDownDelayMs: number;
  /** Override the machine's default drawing speed for this job only. */
  drawSpeedOverrideEnabled: boolean;
  /** Drawing speed override value in mm/min (used when drawSpeedOverrideEnabled is true). */
  drawSpeedOverride: number;
  customStartGcode: string;
  customEndGcode: string;
  /** How to clip G-code when a page template is active.
   *  "none"   — no page clip (machine bed only)
   *  "margin" — clip to the margin boundary shown on canvas
   *  "page"   — clip to the page edge (with optional clipOffsetMM safety inset) */
  clipMode: "none" | "page" | "margin";
  /** Safety inset in mm applied when clipMode is "page" (default 0). */
  clipOffsetMM: number;
}

export const DEFAULT_GCODE_PREFS: GcodePrefs = {
  optimise: true,
  uploadToSd: true,
  saveLocally: false,
  exportPerGroup: false,
  exportPerColor: false,
  joinPaths: false,
  joinTolerance: 0.2,
  liftPenAtEnd: true,
  returnToHome: false,
  penDownDelayOverrideEnabled: false,
  penDownDelayMs: 0,
  drawSpeedOverrideEnabled: false,
  drawSpeedOverride: 3000,
  customStartGcode: "",
  customEndGcode: "",
  clipMode: "none",
  clipOffsetMM: 0,
};

export function loadGcodePrefs(): GcodePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GcodePrefs>;
      return { ...DEFAULT_GCODE_PREFS, ...parsed };
    }
  } catch {
    // Corrupt data — fall back to defaults
  }
  return { ...DEFAULT_GCODE_PREFS };
}

export function saveGcodePrefs(prefs: GcodePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable — non-fatal
  }
}
